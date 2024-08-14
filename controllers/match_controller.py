from fastapi import FastAPI, HTTPException, APIRouter, Depends, WebSocket, WebSocketDisconnect
from datetime import datetime, date
from typing import List, Dict, Tuple, Set
from controllers.diary_controller import get_diary_entries
from dependencies import get_db, get_current_user
from models.diary import PresigneUrlRequest, DiaryEntryResponse, DiaryEntryRequest
from models.match import MatchResponse
from pydantic import BaseModel, Field
import mysql.connector
import pytz


class User:
    def __init__(self, id: int):
        self.id = id
        self.diary_entries: List[DiaryEntryResponse] = []
        self.posting_frequency: float = 0.0
        self.last_matched: Optional[date] = None
        self.current_exchange_partner: Optional[int] = None
        self.pending_requests: List[int] = []  # 新增：儲存待處理的請求ID

    def add_diary_entry(self, entry: DiaryEntryResponse):
        self.diary_entries.append(entry)

    def calculate_posting_frequency(self):
        if not self.diary_entries:
            self.posting_frequency = 0.0
            return

        earliest_date = min(datetime.strptime(entry.date, "%Y-%m-%d").date() for entry in self.diary_entries)
        latest_date = max(datetime.strptime(entry.date, "%Y-%m-%d").date() for entry in self.diary_entries)
        date_range = (latest_date - earliest_date).days + 1
        self.posting_frequency = len(self.diary_entries) / date_range if date_range > 0 else 0.0

    def get_all_keywords(self) -> Set[str]:
        all_content = " ".join([entry.content for entry in self.diary_entries])
        words = all_content.lower().split()
        return set(word for word in words if len(word) > 3 and word not in ['and', 'the', 'is', 'in', 'to', 'for'])



async def daily_matching(db: mysql.connector.connection.MySQLConnection = Depends(get_db), target_keyword: str = None) -> List[Tuple[User, User]]:
    cursor = db.cursor(dictionary=True)
    today = datetime.now(pytz.utc).date()
    cursor.execute("""
        SELECT u.id, um.partner_id, um.match_date 
        FROM users u 
        LEFT JOIN user_matches um ON u.id = um.user_id AND um.match_date = %s
    """, (today,))
    user_data = cursor.fetchall()
    cursor.close()

    users = []
    for data in user_data:
        user = User(data['id'])
        user.last_matched = data.get('match_date')
        user.current_exchange_partner = data.get('partner_id')

        if user.last_matched == today or user.current_exchange_partner is not None:
            continue

        diary_entries = await get_diary_entries(skip=0, limit=100, current_user={"id": user.id}, db=db)
        for entry in diary_entries:
            user.add_diary_entry(entry)
        user.calculate_posting_frequency()
        users.append(user)    

    matches = []
    while len(users) >= 2:
        user1 = users.pop()
        best_match = max(users, key=lambda u: calculate_similarity(user1, u, target_keyword))
        users.remove(best_match)
        matches.append((user1, best_match))

        # 更新用戶的匹配狀態
        update_user_match_status(db, user1.id, best_match.id, today)
        update_user_match_status(db, best_match.id, user1.id, today)

    return matches

def update_user_match_status(db: mysql.connector.connection.MySQLConnection, user_id: int, partner_id: int, match_date: date):
    cursor = db.cursor()
    try:
        cursor.execute(
            "INSERT INTO user_matches (user_id, partner_id, match_date) VALUES (%s, %s, %s)",
            (user_id, partner_id, match_date)
        )
        db.commit()
    except mysql.connector.Error as err:
        print(f"Error: {err}")
        db.rollback()
    finally:
        cursor.close()

