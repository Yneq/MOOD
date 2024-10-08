from fastapi import FastAPI, HTTPException, APIRouter, Depends, Query
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from pydantic import BaseModel
import mysql.connector
from mysql.connector import Error
import boto3
import uuid
from dotenv import load_dotenv
import os
from botocore.config import Config
from fastapi.encoders import jsonable_encoder
from datetime import datetime, date
from typing import List, Dict, Union
from models.diary import PresigneUrlRequest, DiaryEntryResponse, DiaryEntryRequest, MoodEntryRequest, MoodEntryResponse, MoodData, ProfileUpdateRequest
from dependencies import get_db, get_current_user
import pytz
import redis.asyncio as redis
import json
import io
import csv
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont








redis_client = redis.Redis(host='redis', port=6379, decode_responses=True)

# 設置日誌記錄
import logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

router = APIRouter()

load_dotenv()

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

@router.get("/api/v1/diary_entries", response_model=List[DiaryEntryResponse])
async def get_diary_entries(
    skip: int = 0,
    limit: int = 100,
    current_user: Dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):

    cache_key = f"diary_entries:{current_user['id']}"
    cursor = None
    try:
        # 首先檢查是否有新的日記條目
        cursor = db.cursor(dictionary=True)
        check_query = "SELECT MAX(id) as last_id FROM diary_entries WHERE user_id = %s"
        cursor.execute(check_query, (current_user["id"],))
        last_id = cursor.fetchone()['last_id']

        cached_last_id = await redis_client.get(f"{cache_key}:last_id")

        # 如果沒有緩存或者有新的更新，則查詢數據庫
        if not cached_last_id or (last_id and str(last_id) > cached_last_id):
            query = "SELECT * FROM diary_entries WHERE user_id = %s ORDER BY date DESC LIMIT %s OFFSET %s"
            cursor.execute(query, (current_user["id"], limit, skip))
            entries = cursor.fetchall()

            for entry in entries:
                entry['date'] = entry['date'].isoformat() 
                entry['created_at'] = datetime.now().isoformat()
                entry['updated_at'] = datetime.now().isoformat()
            
            entries_response = [DiaryEntryResponse(**entry) for entry in entries]

            await redis_client.set(cache_key, json.dumps([entry.dict() for entry in entries_response]), ex=300)  # 設置5分鐘過期
            if last_id:
                await redis_client.set(f"{cache_key}:last_id", str(last_id), ex=300)
                
            return entries_response
        else:
            # 如果沒有新的更新，使用緩存的數據
            cached_entries = await redis_client.get(cache_key)

            return json.loads(cached_entries)

    except mysql.connector.Error as e:
        raise HTTPException(status_code=500, detail=f"資料庫錯誤: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"發生意外錯誤: {str(e)}")
    finally:
        if cursor:
            cursor.close()

@router.get("/api/v1/diary_entries/export")
async def download_moods(
    format: str = Query(..., regex="^(json|csv|pdf)$"),
    current_user: dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    try:
        cursor = db.cursor(dictionary=True)
        query = "SELECT * FROM diary_entries WHERE user_id = %s ORDER BY date DESC"
        cursor.execute(query, (current_user["id"],))
        entries = cursor.fetchall()

        for entry in entries:
            entry['date'] = entry['date'].isoformat()
            entry['created_at'] = entry['created_at'].isoformat()
            entry['updated_at'] = entry['updated_at'].isoformat()

        if format == 'json':
            return create_json_response(entries)
        elif format == 'csv':
            return create_csv_response(entries)
        elif format == 'pdf':
            return await create_pdf_response(entries)

    except mysql.connector.Error as e:
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")
    finally:
        cursor.close()

def create_json_response(entries):
    json_data = json.dumps(entries, ensure_ascii=False, indent=2)
    return StreamingResponse(
        io.StringIO(json_data),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=my_moods.json"}
    )

def create_csv_response(entries):
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=entries[0].keys())
    writer.writeheader()
    for entry in entries:
        writer.writerow(entry)
    output.seek(0)
    return StreamingResponse(
        io.StringIO(output.getvalue()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=my_moods.csv"}
    )

async def create_pdf_response(entries):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements = []

    # 註冊 CID 字體
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))

    styles = getSampleStyleSheet()
    # 修改 Chinese 樣式使用 CID 字體
    styles.add(ParagraphStyle(name='Chinese', fontName='STSong-Light', fontSize=12))

    title = Paragraph("My Mood Diary", styles['Title'])
    elements.append(title)

    data = [['Date', 'Content']]
    for entry in entries:
        data.append([
            entry['date'],
            Paragraph(entry['content'], styles['Chinese'])
        ])

    page_width = letter[0]
    col_widths = [page_width * 0.25, page_width * 0.75]  # 25% 給日期，75% 給內容

    table = Table(data, colWidths=col_widths)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),  # 改為左對齊
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 14),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 1), (-1, -1), 'STSong-Light'),  # 使用 CID 字體
        ('FONTSIZE', (0, 1), (-1, -1), 12),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),  # 垂直對齊頂部
        ('WORDWRAP', (0, 0), (-1, -1), True),  # 自動換行
    ]))
    elements.append(table)

    doc.build(elements)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=my_moods.pdf"}
    )


