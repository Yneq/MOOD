import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from views import static_pages
from controllers import user_controller, diary_controller, pic_controller, match_controller
import logging
import traceback
import threading
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 從環境變量獲取 ROOT_PATH，如果沒有設置則默認為空字符串
# root_path = os.getenv('ROOT_PATH', '')

# 創建 FastAPI 應用，設置 root_path
# app = FastAPI(root_path=root_path)
app = FastAPI()



app.mount("/static", StaticFiles(directory="static"), name="static")
# app.mount(f"{root_path}/static", StaticFiles(directory="static"), name="static")
# API 路由
# root_path，FastAPI 自動處理
app.include_router(static_pages.router)
app.include_router(user_controller.router)
app.include_router(diary_controller.router)
app.include_router(pic_controller.router)
app.include_router(match_controller.router)


# print(f"Current root_path: {root_path}")


# 清理連接的線程
# def cleanup_connections():
#     while True:
#         time.sleep(300)  # 每 5 分鐘檢查一次
#         try:
#             pool._remove_connections()
#             logger.info("已執行連接池清理")
#         except Exception as e:
#             logger.error(f"清理連接時發生錯誤: {str(e)}")

# threading.Thread(target=cleanup_connections, daemon=True).start()

# 全局異常處理器
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        # 對於 HTTPException，保留原始狀態碼和詳細信息
        return JSONResponse(
            status_code=exc.status_code,
            content={"message": exc.detail},
        )
    else:
        # 對於其他類型的異常，記錄詳細信息並返回 500 錯誤
        logger.error(f"Global exception: {str(exc)}")
        logger.error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"message": "An unexpected error occurred"},
        )
    