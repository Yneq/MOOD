import asyncio
from datetime import datetime, timedelta
import pytz
from mysql.connector import connect, MySQLConnection
from typing import List, Dict, Tuple
from dependencies import get_db, get_current_user
import mysql.connector
from fastapi import FastAPI, HTTPException, APIRouter, Depends
import os
from dotenv import load_dotenv
from models.diary import PresigneUrlRequest, DiaryEntryResponse, DiaryEntryRequest
from datetime import datetime

load_dotenv()



# 導入您的代碼中的函數
from controllers.match_controller import User, daily_matching, calculate_similarity

def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("RDS_HOST"),
        user=os.getenv("DB_USER"),
        password=os.getenv("RDS_PASSWORD"),
        database=os.getenv("RDS_MOOD"),
        time_zone="-08:00"
    )

# 模擬獲取日記條目

async def mock_get_diary_entries(skip: int, limit: int, current_user: Dict, db: mysql.connector.connection.MySQLConnection) -> List[DiaryEntryResponse]:
    cursor = db.cursor(dictionary=True)
    cursor.execute(
        "SELECT * FROM diary_entries WHERE user_id = %s LIMIT %s OFFSET %s",
        (current_user['id'], limit, skip)
    )
    entries = cursor.fetchall()
    cursor.close()
    
    def format_entry(entry):
        entry['date'] = entry['date'].strftime("%Y-%m-%d")
        entry['created_at'] = entry['created_at'].strftime("%Y-%m-%d %H:%M:%S")
        entry['updated_at'] = entry['updated_at'].strftime("%Y-%m-%d %H:%M:%S")
        return entry
    
    diary_entries = [DiaryEntryResponse(**format_entry(entry)) for entry in entries]
    
    if diary_entries:
        print("樣本日記條目:", diary_entries[0])  # 打印第一個條目作為樣本
    
    return diary_entries

# 測試函數
async def test_daily_matching():
    db = get_db_connection()
    try:
        # 獲取測試用戶
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT id FROM users LIMIT 10")
        test_users = cursor.fetchall()
        cursor.close()

        # 模擬日記條目和用戶對象
        users = []
        for user_data in test_users:
            user = User(user_data['id'])
            entries = await mock_get_diary_entries(0, 100, {"id": user.id}, db)
            for entry in entries:
                user.add_diary_entry(entry)
            user.calculate_posting_frequency()
            users.append(user)

        # 執行日記匹配
        matches = await daily_matching(db)

        # 輸出結果
        print(f"找到 {len(matches)} 對匹配：")
        for i, (user1, user2) in enumerate(matches, 1):
            similarity = calculate_similarity(user1, user2)
            print(f"匹配 {i}: 用戶 {user1.id} 和用戶 {user2.id} (相似度: {similarity:.2f})")

        # 檢查匹配結果是否已寫入資料庫
        cursor = db.cursor(dictionary=True)
        today = datetime.now(pytz.utc).date()
        cursor.execute("SELECT * FROM user_matches WHERE DATE(match_date) = %s", (today,))
        db_matches = cursor.fetchall()
        cursor.close()

        print(f"資料庫中今日的匹配數：{len(db_matches)}")

    except Exception as e:
        print(f"測試過程中發生錯誤: {str(e)}")
        import traceback
        traceback.print_exc()  # 這會打印完整的錯誤堆棧
    finally:
        db.close()

# 運行測試
if __name__ == "__main__":
    asyncio.run(test_daily_matching())