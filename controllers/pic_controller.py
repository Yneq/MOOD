from fastapi import FastAPI, HTTPException, APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import mysql.connector
import boto3
import uuid
from dotenv import load_dotenv
import os
from botocore.config import Config
from fastapi.encoders import jsonable_encoder
from datetime import datetime
from models.diary import PresigneUrlRequest, MessageRequest, MessageResponse
from fastapi.responses import HTMLResponse
from dependencies import get_current_user
from typing import Dict
import logging
import traceback



logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv() 

router = APIRouter()

s3_client = boto3.client("s3", 
                        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
                        region_name=os.getenv("AWS_REGION"),
                        config=Config(signature_version="s3v4"))

BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME")
CLOUDFRONT_DOMAIN = os.getenv("CLOUDFRONT_DOMAIN")

db_config = {
    "user": os.getenv("DB_USER"),
    "host": os.getenv("RDS_HOST"),
    "password": os.getenv("RDS_PASSWORD"),
    "database": os.getenv("RDS_RDS")
}

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
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/save_message")
async def save_message(request: MessageRequest, current_user: dict = Depends(get_current_user)):
    try:
        logger.info(f"Received message request: {request}")

        if not request.text.strip() and not request.imageUrl:
            raise HTTPException(status_code=400, detail="Message must contain text or image")

        # 使用當前用戶的 email，如果請求中沒有提供的話
        email = request.email or current_user.get("email")
        if not email:
            raise HTTPException(status_code=400, detail="Email is required")

        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        insert_query = """
        INSERT INTO messages(text, imageUrl, email)
        VALUE (%s, %s, %s)
        """
        logger.info(f"Executing query: {insert_query} with params: {(request.text, request.imageUrl, email)}")

        cursor.execute(insert_query, (request.text, request.imageUrl, email))
        conn.commit()

        # 獲取插入的消息ID
        message_id = cursor.lastrowid
        logger.info(f"Inserted message with ID: {message_id}")

        # 獲取插入的消息
        select_query = "SELECT * FROM messages WHERE id = %s"
        cursor.execute(select_query, (message_id,))
        saved_message = cursor.fetchone()

        cursor.close()
        conn.close()
        # 返回完整的消息對象
        response = MessageResponse(
            id=message_id,
            text=request.text,
            imageUrl=request.imageUrl,
            email=email,
            created_at=datetime.now().isoformat()
        )
        logger.info(f"Returning response: {response}")
        return response.dict()  # 返回字典形式的響應

    except mysql.connector.Error as db_error:
        logger.error(f"Database error: {db_error}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(db_error)}")
    except Exception as e:
        logger.error(f"Unexpected error in save_message: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

@router.delete("/delete_message/{message_id}")
async def delete_message(message_id: int, current_user: Dict = Depends(get_current_user)):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        # 首先檢查消息是否屬於當前用戶
        check_query = "SELECT email FROM messages WHERE id = %s"
        cursor.execute(check_query, (message_id,))
        result = cursor.fetchone()
        
        if not result:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

        delete_query = "DELETE FROM messages WHERE id = %s AND email = %s"
        cursor.execute(delete_query, (message_id, current_user['email']))
        conn.commit()

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Message not found or already deleted")
        
        logger.info(f"Successfully deleted message {message_id}")
        return {"message": "Message deleted successfully"}
    except mysql.connector.Error as db_error:
        raise HTTPException(status_code=500, detail=f"Database error: {str(db_error)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None:
            conn.close()


@router.get('/get_messages')
async def get_messages():
    try:
        # 連接到 rds 資料庫
        rds_conn = mysql.connector.connect(**db_config)
        rds_cursor = rds_conn.cursor(dictionary=True)
        
        # 查詢 messages
        messages_query = """
        SELECT id, text, imageUrl, created_at, email 
        FROM messages 
        ORDER BY created_at DESC
        """
        rds_cursor.execute(messages_query)
        messages = rds_cursor.fetchall()
        rds_cursor.close()
        rds_conn.close()

        # 連接到 mood_db 資料庫
        mood_db_config = db_config.copy()
        mood_db_config['database'] = 'mood_db'
        mood_conn = mysql.connector.connect(**mood_db_config)
        mood_cursor = mood_conn.cursor(dictionary=True)

        # 獲取所有用戶的 email 和 name
        users_query = "SELECT email, name FROM users"
        mood_cursor.execute(users_query)
        users = {user['email']: user['name'] for user in mood_cursor.fetchall()}
        mood_cursor.close()
        mood_conn.close()

        # 合併數據並格式化
        formatted_messages = []
        for message in messages:
            user_name = users.get(message['email'], message['email'].split('@')[0] if message['email'] else 'Anonymous')
            formatted_messages.append({
                'id': message['id'],
                'text': message['text'],
                'imageUrl': message['imageUrl'],
                'created_at': message['created_at'].isoformat() if message['created_at'] else None,
                'user_name': user_name,
                'email': message['email']
            })

        # 使用自定義序列化器
        serialized_messages = jsonable_encoder(formatted_messages, custom_encoder={datetime: custom_json_serializer})
        return JSONResponse(content=serialized_messages)
    except Exception as e:
        logger.error(f"Error fetching messages: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

def custom_json_serializer(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")