def calculate_similarity(user1: User, user2: User, target_keyword: str=None) -> float:
    # common_interests = set(user1.interests) & set(user2, interests)
    # interest_similarity = len(common_interests)/max(len(user1.interests), len(user2.interests), 1)

    # # K寫作相似度
    # style_similarity = sum(min(user1.writing_style.get(k, 0), user2.writing_style.get(k, 0))
    #                         for k in set(user1.writing_style) | set(user2.writing_style))

    user1_keywords = user1.get_all_keywords()
    user2_keywords = user1.get_all_keywords()
    all_keywords = user1_keywords | user2_keywords

    # 先設定target_keyword
    # target_keyword = "olympic"
    if not all_keywords:
        keyword_similarity = 0
    else:
        keyword_weights = { k:3 if k == target_keyword else 1 for k in all_keywords}
        weighted_common_keywords = sum(keyword_weights[k] for k in user1_keywords & user2_keywords)
        total_weighted_keywords = sum(keyword_weights.values())
        keyword_similarity = (weighted_common_keywords/total_weighted_keywords) if total_weighted_keywords > 0 else 0

    # 計算發文頻率相似度
    freq_diff = abs(user1.posting_frequency - user2.posting_frequency)
    freq_similarity = 1 / (1 + freq_diff)  # 頻率差異越小，相似度越高

    return 0.7 * keyword_similarity + 0.3 * freq_similarity


router = APIRouter()

@router.get("/daily_matches", response_model=List[Dict[str, int]])
async def get_daily_matches(
    current_user: Dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    try:
        matches = await daily_matching(db, target_keyword="olympic")  # 使用 "olympic" 作為示例
        return [{"user1_id": match[0].id, "user2_id": match[1].id} for match in matches]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"匹配過程中發生錯誤: {str(e)}")


@router.post("/matching/request")
async def send_matching_request(
    partner_id: int,
    current_user: dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):

    cursor = db.cursor(dictionary=True)
    
    # 檢查是否已經存在未處理的請求
    cursor.execute(
        "SELECT * FROM user_matches WHERE user_id = %s AND partner_id = %s AND status = 'pending'",
        (current_user['id'], partner_id)
    )
    existing_request = cursor.fetchone()
    
    if existing_request:
        raise HTTPException(status_code=400, detail="已經存在一個待處理的配對請求")
    
    # 創建新的配對請求
    cursor.execute(
        "INSERT INTO user_matches (user_id, partner_id, match_date, status) VALUES (%s, %s, CURDATE(), 'pending')",
        (current_user['id'], partner_id)
    )
    db.commit()
    cursor.close()
    
    return {"message": "配對請求已發送"}