@router.get("/api/v1/diary_entries/{param}", response_model=Union[List[DiaryEntryResponse], DiaryEntryResponse])
async def get_diary_entry(
    param: str,
    current_user: Dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    try:
        entry_id = int(param)
        cache_key = f"diary_entry:{current_user['id']}:{entry_id}"
    except ValueError:
        cache_key = f"diary_entries_date:{current_user['id']}:{param}"

    logger.debug(f"Checking cache with key: {cache_key}")

    cached_entry = await redis_client.get(cache_key)
    if cached_entry:
        logger.info(f"Cache hit for key: {cache_key}")        
        return json.loads(cached_entry)
    else:
        logger.info(f"Cache miss for key: {cache_key}")

    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        
        # 嘗試將參數解析為整數（ID）
        try:
            entry_id = int(param)
            query = """
            SELECT 
                diary_entries.id,
                diary_entries.user_id,
                diary_entries.title,
                diary_entries.content,
                diary_entries.image_url,
                diary_entries.is_public,
                diary_entries.date,
                diary_entries.created_at,
                diary_entries.updated_at,
                mood_entries.mood_score,
                mood_entries.weather,
                users.email
            FROM 
                diary_entries
            LEFT JOIN 
                mood_entries ON diary_entries.user_id = mood_entries.user_id 
                AND diary_entries.date = mood_entries.date
            LEFT JOIN 
                users ON diary_entries.user_id = users.id
            WHERE 
                diary_entries.id = %s AND diary_entries.user_id = %s
            """
            cursor.execute(query, (entry_id, current_user["id"]))
            entry = cursor.fetchone()
            
            if not entry:
                raise HTTPException(status_code=404, detail="未找到指定 ID 的日記條目")
            
            # 處理單個條目
            entry['date'] = entry['date'].isoformat() 
            entry['created_at'] = datetime.now().isoformat()
            entry['updated_at'] = datetime.now().isoformat()

            mood_score = entry.pop('mood_score')
            weather = entry.pop('weather')
            entry['mood_data'] = MoodData(mood_score=mood_score, weather=weather) if mood_score is not None or weather is not None else None

            response = DiaryEntryResponse(**entry)

            await redis_client.set(cache_key, json.dumps(response.dict()), ex=3600)
            return response
        
        except ValueError:
            # 如果不是 ID，則按原來的方式處理日期查詢
            query_date = datetime.strptime(param, "%Y-%m-%d").date()
            
            query = """
            SELECT 
                diary_entries.id,
                diary_entries.user_id,
                diary_entries.title,
                diary_entries.content,
                diary_entries.image_url,
                diary_entries.is_public,
                diary_entries.date,
                diary_entries.created_at,
                diary_entries.updated_at,
                mood_entries.mood_score,
                mood_entries.weather,
                users.email
            FROM 
                diary_entries
            LEFT JOIN 
                mood_entries ON diary_entries.user_id = mood_entries.user_id 
                AND diary_entries.date = mood_entries.date
            LEFT JOIN 
                users ON diary_entries.user_id = users.id
            WHERE 
                diary_entries.user_id = %s AND DATE(diary_entries.date) = %s
            ORDER BY 
                diary_entries.date DESC
            """
            
            cursor.execute(query, (current_user["id"], query_date))
            entries = cursor.fetchall()
            
            if not entries:
                return []
            
            for entry in entries:
                entry['date'] = entry['date'].isoformat()
                entry['created_at'] = datetime.now().isoformat()
                entry['updated_at'] = datetime.now().isoformat()
                mood_score = entry.pop('mood_score')
                weather = entry.pop('weather')
                entry['mood_data'] = MoodData(mood_score=mood_score, weather=weather) if mood_score is not None or weather is not None else None

            response = [DiaryEntryResponse(**entry) for entry in entries]

            await redis_client.set(cache_key, json.dumps([entry.dict() for entry in response]), ex=3600)
            return response
        
    except mysql.connector.Error as e:
        raise HTTPException(status_code=500, detail=f"資料庫錯誤: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"發生意外錯誤: {str(e)}")
    finally:
        if cursor:
            cursor.close()

# 新增：在函數結束前添加一個緩存驗證步驟
    try:
        verification = await redis_client.get(cache_key)
        if verification:
            logger.info(f"Cache verification successful for key: {cache_key}")
        else:
            logger.warning(f"Cache verification failed for key: {cache_key}")
    except Exception as e:
        logger.error(f"Error during cache verification: {str(e)}")


# 新增: 在寫入操作後清除緩存的函數
async def clear_diary_cache(user_id: int, date: str):
    cache_key = f"diary_entries_date:{user_id}:{date}"
    await redis_client.delete(cache_key)


@router.post("/api/v1/diary_entries", response_model=DiaryEntryResponse)
async def create_diary_entry(
    entry: DiaryEntryRequest,
    current_user: Dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)

        if not entry.content.strip():
            raise HTTPException(status_code=400, detail="RECORD YOUR MOODs")

        if entry.date is None:
            entry_date = datetime.now().date()
        else:
            # 如果提供的是 datetime 或 date，都統一轉換為 date
            if isinstance(entry.date, datetime):
                entry_date = entry.date.date()
            elif isinstance(entry.date, str):
                entry_date = datetime.strptime(entry.date, "%Y-%m-%d").date()
            else:
                entry_date = entry.date
        
        # 將當前時間轉換為 UTC
        now_iso = datetime.now().isoformat()

        query = """
        INSERT INTO diary_entries(user_id, title, content, date, is_public, image_url)
        VALUES (%s, %s, %s, %s, %s, %s)
        """

        cursor.execute(query, (current_user["id"], entry.title, entry.content, entry_date,
                                entry.is_public, entry.image_url))
        db.commit()
        new_id = cursor.lastrowid

        cursor.execute("SELECT * FROM diary_entries WHERE id = %s", (new_id,))
        new_entry = cursor.fetchone()

        if new_entry:
            # 轉換日期時間字段
            new_entry['date'] = new_entry['date'].isoformat()
            new_entry['created_at'] = datetime.now().isoformat()
            new_entry['updated_at'] = datetime.now().isoformat()
            
            response = DiaryEntryResponse(**new_entry)

            # 清除日記列表的快取
            await redis_client.delete(f"diary_entries:{current_user['id']}:*")
            await redis_client.delete(f"diary_entry:{current_user['id']}:{new_id}")

            return response
        else:
            raise HTTPException(status_code=404, detail="新創建的條目無法找到")
    except mysql.connector.Error as e:
        raise HTTPException(status_code=500, detail=f"資料庫錯誤: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"發生意外錯誤: {str(e)}")
    finally:
        if cursor:
            cursor.close()

@router.put("/api/v1/diary_entries/{entry_id}", response_model=DiaryEntryResponse)
async def update_diary_entry(
    entry_id: int,
    entry: DiaryEntryRequest,
    current_user: Dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)

        # 檢查條目是否存在且屬於當前用戶
        check_query = "SELECT * FROM diary_entries WHERE id = %s AND user_id = %s"
        cursor.execute(check_query, (entry_id, current_user["id"]))
        existing_entry = cursor.fetchone()
        if not existing_entry:
            raise HTTPException(status_code=404, detail="日記條目未找到或不屬於當前用戶")

        if entry.date is None:
            entry_date = datetime.now().date()
        else:
            # 如果提供的是 datetime 或 date，都統一轉換為 date
            if isinstance(entry.date, datetime):
                entry_date = entry.date.date()
            elif isinstance(entry.date, str):
                entry_date = datetime.strptime(entry.date, "%Y-%m-%d").date()
            else:
                entry_date = entry.date

        # 更新時間（UTC）
        now_iso = datetime.now().isoformat()

        update_query = """
        UPDATE diary_entries 
        SET title = %s, content = %s, date = %s, is_public = %s, image_url = %s, updated_at = %s
        WHERE id = %s AND user_id = %s
        """
        params = (entry.title, entry.content, entry_date, entry.is_public, entry.image_url, now_iso, entry_id, current_user["id"])

        cursor.execute(update_query, params)
        db.commit()

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="未找到要更新的日記條目")

        cursor.execute("SELECT * FROM diary_entries WHERE id = %s", (entry_id,))
        updated_entry = cursor.fetchone()
        
        if updated_entry:
            # 轉換日期時間字段
            updated_entry['date'] = updated_entry['date'].isoformat()
            updated_entry['created_at'] = datetime.now().isoformat()
            updated_entry['updated_at'] = datetime.now().isoformat()

            response = DiaryEntryResponse(**updated_entry)

            # 清除相關快取
            await redis_client.delete(f"diary_entries:{current_user['id']}:*")
            await redis_client.delete(f"diary_entry:{current_user['id']}:{entry_id}")

            return response
        else:
            raise HTTPException(status_code=404, detail="更新後的條目無法找到")

    except mysql.connector.Error as e:
        raise HTTPException(status_code=500, detail=f"資料庫錯誤: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"發生意外錯誤: {str(e)}")
    finally:
        if cursor:
            cursor.close()

@router.delete("/api/v1/diary_entries/{entry_id}", response_model=Dict[str, str])
async def delete_diary_entry(
    entry_id: int,
    current_user: Dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        
        # 首先獲取要刪除的日記條目信息
        check_query = "SELECT * FROM diary_entries WHERE id = %s AND user_id = %s"
        cursor.execute(check_query, (entry_id, current_user["id"]))
        entry_to_delete = cursor.fetchone()
        
        if not entry_to_delete:
            raise HTTPException(status_code=404, detail="日記條目未找到或不屬於當前用戶")

        # 執行刪除操作
        delete_query = "DELETE FROM diary_entries WHERE id = %s AND user_id = %s"
        cursor.execute(delete_query, (entry_id, current_user["id"]))
        db.commit()

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="未找到要刪除的日記條目")
        
        # 清除所有相關的緩存
        cache_keys_to_delete = [
            f"diary_entries:{current_user['id']}*",
            f"diary_entry:{current_user['id']}:{entry_id}",
            f"diary_entries_date:{current_user['id']}:*"
        ]

        for key_pattern in cache_keys_to_delete:
            matching_keys = await redis_client.keys(key_pattern)
            if matching_keys:
                await redis_client.delete(*matching_keys)

        return {"message": "日記條目已成功刪除，相關緩存已清理"}
        
    except mysql.connector.Error as e:
        raise HTTPException(status_code=500, detail=f"資料庫錯誤: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"發生意外錯誤: {str(e)}")
    finally:
        if cursor:
            cursor.close()

@router.post("/api/v1/mood_entries", response_model=MoodEntryResponse)
async def save_mood_entry(
    mood_entry: MoodEntryRequest,
    current_user: dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):

    if mood_entry.mood_score is not None and (mood_entry.mood_score < 1 or mood_entry.mood_score > 5):
        raise HTTPException(status_code=400, detail="Mood score must be between 1 and 5")

    try:
        cursor = db.cursor(dictionary=True)

        now_iso = datetime.now().isoformat()

        check_query = "SELECT id FROM mood_entries WHERE user_id = %s AND date = %s"
        cursor.execute(check_query, (current_user["id"], mood_entry.date))
        existing_entry = cursor.fetchone()

        if existing_entry:
            # 更新現有記錄
            update_query = """
            UPDATE mood_entries 
            SET mood_score = %s, weather = %s, note = %s
            WHERE id = %s AND user_id = %s
            """
            cursor.execute(update_query, (
                mood_entry.mood_score if mood_entry.mood_score is not None else None,
                mood_entry.weather,
                mood_entry.note,
                existing_entry['id'],
                current_user["id"]
            ))
        else:
            # 創建新記錄
            insert_query = """
            INSERT INTO mood_entries (user_id, mood_score, date, weather, note)
            VALUES (%s, %s, %s, %s, %s)
            """
            cursor.execute(insert_query, (
                current_user["id"],
                mood_entry.mood_score if mood_entry.mood_score is not None else None,
                mood_entry.date,
                mood_entry.weather or '',
                mood_entry.note,
            ))
            entry_id = cursor.lastrowid

        db.commit()

        if existing_entry:
            entry_id = existing_entry['id']
        else:
            entry_id = cursor.lastrowid

        # 獲取保存的記錄
        select_query = "SELECT * FROM mood_entries WHERE id = %s"
        cursor.execute(select_query, (entry_id,))
        saved_entry = cursor.fetchone()

        if saved_entry:
            # 清除相關的快取
            await redis_client.delete(f"diary_entries:{current_user['id']}:*")
            await redis_client.delete(f"diary_entries_date:{current_user['id']}:{mood_entry.date}")
            await redis_client.delete(f"diary_entry:{current_user['id']}:*")  # 可能需要刪除所有相關的單個條目快取
            return MoodEntryResponse(**saved_entry)
        else:
            raise HTTPException(status_code=404, detail="無法檢索保存的心情記錄")

    except mysql.connector.Error as e:
        raise HTTPException(status_code=500, detail=f"資料庫錯誤: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"發生意外錯誤: {str(e)}")
    finally:
        if cursor:
            cursor.close()



@router.patch("/api/v1/users/profile")
async def update_profile(
    request: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)

        update_fields = []
        update_values = []

        if request.avatar_url:
            update_fields.append("avatar_url = %s")
            update_values.append(request.avatar_url)

        if request.self_intro is not None:
                update_fields.append("self_intro = %s")
                update_values.append(request.self_intro)

        if request.new_password and request.new_password.strip():
            if not request.current_password:
                raise HTTPException(status_code=400, detail="當前密碼必須提供")

            cursor.execute("SELECT password FROM users WHERE id = %s", (current_user['id'],))
            user = cursor.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="用戶不存在")
            
            if request.current_password != user['password']:
                raise HTTPException(status_code=400, detail="Current password not match!")
            
            update_fields.append("password = %s")
            update_values.append(request.new_password)

            if request.avatar_url:
                # 如果更新了頭像，清除頭像快取
                await redis_client.delete(f"user_avatar:{current_user['id']}")
                update_fields.append("avatar_url = %s")
                update_values.append(request.avatar_url)
        
        if update_fields:
            query = f"UPDATE users SET {', '.join(update_fields)} WHERE id = %s"
            update_values.append(current_user['id'])
            cursor.execute(query, tuple(update_values))
            db.commit()

            cursor.execute("SELECT avatar_url, self_intro FROM users WHERE id = %s", (current_user['id'],))
            updated_user = cursor.fetchone()

            # 更新快取
            cache_key = f"user_profile:{current_user['id']}"
            cache_data = {
                "avatar_url": updated_user['avatar_url'],
                "self_intro": updated_user['self_intro']
            }
            await redis_client.set(cache_key, json.dumps(cache_data), ex=3600)  # 設置1小時過期
            
            return JSONResponse(content={
                'success': True, 
                'message': 'Profile updated successfully',
                'avatar_url': updated_user['avatar_url'],
                'self_intro': updated_user['self_intro']
            })
        else:
            return JSONResponse(content={'success': True, 'message': '沒有需要更新的資料'})

    except mysql.connector.Error as e:
        raise HTTPException(status_code=500, detail=f"資料庫錯誤: {str(e)}")
    except HTTPException as he:
        return JSONResponse(status_code=he.status_code, content={"message": he.detail})        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"發生意外錯誤: {str(e)}")
    finally:
        if cursor:
            cursor.close()


@router.get("/api/v1/users/{user_id}/avatar")
async def get_user_avatar(
    user_id: int,
    current_user: dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):

    cache_key = f"user_avatar:{user_id}"
    cached_avatar = await redis_client.get(cache_key)
    if cached_avatar:
        return json.loads(cached_avatar)

    try:
        cursor = db.cursor(dictionary=True)
        query = "SELECT avatar_url FROM users WHERE id = %s"
        logging.info(f"Executing query: {query} with user ID: {user_id}")
        cursor.execute(query, (user_id,))
        result = cursor.fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="User not found")

        await redis_client.set(cache_key, json.dumps(result), ex=3600)  # 快取1小時
        logging.info(f"Query result: {result}")
        return result
    except mysql.connector.Error as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")
    finally:
        cursor.close()



@router.get("/api/v1/users/profile")
async def get_user_profile(
    current_user: dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    cache_key = f"user_profile:{current_user['id']}"
    cached_profile = await redis_client.get(cache_key)
    if cached_profile:
        logging.info(f"Cache hit for user {current_user['id']}: {cached_profile}")
        return json.loads(cached_profile)

    logging.info(f"Cache miss for user {current_user['id']}")


    try:
        cursor = db.cursor(dictionary=True)
        query = "SELECT avatar_url, self_intro FROM users WHERE id = %s"
        cursor.execute(query, (current_user["id"],))
        result = cursor.fetchone()

        logging.info(f"Raw database result for user {current_user['id']}: {result}")

        if not result:
            logging.warning(f"User not found for ID: {current_user['id']}")            
            return {"avatar_url": None, "self_intro": None}  # 返回空的資料而不是拋出異常

         # 確保結果中的 None 值被正確處理
        processed_result = {
            "avatar_url": result["avatar_url"] if result["avatar_url"] is not None else None,
            "self_intro": result["self_intro"] if result["self_intro"] is not None else None
        }

        logging.info(f"Processed result for user {current_user['id']}: {processed_result}")
      
        await redis_client.set(cache_key, json.dumps(result), ex=300)
        return processed_result
    except mysql.connector.Error as e:
        logging.error(f"Database Error for user {current_user['id']}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")
    except Exception as e:
        logging.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
    finally:
        if cursor:
            cursor.close()