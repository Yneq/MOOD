from fastapi import FastAPI, HTTPException, APIRouter, Depends
from fastapi.responses import JSONResponse
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
from models.diary import PresigneUrlRequest, DiaryEntryResponse, DiaryEntryRequest
from dependencies import get_db, get_current_user
import pytz

# 設置日誌記錄
import logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

router = APIRouter()

load_dotenv()

# S3 客戶端設置
s3_client = boto3.client("s3", 
                        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
                        region_name=os.getenv("AWS_REGION"),
                        config=Config(signature_version="s3v4"))

BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME")
CLOUDFRONT_DOMAIN = os.getenv("CLOUDFRONT_DOMAIN")

# 設置時區
taipei_tz = pytz.timezone('Asia/Taipei')

def convert_to_taipei_time(dt):
    if not dt.tzinfo:
        dt = pytz.UTC.localize(dt)
    return dt.astimezone(taipei_tz)

def convert_date_to_isoformat(date_value):
    if isinstance(date_value, datetime):
        return convert_to_taipei_time(date_value).date().isoformat()
    elif isinstance(date_value, date):
        return date_value.isoformat()
    return str(date_value)


@router.post("/get_presigned_url")
async def get_presigned_url(request: PresigneUrlRequest):
    try:
        file_key = str(uuid.uuid4()) + "_" + request.filename
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={'Bucket': BUCKET_NAME, 'Key': file_key},
            ExpiresIn=3600,
            HttpMethod='PUT'
        )
        cloudfront_url = f"{CLOUDFRONT_DOMAIN}/{file_key}"
        return JSONResponse(content={'url': presigned_url, 'key': file_key, 'cloudfront_url': cloudfront_url})
    except Exception as e:
        logger.error(f"Error generating presigned URL: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error generating presigned URL: {str(e)}")

