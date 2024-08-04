import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from views import static_pages
from controllers import user_controller, diary_controller, booking_controller, order_controller

# 從環境變量獲取 ROOT_PATH，如果沒有設置則默認為空字符串
root_path = os.getenv('ROOT_PATH', '')

# 創建 FastAPI 應用，設置 root_path
app = FastAPI(root_path=root_path)

# 不加 root_path， FastAPI 自動處理
app.mount("/static", StaticFiles(directory="static"), name="static")

# API 路由
# root_path，FastAPI 自動處理
app.include_router(static_pages.router)
app.include_router(user_controller.router)
app.include_router(diary_controller.router)
app.include_router(booking_controller.router)
app.include_router(order_controller.router)

print(f"Current root_path: {root_path}")