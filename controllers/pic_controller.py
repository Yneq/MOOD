from fastapi import FastAPI, HTTPException, APIRouter
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
from fastapi import FastAPI, WebSocket
from fastapi.responses import HTMLResponse


load_dotenv() 

router = APIRouter()

class PresigneUrlRequest(BaseModel):
    filename: str

class MessageRequest(BaseModel):
    text: str
    imageUrl: str

s3_client = boto3.client("s3", 
                        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
                        region_name=os.getenv("AWS_REGION"),
                        config=Config(signature_version="s3v4"))

BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME")
CLOUDFRONT_DOMAIN = os.getenv("CLOUDFRONT_DOMAIN")

db_config = {
    "user": "admin",
    "host": os.getenv("RDS_HOST"),
    "password": os.getenv("RDS_PASSWORD"),
    "database": "rds"
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
async def save_message(request: MessageRequest):
    try:
        if not request.text.strip() and not request.imageUrl:
            raise HTTPException(status_code=400, detail="Message must contain text or image")

        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        insert_query = """
        INSERT INTO messages(text, imageUrl)
        VALUE (%s, %s)
        """
        cursor.execute(insert_query, (request.text, request.imageUrl))
        conn.commit()

        # 獲取插入的消息ID
        message_id = cursor.lastrowid
        
        # 獲取插入的消息
        select_query = "SELECT * FROM messages WHERE id = %s"
        cursor.execute(select_query, (message_id,))
        saved_message = cursor.fetchone()

        cursor.close()
        conn.close()
        # 返回完整的消息對象
        return JSONResponse(content={
            "id": message_id,
            "text": request.text,
            "imageUrl": request.imageUrl,
            "created_at": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error saving message: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/delete_message/{message_id}")
async def delete_message(message_id: int):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        delete_query = "DELETE FROM messages WHERE id = %s"
        cursor.execute(delete_query, (message_id,))
        conn.commit()
        cursor.close()
        conn.close()
        return {"message": "Message deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get('/get_messages')
async def get_messages():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        select_query = "SELECT id, text, imageUrl, created_at FROM messages ORDER BY id DESC"
        cursor.execute(select_query)
        messages = cursor.fetchall()
        cursor.close()
        conn.close()

        # 使用自定義序列化器
        serialized_messages = jsonable_encoder(messages, custom_encoder={datetime: custom_json_serializer})
        return JSONResponse(content=serialized_messages)
    except Exception as e:
        logger.error(f"Error fetching messages: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

def custom_json_serializer(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")

# 儲存 WebSocket 連接的列表
clients = []

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    clients.append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # 當收到消息時，將消息轉發給所有客戶端
            for client in clients:
                if client != websocket:
                    await client.send_text(data)
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        clients.remove(websocket)