@router.get("/get_diary_entries", response_model=List[DiaryEntryResponse])
async def get_diary_entries(
    skip: int = 0,
    limit: int = 100,
    current_user: Dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        query = "SELECT * FROM diary_entries WHERE user_id = %s ORDER BY date DESC LIMIT %s OFFSET %s"
        cursor.execute(query, (current_user["id"], limit, skip))
        entries = cursor.fetchall()
        
        for entry in entries:
            entry['date'] = entry['date'].isoformat() 
            entry['created_at'] = entry['created_at'].replace(tzinfo=pytz.UTC).astimezone(taipei_tz).isoformat()
            entry['updated_at'] = entry['updated_at'].replace(tzinfo=pytz.UTC).astimezone(taipei_tz).isoformat()
        
        return [DiaryEntryResponse(**entry) for entry in entries]
    except mysql.connector.Error as e:
        logger.error(f"Database error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"資料庫錯誤: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"發生意外錯誤: {str(e)}")
    finally:
        if cursor:
            cursor.close()


taipei_tz = pytz.timezone('Asia/Taipei')

@router.get("/get_diary_entry/{param}", response_model=Union[List[DiaryEntryResponse], DiaryEntryResponse])
async def get_diary_entry(
    param: str,
    current_user: Dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        
        # 嘗試將參數解析為整數（ID）
        try:
            entry_id = int(param)
            query = "SELECT * FROM diary_entries WHERE id = %s AND user_id = %s"
            cursor.execute(query, (entry_id, current_user["id"]))
            entry = cursor.fetchone()
            
            if not entry:
                raise HTTPException(status_code=404, detail="未找到指定 ID 的日記條目")
            
            # 處理單個條目
            entry['date'] = entry['date'].isoformat()
            entry['created_at'] = entry['created_at'].replace(tzinfo=pytz.UTC).astimezone(taipei_tz).isoformat()
            entry['updated_at'] = entry['updated_at'].replace(tzinfo=pytz.UTC).astimezone(taipei_tz).isoformat()
            
            return DiaryEntryResponse(**entry)
        
        except ValueError:
            # 如果不是 ID，則按原來的方式處理日期查詢
            query_date = datetime.strptime(param, "%Y-%m-%d").date()
            query_date = taipei_tz.localize(datetime.combine(query_date, datetime.min.time())).date()
            
            query = "SELECT * FROM diary_entries WHERE user_id = %s AND DATE(date) = %s ORDER BY date DESC"
            logger.debug(f"Executing query: {query}")
            logger.debug(f"Parameters: {current_user['id']}, {query_date}")
            
            cursor.execute(query, (current_user["id"], query_date))
            entries = cursor.fetchall()
            
            if not entries:
                logger.info(f"No entries found for date: {param}")
                return []
            
            for entry in entries:
                entry['date'] = entry['date'].isoformat()
                entry['created_at'] = entry['created_at'].replace(tzinfo=pytz.UTC).astimezone(taipei_tz).isoformat()
                entry['updated_at'] = entry['updated_at'].replace(tzinfo=pytz.UTC).astimezone(taipei_tz).isoformat()
            
            logger.debug(f"Returning entries: {entries}")
            return [DiaryEntryResponse(**entry) for entry in entries]
        
    except mysql.connector.Error as e:
        logger.error(f"Database error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"資料庫錯誤: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"發生意外錯誤: {str(e)}")
    finally:
        if cursor:
            cursor.close()

@router.post("/create_diary_entry", response_model=DiaryEntryResponse)
async def create_diary_entry(
    entry: DiaryEntryRequest,
    current_user: Dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    logger.debug(f"Received entry data: {entry.dict()}")
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)

        if not entry.content.strip():
            raise HTTPException(status_code=400, detail="RECORD YOUR MOODs")
        
        # 如果沒有提供日期，使用當前的台北時間
        if entry.date is None:
            entry_date = datetime.now(taipei_tz).date()
        else:
            # 如果提供的是 datetime 或 date，都統一轉換為 date
            if isinstance(entry.date, datetime):
                entry_date = entry.date.astimezone(taipei_tz).date()
            else:
                entry_date = entry.date
        
        # 將當前時間轉換為 UTC
        now_utc = datetime.now(taipei_tz).astimezone(pytz.UTC)

        query = """
        INSERT INTO diary_entries(user_id, title, content, date, is_public, image_url, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        logger.debug(f"Inserting entry with date: {entry_date}")
        logger.debug(f"Parameters: {current_user['id']}, {entry.title}, {entry.content}, {entry_date}, {entry.is_public}, {entry.image_url}, {now_utc}, {now_utc}")

        cursor.execute(query, (current_user["id"], entry.title, entry.content, entry_date,
                                entry.is_public, entry.image_url, now_utc, now_utc))
        db.commit()
        new_id = cursor.lastrowid
        logger.debug(f"New entry ID: {new_id}")

        cursor.execute("SELECT * FROM diary_entries WHERE id = %s", (new_id,))
        new_entry = cursor.fetchone()
        logger.debug(f"Fetched new entry: {new_entry}")

        if new_entry:
            # 轉換日期時間字段
            new_entry['date'] = new_entry['date'].isoformat()
            new_entry['created_at'] = new_entry['created_at'].replace(tzinfo=pytz.UTC).astimezone(taipei_tz).isoformat()
            new_entry['updated_at'] = new_entry['updated_at'].replace(tzinfo=pytz.UTC).astimezone(taipei_tz).isoformat()
            
            response = DiaryEntryResponse(**new_entry)
            logger.debug(f"Created DiaryEntryResponse: {response}")
            return response
        else:
            raise HTTPException(status_code=404, detail="新創建的條目無法找到")
    except mysql.connector.Error as e:
        logger.error(f"Database error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"資料庫錯誤: {str(e)}")
    except ValidationError as e:
        logger.error(f"Validation error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"發生意外錯誤: {str(e)}")
    finally:
        if cursor:
            cursor.close()

@router.put("/update_diary_entry/{entry_id}", response_model=DiaryEntryResponse)
async def update_diary_entry(
    entry_id: int,
    entry: DiaryEntryRequest,
    current_user: Dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    logger.debug(f"Received update request for entry ID: {entry_id}")
    logger.debug(f"Update data: {entry.dict()}")
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)

        # 檢查條目是否存在且屬於當前用戶
        check_query = "SELECT * FROM diary_entries WHERE id = %s AND user_id = %s"
        cursor.execute(check_query, (entry_id, current_user["id"]))
        existing_entry = cursor.fetchone()
        if not existing_entry:
            raise HTTPException(status_code=404, detail="日記條目未找到或不屬於當前用戶")

        # 處理日期
        if entry.date is None:
            entry_date = datetime.now(taipei_tz).date()
        else:
            if isinstance(entry.date, datetime):
                entry_date = entry.date.astimezone(taipei_tz).date()
            elif isinstance(entry.date, str):
                entry_date = datetime.strptime(entry.date, "%Y-%m-%d").date()
            else:
                entry_date = entry.date

        # 更新時間（UTC）
        now_utc = datetime.now(pytz.UTC)

        update_query = """
        UPDATE diary_entries 
        SET title = %s, content = %s, date = %s, is_public = %s, image_url = %s, updated_at = %s
        WHERE id = %s AND user_id = %s
        """
        params = (entry.title, entry.content, entry_date, entry.is_public, entry.image_url, now_utc, entry_id, current_user["id"])

        logger.debug(f"Executing query: {update_query}")
        logger.debug(f"Parameters: {params}")

        cursor.execute(update_query, params)
        db.commit()

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="未找到要更新的日記條目")

        cursor.execute("SELECT * FROM diary_entries WHERE id = %s", (entry_id,))
        updated_entry = cursor.fetchone()
        
        if updated_entry:
            # 轉換日期時間字段
            updated_entry['date'] = updated_entry['date'].isoformat()
            updated_entry['created_at'] = updated_entry['created_at'].replace(tzinfo=pytz.UTC).astimezone(taipei_tz).isoformat()
            updated_entry['updated_at'] = updated_entry['updated_at'].replace(tzinfo=pytz.UTC).astimezone(taipei_tz).isoformat()

            response = DiaryEntryResponse(**updated_entry)
            logger.debug(f"Updated DiaryEntryResponse: {response}")
            return response
        else:
            raise HTTPException(status_code=404, detail="更新後的條目無法找到")

    except mysql.connector.Error as e:
        logger.error(f"Database error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"資料庫錯誤: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"發生意外錯誤: {str(e)}")
    finally:
        if cursor:
            cursor.close()

@router.delete("/delete_diary_entry/{entry_id}", response_model=Dict[str, str])
async def delete_diary_entry(
    entry_id: int,
    current_user: Dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    cursor = None
    try:
        cursor = db.cursor()
        check_query = "SELECT * FROM diary_entries WHERE id = %s AND user_id = %s"
        cursor.execute(check_query, (entry_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="日記條目未找到或不屬於當前用戶")

        delete_query = "DELETE FROM diary_entries WHERE id = %s AND user_id = %s"
        cursor.execute(delete_query, (entry_id, current_user["id"]))
        db.commit()

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="未找到要刪除的日記條目")
        return {"message": "日記條目已成功刪除"}
    except mysql.connector.Error as e:
        logger.error(f"Database error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"資料庫錯誤: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"發生意外錯誤: {str(e)}")
    finally:
        if cursor:
            cursor.close()