@router.get("/matching/requests")
async def get_matching_requests(
    current_user: dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    cursor = db.cursor(dictionary=True)
    cursor.execute("""
        SELECT um.*, u.name as user_name 
        FROM user_matches um
        JOIN users u ON um.user_id = u.id
        WHERE um.partner_id = %s AND um.status = 'pending'
    """, (current_user['id'],))
    requests = cursor.fetchall()
    cursor.close()
    
    return requests


@router.put("/matching/respond/{request_id}")
async def respond_to_matching_request(
    request_id: int,
    response: MatchResponse,
    current_user: dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    if response.action not in ['accept', 'reject']:
        raise HTTPException(status_code=400, detail="無效的操作")
    
    cursor = db.cursor(dictionary=True)
    cursor.execute(
        "SELECT * FROM user_matches WHERE id = %s AND partner_id = %s",
        (request_id, current_user['id'])
    )
    request = cursor.fetchone()
    
    if not request:
        raise HTTPException(status_code=404, detail="找不到配對請求")
    
    new_status = 'accepted' if response.action == 'accept' else 'rejected'
    cursor.execute(
        "UPDATE user_matches SET status = %s WHERE id = %s",
        (new_status, request_id)
    )
    
    if response.action == 'accept':
        # 如果接受，創建反向匹配記錄
        cursor.execute(
            "INSERT INTO user_matches (user_id, partner_id, match_date, status) VALUES (%s, %s, CURDATE(), 'accepted')",
            (current_user['id'], request['user_id'])
        )
        # 通過WebSocket發送通知
        await manager.send_personal_message(f"User {current_user['id']} accepted your match request", request['user_id'])
    else:
        # 如果拒絕，也發送通知
        await manager.send_personal_message(f"User {current_user['id']} rejected your match request", request['user_id'])

    db.commit()
    cursor.close()
    
    return {"message": f"Let's start MOODs together!"}      


@router.post("/matching/request_exchange")
async def request_exchange(
    current_user: dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    cursor = db.cursor(dictionary=True)
    
    try:
        # 檢查用戶是否已經有待處理的請求
        cursor.execute(
            "SELECT * FROM user_matches WHERE user_id = %s AND status = 'pending'",
            (current_user['id'],)
        )
        existing_request = cursor.fetchone()
        
        if existing_request:
            return {"message": "已經存在一個待處理的配對請求", "status": "pending"}
        
        # 尋找可配對的用戶
        cursor.execute("""
            SELECT id FROM users 
            WHERE id != %s 
            AND id NOT IN (SELECT partner_id FROM user_matches WHERE user_id = %s)
            ORDER BY RAND() LIMIT 1
        """, (current_user['id'], current_user['id']))
        
        partner = cursor.fetchone()
        
        if not partner:
            return {"message": "目前沒有可配對的用戶", "status": "no_match"}
        
        # 創建新的配對請求
        cursor.execute(
            "INSERT INTO user_matches (user_id, partner_id, match_date, status) VALUES (%s, %s, %s, 'pending')",
            (current_user['id'], partner['id'], datetime.now(pytz.utc).date())
        )
        db.commit()
        
        return {"message": "Your match request is on its way!", "status": "success", "partner_id": partner['id']}
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        cursor.close()

@router.get("/matching/status")
async def get_matching_status(
    current_user: dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    cursor = db.cursor(dictionary=True)
    
    try:
        # 檢查用戶的配對狀態
        cursor.execute(
            "SELECT * FROM user_matches WHERE user_id = %s ORDER BY match_date DESC LIMIT 1",
            (current_user['id'],)
        )
        match = cursor.fetchone()
        
        if not match:
            return {"status": "no_match"}
        
        return {
            "status": match['status'],
            "partner_id": match['partner_id'],
            "match_date": match['match_date']
        }
    
    finally:
        cursor.close()

@router.get("/get_partner_diary/{partner_id}", response_model=List[DiaryEntryResponse])
async def get_partner_diary(
    partner_id: int,
    current_user: dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    try:
        cursor = db.cursor(dictionary=True)
        # 檢查是否有與該夥伴的有效匹配
        cursor.execute("""
            SELECT * FROM user_matches 
            WHERE (user_id = %s AND partner_id = %s) OR (user_id = %s AND partner_id = %s)
            AND status = 'accepted'
        """, (current_user['id'], partner_id, partner_id, current_user['id']))
        
        match = cursor.fetchone()
        if not match:
            raise HTTPException(status_code=403, detail="You are not matched with this user")

        cursor.fetchall()

        # 獲取夥伴的日記
        cursor.execute("""
            SELECT d.id, d.user_id, d.title, d.content, d.image_url, d.is_public, 
                   d.date, d.created_at, d.updated_at, u.email
            FROM diary_entries d
            JOIN users u ON d.user_id = u.id
            WHERE d.user_id = %s 
            ORDER BY d.date DESC 
            LIMIT 5
        """, (partner_id,))
        
        entries = cursor.fetchall()
        # 轉換日期和時間格式
        for entry in entries:
            entry['date'] = entry['date'].isoformat()
            entry['created_at'] = entry['created_at'].isoformat()
            entry['updated_at'] = entry['updated_at'].isoformat()
            # is_public 會由 Pydantic 驗證器自動處理
        return [DiaryEntryResponse(**entry) for entry in entries]

    except mysql.connector.Error as e:
        print(f"Database error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
    finally:
        cursor.close()

# websocket================
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: int):
        if user_id in self.active_connections:
            del self.active_connections[user_id]

    async def send_personal_message(self, message: str, user_id: int):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_text(message)

manager = ConnectionManager()

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            # 處理接收到的消息(如果需要)
    except WebSocketDisconnect:
        manager.disconnect(user_id)
