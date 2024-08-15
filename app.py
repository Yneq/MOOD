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

# 從環境變量獲取 ROOT_PATH，如果沒有設置則默認為 '/app1'
root_path = os.getenv('ROOT_PATH', '/app1')
print(f"Using root_path: {root_path}")

# 創建 FastAPI 應用
app = FastAPI()

@app.middleware("http")
async def handle_root_path(request: Request, call_next):
    logger.info(f"Received request: {request.method} {request.url.path}")
    
    if request.url.path == root_path or request.url.path == f"{root_path}/":
        # 如果請求的是根路徑，直接處理
        request.scope["path"] = "/"
    elif request.url.path.startswith(root_path):
        # 如果路徑以 root_path 開頭，移除 root_path
        request.scope["path"] = request.url.path[len(root_path):]
        if not request.scope["path"]:
            request.scope["path"] = "/"
    else:
        # 如果路徑不以 root_path 開頭，重定向到帶有 root_path 的 URL
        return RedirectResponse(url=f"{root_path}{request.url.path}")
    
    response = await call_next(request)
    logger.info(f"Returning response: {response.status_code}")
    return response

# 靜態文件處理
app.mount(f"{root_path}/static", StaticFiles(directory="static"), name="static")

# API 路由
app.include_router(static_pages.router)
app.include_router(user_controller.router)
app.include_router(diary_controller.router)
app.include_router(pic_controller.router)
app.include_router(match_controller.router)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/")
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