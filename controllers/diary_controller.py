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
from fastapi import FastAPI, WebSocket
from fastapi.responses import HTMLResponse
from models.diary import PresigneUrlRequest, DiaryEntryResponse, DiaryEntryRequest
from typing import List, Dict
from dependencies import get_db, get_current_user

# 設置日誌記錄
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

load_dotenv()

#將圖片放在S3，並產生url
s3_client = boto3.client("s3", 
                        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
                        region_name=os.getenv("AWS_REGION"),
                        config=Config(signature_version="s3v4"))

BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME")
CLOUDFRONT_DOMAIN = os.getenv("CLOUDFRONT_DOMAIN")


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

@router.post("/create_diary_entry", response_model=DiaryEntryResponse)
async def create_diary_entry(
    entry: DiaryEntryRequest,
    current_user: Dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
 ):
    try:
        cursor = db.cursor(dictionary=True)
        query = """
        INSERT INTO diary_entries(user_id, title, content, date, is_public, image_url)
        VALUES (%s, %s, %s, %s, %s, %s)
        """

        logger.info(f"Executing query: {query}")
        logger.info(f"Parameters: {current_user['id']}, {entry.title}, {entry.content}, {entry.date}, {entry.is_public}, {entry.image_url}")

        cursor.execute(query, (current_user["id"], entry.title, entry.content, entry.date,
                                entry.is_public, entry.image_url))
        db.commit()
        new_id = cursor.lastrowid
        logger.info(f"New entry ID: {new_id}")

        cursor.execute("SELECT * FROM diary_entries WHERE id = %s", (new_id,))
        new_entry = cursor.fetchone()
        logger.info(f"Fetched new entry: {new_entry}")

        if new_entry:
            try:
                response = DiaryEntryResponse(**new_entry)
                logger.info(f"Created DiaryEntryResponse: {response}")
                return response
            except Exception as e:
                    logger.error(f"Error creating DiaryEntryResponse: {str(e)}", exc_info=True)
                    raise HTTPException(status_code=500, detail=f"Error creating response: {str(e)}")
        else:
            raise HTTPException(status_code=404, detail="新創建的條目無法找到")
    except Error as e:
        logger.error(f"Database error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")
    finally:
        cursor.close()

@router.get("/get_diary_entries", response_model=List[DiaryEntryResponse])
async def get_diary_entries(
    skip: int = 0,
    limit: int = 100,
    current_user: Dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    try:
        cursor = db.cursor(dictionary=True)
        query = "SELECT * FROM diary_entries WHERE id = %s ORDER BY date DESC LIMIT %s OFFSET %s"
        cursor.execute(query, (current_user["id"], limit, skip))
        entries = cursor.fetchall()
        return [DiaryEntryResponse(**entry) for entry in entries]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()

@router.put("/update_diary_entry/{entry_id}")
async def update_diary_entry(
    entry_id: int,
    entry: DiaryEntryRequest,
    current_user: Dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    try:
        cursor = db.cursor(dictionary=True)
        #先檢查目標屬於用戶
        cursor.execute("SELECT * FROM diary_entries WHERE id = %s AND user_id = %s", (entry_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Diary entry not found or not owned by current user")
        
        query="""
        UPDATE diary_entries SET title = %s, content= %s, date =%s, is_public = %s, image_url = %s
        WHERE id =%s AND user_id = %s
        """
        cursor.execute(query, (entry.title, entry.content, entry.date, entry.is_public, entry.image_url, entry_id, current_user["id"]))
        db.commit()

        cursor.execute("SELECT * FROM diary_entries WHERE id = %s, (entry_id,)")
        diary_entry = cursor.fetchone()
        return DiaryEntryResponse(**diary_entry)
    except mysql.connector.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()

@router.delete("/delete_diary_entry/{entry_id}", response_model=Dict[str, str])
async def delete_diary_entry(
    entry_id: int,
    current_user: Dict = Depends(get_current_user),
    db: mysql.connector.connection.MySQLConnection = Depends(get_db)
):
    try:
        cursor = db.cursor()
        #先檢查目標屬於用戶
        cursor.execute("SELECT * FROM diary_entries WHERE id = %s AND user_id = %s", (entry_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Diary entry not found or not owned by current user")

        query = "DELETE FROM diary_entries WHERE id = %s AND user_id = %s"
        cursor.execute(query,(entry_id, current_user["id"]))
        db.commit()

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Diary entry not found")
        return {"message": "Diary deleted successfully"}
    except Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        

        


            
