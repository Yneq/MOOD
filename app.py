from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from views import static_pages
from controllers import user_controller, attraction_controller, booking_controller, order_controller

app = FastAPI()

# 靜態頁面
app.mount("/app1/static", StaticFiles(directory="static"), name="static")
app.include_router(static_pages.router)

# API 路由
app.include_router(static_pages.router, prefix="/app1")
app.include_router(user_controller.router, prefix="/app1")
app.include_router(attraction_controller.router, prefix="/app1")
app.include_router(booking_controller.router, prefix="/app1")
app.include_router(order_controller.router, prefix="/app1")
