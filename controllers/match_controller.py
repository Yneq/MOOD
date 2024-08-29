from fastapi import FastAPI, HTTPException, APIRouter, Depends, WebSocket, WebSocketDisconnect
from datetime import datetime, date
from typing import List, Dict, Tuple, Set, Any
from controllers.diary_controller import get_diary_entries
from dependencies import get_db, get_current_user
from models.diary import PresigneUrlRequest, DiaryEntryResponse, DiaryEntryRequest
from models.match import MatchResponse
from pydantic import BaseModel, Field
import mysql.connector
import pytz
import logging
import traceback
from contextlib import closing
from mysql.connector import pooling, Error
import redis.asyncio as redis
import json



logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)



class User:
    def __init__(self, id: int):
        self.id = id
        self.diary_entries: List[DiaryEntryResponse] = []
        self.posting_frequency: float = 0.0
        self.last_matched: Optional[date] = None
        self.current_exchange_partner: Optional[int] = None
        self.pending_requests: List[int] = []  # 新增：儲存待處理的請求ID
        self.like_count: int = 0
        self.weather_counts: Dict[str, int] = {
                        'sunny': 0, 'cloudy': 0, 'rainy': 0, 'snowy': 0, 'windy': 0
        }
        self.mood_score: float = 0.0



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
        SELECT users.id,
        user_matches.partner_id,
        user_matches.match_date,
        COUNT(likes.user_id) as like_count,
        AVG(mood_entries.mood_score) as avg_mood_score,
        SUM(CASE WHEN mood_entries.weather = 'sunny' THEN 1 ELSE 0 END) as sunny_count,
               SUM(CASE WHEN mood_entries.weather = 'cloudy' THEN 1 ELSE 0 END) as cloudy_count,
               SUM(CASE WHEN mood_entries.weather = 'rainy' THEN 1 ELSE 0 END) as rainy_count,
               SUM(CASE WHEN mood_entries.weather = 'snowy' THEN 1 ELSE 0 END) as snowy_count,
               SUM(CASE WHEN mood_entries.weather = 'windy' THEN 1 ELSE 0 END) as windy_count
        FROM users
        LEFT JOIN user_matches ON users.id = user_matches.user_id AND user_matches.match_date = %s
        LEFT JOIN likes ON likes.user_id = users.id
        LEFT JOIN mood_entries ON mood_entries.user_id = users.id
        WHERE mood_entries.date >= %s
        GROUP BY users.id, user_matches.partner_id, user_matches.match_date
    """, (today, today-timedelta(days=30)))

    user_data = cursor.fetchall()
    cursor.close()

    users = []
    for data in user_data:
        user = User(data['id'])
        user.last_matched = data.get('match_date')
        user.current_exchange_partner = data.get('partner_id')
        user.like_count = data.get('like_count') or 0
        user.avg_mood_score = data.get('avg_mood_score') or 0
        user.weather_counts = {
            'sunny': data.get('sunny_count') or 0,
            'cloudy': data.get('cloudy_count') or 0,
            'rainy': data.get('rainy_count') or 0,
            'snowy': data.get('snowy_count') or 0,
            'windy': data.get('windy_count') or 0
        }


        if user.last_matched == today or user.current_exchange_partner is not None:
            continue

        diary_entries = await get_diary_entries(skip=0, limit=100, current_user={"id": user.id}, db=db)
        for entry in diary_entries:
            user.diary_entry.append(diary_entries)
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

def calculate_similarity(user1: User, user2: User, target_keyword: str=None) -> float:
    user1_keywords = user1.get_all_keywords()
    user2_keywords = user1.get_all_keywords()
    all_keywords = user1_keywords | user2_keywords

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

    # 計算點讚數相似度（希望活潑的配對不那麼活潑的）
    like_diff = abs(user1.like_count-user2.like_count)
    like_similarity = 1/(like_diff + 1)

    # 計算天氣偏好相似度（希望天氣相似的配對）
    all_weather_types = set(user1.weather_counts.keys()) | set(user2.weather_counts.keys())

    similarity = sum(min(user1.weather_counts.get(w, 0), user2.weather_counts.get(w, 0)) for w in all_weather_types)
    total_weather = sum(user1.weather_counts.values()) + sum(user2.weather_counts.values())

    weather_similarity = similarity / total_weather if total_weather > 0 else 0

    # 計算心情分數相似度（希望心情好的配對心情不好的）
    mood_diff = abs(user1.avg_mood_score - user2.avg_mood_score)
    mood_similarity = 1/(mood_diff + 1)

    return (
        0.25 * keyword_similarity +
        0.20 * freq_similarity +
        0.15 * like_similarity +
        0.20 * weather_similarity +
        0.20 * mood_similarity
    )


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


@router.get("/matching/requests")
async def get_matching_requests(current_user: dict = Depends(get_current_user), db: mysql.connector.connection.MySQLConnection = Depends(get_db)):
    
    cursor = db.cursor(dictionary=True)
    try:  #抓取pending表裡面 requester 的名字
        cursor.execute("""
            SELECT user_match_requests.*, name as user_name
            FROM user_match_requests
            JOIN users ON user_match_requests.requester_id = users.id
            WHERE user_match_requests.recipient_id = %s AND user_match_requests.status = 'pending'
        """, (current_user['id'],))

        requests = cursor.fetchall()
        return requests
        
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/matching/respond/{requester_id}")
async def respond_to_matching_request(
    requester_id: int,
    response: MatchResponse,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: pooling.PooledMySQLConnection = Depends(get_db)
):
    logger.debug(f"開始處理用戶 {requester_id} 的配對回應")
    if response.action not in ['accept', 'reject']:
        raise HTTPException(status_code=400, detail="無效的操作")

    try:
        with db.cursor(dictionary=True) as cursor:
            # 檢查當前用戶
            cursor.execute("SELECT name FROM users WHERE id = %s", (current_user['id'],))
            result = cursor.fetchone()
            if not result:
                raise HTTPException(status_code=404, detail="找不到當前用戶")
            current_user_name = result['name']

            # 檢查配對請求
            cursor.execute("""
                SELECT * FROM user_match_requests 
                WHERE requester_id = %s AND recipient_id = %s AND status = 'pending'
            """, (requester_id, current_user['id']))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="找不到配對請求或您沒有權限回應此請求")

            if response.action == 'accept':
                # 檢查是否有活躍的匹配
                cursor.execute("""
                    SELECT * FROM users
                    WHERE id IN (%s, %s) AND is_matching = 1
                """, (requester_id, current_user['id']))
                if cursor.fetchone():
                    raise HTTPException(status_code=400, detail="您或您的夥伴已經有一個活躍的匹配")

                # 更新請求狀態和創建新的匹配
                cursor.execute("""
                    UPDATE user_match_requests 
                    SET status = 'accepted' 
                    WHERE requester_id = %s AND recipient_id = %s
                """, (requester_id, current_user['id']))
                cursor.fetchone()  # 讀取空結果集

                cursor.execute("""
                    UPDATE users 
                    SET is_matching = 1 
                    WHERE id IN (%s, %s)
                """, (requester_id, current_user['id']))
                cursor.fetchone()  # 讀取空結果集

                cursor.execute("""
                    INSERT INTO user_matches 
                    (user_id, partner_id, match_date, status) 
                    VALUES (%s, %s, CURDATE(), 'accepted'),
                           (%s, %s, CURDATE(), 'accepted')
                """, (current_user['id'], requester_id, requester_id, current_user['id']))
                cursor.fetchone()  # 讀取空結果集

            else:  # reject
                logger.debug("處理拒絕操作")
                cursor.execute("""
                    UPDATE users 
                    SET is_matching = 0 
                    WHERE id IN (%s, %s)
                """, (requester_id, current_user['id']))
                cursor.fetchone()  # 讀取空結果集

                cursor.execute("""
                    INSERT INTO user_matches 
                    (user_id, partner_id, match_date, status) 
                    VALUES (%s, %s, CURDATE(), 'rejected'),
                           (%s, %s, CURDATE(), 'rejected')
                """, (current_user['id'], requester_id, requester_id, current_user['id']))
                cursor.fetchone()  # 讀取空結果集

            # 刪除配對請求
            cursor.execute("""
                DELETE FROM user_match_requests 
                WHERE requester_id = %s AND recipient_id = %s
            """, (requester_id, current_user['id']))
            cursor.fetchone()  # 讀取空結果集

        db.commit()
        logger.debug("任務提交成功")

        # 清除相關的快取
        await redis_client.delete(f"match_status:{current_user['id']}")
        await redis_client.delete(f"match_status:{requester_id}")
        
        return {"message": f"Scucessfully {response.action}ed the match request"}

    except mysql.connector.Error as e:
        logger.error(f"數據庫錯誤: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"處理請求時發生數據庫錯誤: {str(e)}")
    except Exception as e:
        logger.error(f"未知錯誤: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"處理請求時發生未知錯誤: {str(e)}")
    finally:
        logger.debug("數據庫操作完成")


@router.post("/matching/request_exchange")
async def request_exchange(
    current_user: dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    cursor = db.cursor(dictionary=True)
    
    try:
        cursor.execute("""
            SELECT partner_id from user_matches WHERE user_id =%s
            AND status = 'accepted'
            ORDER BY created_at DESC LIMIT 1
        """, (current_user['id'],)) 
        result = cursor.fetchone()

        if result:
            partner_id = result['partner_id']
            cursor.execute("UPDATE users SET is_matching = 0 WHERE id IN (%s, %s)", (current_user['id'], partner_id))
                        # 清除匹配夥伴的快取
            await redis_client.delete(f"match_status:{partner_id}")
        else:
            cursor.execute("UPDATE users SET is_matching = 0 WHERE id = %s", (current_user['id'],))
                        # 清除匹配夥伴的快取

        # 檢查用戶在過去 3 天內的配對次數
        cursor.execute("""
            SELECT COUNT(*) as match_count
            FROM user_matches
            WHERE user_id = %s AND match_date >= DATE_SUB(CURDATE(), INTERVAL 3 DAY)
        """, (current_user['id'],))
        
        match_count = cursor.fetchone()['match_count']
        
        if match_count >= 3:
            return {"message": "You have reached the maximum number of matches in the past 3 days", "status": "limit_reached"}
            
        # 檢查用戶是否已經有待處理的請求
        cursor.execute("""
            SELECT * FROM user_match_requests 
            WHERE (requester_id = %s OR recipient_id = %s) AND status = 'pending'
        """, (current_user['id'], current_user['id']))
        
        existing_request = cursor.fetchone()
        
        if existing_request:
            return {"message": "已經存在一個待處理的配對請求", "status": "pending"}
        
        # 尋找可配對的用戶
        cursor.execute("""
            SELECT id, name
            FROM users 
            WHERE id != %s 
            AND is_matching = 0 
            AND id NOT IN (SELECT requester_id FROM user_match_requests WHERE status = 'pending')
            AND id NOT IN (SELECT recipient_id FROM user_match_requests WHERE status = 'pending')
            ORDER BY RAND() 
            LIMIT 1
        """, (current_user['id'],))
        
        partner = cursor.fetchone()
        
        if not partner:
            return {"message": "No MOODs buddy Now", "status": "no_match"}
        
        # 創建新的配對請求
        cursor.execute(
            "INSERT INTO user_match_requests (requester_id, recipient_id, request_date, status) VALUES (%s, %s, CURDATE(), 'pending')",
            (current_user['id'], partner['id'])
        )

        db.commit()

        # 清除相關的快取
        await redis_client.delete(f"match_status:{current_user['id']}")
        await redis_client.delete(f"match_status:{partner['id']}")

        return {"message": "Your match request is on its way!", "status": "success", "partner_id": partner['id']}
        
    except mysql.connector.Error as e:
        db.rollback()
        logger.error(f"Database error in request_exchange: {str(e)}")
        raise HTTPException(status_code=500, detail="資料庫錯誤，請稍後再試")
    except Exception as e:
        db.rollback()
        logger.error(f"Database error in request_exchange: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        cursor.close()

@router.get("/matching/status")
async def get_matching_status(
    current_user: dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    cache_key = f"match_status:{current_user['id']}"

    cached_status = await redis_client.get(cache_key)
    if cached_status:
        print(f"Cache hit: {cache_key}")  # 調試信息
        return json.loads(cached_status)

    print(f"Cache miss: {cache_key}")  # 調試信息

    cursor = db.cursor(dictionary=True)
    
    try:
    # 獲取用戶當前狀態和最新的match記錄，有雙方的is_matching
    # 第一個LEFT JOIN獲取最新的一個match
    # 第二個LEFT JOIN獲取匹配夥伴的資料
        cursor.execute("""
            SELECT users.is_matching, 
            user_matches.id as match_id, user_matches.status as match_status, 
            user_matches.partner_id, user_matches.created_at,
            users_partner.name as partner_name, users_partner.is_matching as partner_is_matching
        FROM users
        LEFT JOIN (
            SELECT * FROM user_matches
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT 1
        ) user_matches ON users.id = user_matches.user_id
        LEFT JOIN users users_partner ON user_matches.partner_id = users_partner.id
        WHERE users.id = %s
        """, (current_user['id'], current_user['id']))
    
        user_info = cursor.fetchone()

            # 檢查是否存在user_matches.id
        if user_info['match_id'] is not None:
            if user_info['is_matching'] == 1:
                # 檢查最新user_matches裡有沒有accepted
                cursor.execute("""
                    SELECT id, status FROM user_matches
                    WHERE (user_id = %s AND partner_id = %s) OR (user_id = %s AND partner_id = %s)
                    ORDER BY created_at DESC
                    LIMIT 1
                """, (current_user['id'], user_info['partner_id'], user_info['partner_id'], current_user['id']))
                latest_match = cursor.fetchone()
            
                if latest_match and latest_match['status'] == 'accepted':
                    # # 確保雙方的 is_matching 狀態一致，為了解決當 B 接受後立即調用 checkMatchStatus()，發現 A 的 is_matching 仍為 0（可能是由於數據庫更新的延遲）
                    # cursor.execute("UPDATE users SET is_matching = 1 WHERE id IN (%s, %s)", (current_user['id'], user_info['partner_id']))
                    # db.commit()
                    # 匹配有效
                    status = {
                        "status": "accepted",
                        "partner_id": user_info['partner_id'],
                        "partner_name": user_info['partner_name'],
                        "match_date": user_info['created_at'].isoformat() if user_info['created_at'] else None
                    }
                    await redis_client.set(cache_key, json.dumps(status), ex=3600)
                    return status
                # 如果 is_matching 不為 1 或匹配狀態不為 'accepted'
            cursor.execute("UPDATE users SET is_matching = 0 WHERE id = %s", (current_user['id'],))
            db.commit()
            await redis_client.set(cache_key, json.dumps(status), ex=3600)  # 1小時過期
            return {"status": "match_expired", "message": "Your previous match has expired. Click EXCHANGE to find a new diary buddy!"}
        else:
            # 沒有匹配記錄
            return {"status": "no_match", "message": "You don't have any current matches. Click EXCHANGE to find a diary buddy!"}

        # 用戶當前is_matching=0，檢查是否有待處理的請求
        cursor.execute("""
            SELECT 'outgoing' as request_type, recipient_id, requester_id
            FROM user_match_requests 
            WHERE requester_id = %s AND status = 'pending'
            UNION
            SELECT 'incoming' as request_type, recipient_id, requester_id
            FROM user_match_requests 
            WHERE recipient_id = %s AND status = 'pending'
        """, (current_user['id'], current_user['id']))

        pending_request = cursor.fetchone()

        if pending_request:
            if pending_request['request_type'] == 'outgoing':
                return {
                    "status": "pending", 
                    "message": "You have a pending outgoing match request",
                    "recipient_id": pending_request.get('recipient_id')
                }
            elif pending_request['request_type'] == 'incoming':
                requester_id = pending_request.get('requester_id')
                if requester_id:
                    cursor.execute("SELECT name FROM users WHERE id = %s", (requester_id,))

                    requester_data = cursor.fetchone()
                    requester_name = requester_data['name'] if requester_data else "Unknown"

                    return {
                        "status": "incoming_request",
                        "message": f"You have a pending incoming match request from {requester_name}",
                        "requester_id": requester_id,
                        "requester_name": requester_name
                    }
                else:
                    print(f"Error: requester_id not found in pending_request: {pending_request}")
                    await redis_client.set(cache_key, json.dumps(status), ex=600)  # 10分鐘過期
                    return {"status": "error", "message": "Invalid request data"}

        await redis_client.set(cache_key, json.dumps(status), ex=3600)  # 1小時過期
        return {"status": "no_match", "message": "NO partner matched yet. Click EXCHANGE to find a diary buddy!"}
    except Exception as e:
        print(f"Error in get_matching_status: {str(e)}")
        return {"status": "error", "detail": f"Unexpected error: {str(e)}"}
    finally:
        cursor.close()






@router.get("/get_partner_diary/{partner_id}", response_model=List[DiaryEntryResponse])
async def get_partner_diary(
    partner_id: int,
    current_user: dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):

    cache_key = f"partner_diary:{partner_id}"
    cached_diary = await redis_client.get(cache_key)
    if cached_diary:
        print(f"Cache hit: {cache_key}")  # 調試信息
        return json.loads(cached_diary)

    print(f"Cache miss: {cache_key}")  # 調試信息

    try:
        logger.debug(f"Attempting to get partner diary for partner_id: {partner_id}, current_user: {current_user['id']}")

        cursor = db.cursor(dictionary=True)

        # 步驟 1: 獲取當前用戶的活躍匹配
        cursor.execute("""
            SELECT um.partner_id, um.created_at
            FROM user_matches um
            JOIN users u1 ON um.user_id = u1.id
            JOIN users u2 ON um.partner_id = u2.id
            WHERE um.user_id = %s AND um.status = 'accepted'
            AND u1.is_matching = 1 AND u2.is_matching = 1
            ORDER BY um.created_at DESC
            LIMIT 1
        """, (current_user['id'],))
        
        current_match = cursor.fetchone()

        # 這裡考慮檢查user_match_requests，按下exchange之後應該不再顯示夥伴的日記

        # 步驟 2: 驗證請求的夥伴 ID 是否為當前匹配的夥伴
        if not current_match or current_match['partner_id'] != partner_id:
            raise HTTPException(status_code=403, detail="You are not currently matched with this user")


        # 獲取夥伴的日記
        cursor.execute("""
            SELECT d.id, d.user_id, d.title, d.content, d.image_url, d.is_public, 
                   d.date, d.created_at, d.updated_at, users.email
            FROM diary_entries d
            JOIN users ON d.user_id = users.id
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

        entries = [DiaryEntryResponse(**entry) for entry in entries]

        # 將結果存入快取
        await redis_client.set(cache_key, json.dumps([entry.dict() for entry in entries]), ex=3600)  # 設置1小時過期

        return entries

    except HTTPException as http_ex:
        raise http_ex
    except Exception as e:
        logger.error(f"Unexpected error occurred: {e}", exc_info=True)
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

