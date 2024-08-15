import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from views import static_pages
from controllers import user_controller, diary_controller, booking_controller, order_controller, pic_controller, match_controller
import logging
import traceback

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 從環境變量獲取 ROOT_PATH，如果沒有設置則默認為空字符串
root_path = os.getenv('ROOT_PATH', '/app1')

# 創建 FastAPI 應用，設置 root_path
app = FastAPI()

@app.middleware("http")
async def add_root_path(request: Request, call_next):
    logger.info(f"Received request: {request.method} {request.url.path}")
    if not request.url.path.startswith(root_path):
        return RedirectResponse(url=f"{root_path}{request.url.path}")
    request.scope["path"] = request.scope["path"].replace(root_path, "", 1)
    response = await call_next(request)
    logger.info(f"Returning response: {response.status_code}")
    return response

# 靜態文件處理
app.mount(f"{root_path}/static", StaticFiles(directory="static"), name="static")

# API 路由
app.include_router(static_pages.router, prefix=root_path)
app.include_router(user_controller.router, prefix=root_path)
app.include_router(diary_controller.router, prefix=root_path)
app.include_router(pic_controller.router, prefix=root_path)
app.include_router(match_controller.router, prefix=root_path)

print(f"Current root_path: {root_path}")

@app.get(f"{root_path}/health")
async def health_check():
    return {"status": "healthy"}

@app.get(f"{root_path}/")
async def root():
    return {"message": "Welcome to the root of the application"}

# 全局異常處理器
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception: {str(exc)}")
    logger.error(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"message": "An unexpected error occurred", "detail": str(exc)},
    )