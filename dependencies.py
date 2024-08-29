from fastapi.security import OAuth2PasswordBearer
import mysql.connector
from mysql.connector import pooling
import datetime
import jwt
from fastapi import HTTPException, Depends
from dotenv import load_dotenv
import os
import logging



logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

load_dotenv() 

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")


rds_db_config = {
	"user": os.getenv("DB_USER"),
	"host": os.getenv("RDS_HOST"),
	"password": os.getenv("RDS_PASSWORD"),
	"database": os.getenv("RDS_MOOD"),
    "connection_timeout": 300,  # 5 分鐘
	"autocommit": True,  # 自動提交事務
}

# 建立 MySQL 連接池
pool = pooling.MySQLConnectionPool(
	pool_name = "aws_rds_pool",
	pool_size = 15,
    pool_reset_session=True,
	**rds_db_config
)
print("Connection pool created successfully")


def get_db():
    connection = None
    try:
        connection = pool.get_connection()
        connection.ping(reconnect=True, attempts=3, delay=5)  # 確保連接是活的
        if connection is None:
            raise HTTPException(status_code=503, detail="無法獲取數據庫連接")
        yield connection
    except pooling.PoolError as e:
        logger.error(f"數據庫連接池錯誤: {str(e)}")
        raise HTTPException(status_code=503, detail=f"數據庫連接池錯誤: {str(e)}")
    except Exception as e:
        logger.error(f"獲取數據庫連接時發生意外錯誤: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"獲取數據庫連接時發生意外錯誤: {str(e)}")
    finally:
        if connection is not None:
            try:
                connection.close()  # 將連接返回到連接池
                logger.debug("數據庫連接已返回到連接池")
            except Exception as e:
                logger.error(f"返回連接到連接池時發生錯誤: {str(e)}", exc_info=True)

async def create_access_token(data: dict, expires_delta: datetime.timedelta = datetime.timedelta(days=7)):
	to_encode = data.copy()
	expire = datetime.datetime.utcnow() + expires_delta
	to_encode.update({"exp":expire})
	encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
	return encoded_jwt

async def decode_access_token(token: str):
	try:
		decoded_token = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
	#	print(decoded_token)
		return decoded_token if decoded_token["exp"] >= datetime.datetime.utcnow().timestamp() else None
	except jwt.PyJWTError:
		return None

async def get_current_user(token: str = Depends(oauth2_scheme)):
	payload = await decode_access_token(token)
	if payload is None:
		raise HTTPException(status_code=401, detail="Invalid or expired token")
#	print(payload)
	return payload

def diagnose_pool():
    stats = pool.get_stats()
    logger.info(f"連接池統計: {stats}")
    
    if stats['num_available_connections'] == 0:
        logger.warning("警告：所有連接都在使用中")
    
    if stats['total_connections_created'] > pool.pool_size * 2:
        logger.warning("警告：創建的連接數量異常高，可能存在連接洩漏")
    
    return stats  # 返回統計信息，以便在需要時進行進一步處理