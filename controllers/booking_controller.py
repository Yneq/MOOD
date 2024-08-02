from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional
import json
from models.booking import BookingDataGet, BookingDataPost, ErrorResponse
from dependencies import get_db, get_current_user
import redis.asyncio as redis


router = APIRouter()


# 設置 Redis 客戶端
redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)

@router.get("/api/booking", response_model=Optional[BookingDataGet], responses={403: {"model": ErrorResponse}})
async def get_booking(current_user: dict = Depends(get_current_user)):
	cache_key = f"booking:{current_user['id']}"
	
	cached_booking = await redis_client.get(cache_key)
	if cached_booking is not None:
		print(f"Cache hit: {cache_key}") # 調試信息
		return json.loads(cached_booking)

	print(f"Cache miss: {cache_key}")  # 調試信息


	db = get_db()
	cursor = db.cursor(dictionary=True)
	try:
		cursor.execute("""
				SELECT b.*, a.name, a.address, a.images
				FROM bookings b
				JOIN attractions a ON b.attractionId = a.id
				WHERE b.userId = %s
		""", (current_user["id"],))
		booking_data = cursor.fetchone()

		if booking_data:
			images = json.loads(booking_data["images"])
			first_image_url = images[0] if images else None

			booking = {
				"attraction": {
					"id": booking_data["attractionId"],
					"name": booking_data["name"],
					"address": booking_data["address"],
					"image": first_image_url
				},
				"date": str(booking_data["date"]),
				"time": booking_data["time"],
				"price": booking_data["price"]
			}
			# 將結果存儲到 Redis 快取
			await redis_client.set(cache_key, json.dumps(booking), ex=3600)
			print(f"Set Redis cache: {cache_key} -> {json.dumps(booking)}")  # 調試信息
			return booking
		else:
			return None
			
	except Exception as e:
		print(f"Database error: {str(e)}")
		raise HTTPException(status_code=500, detail="伺服器內部錯誤")
	finally:
		cursor.close()
		db.close()

@router.post("/api/booking", responses={
	200: {"description": "Booking created successfully"},
    400: {"model": ErrorResponse, "description": "Bad Request"},
    403: {"model": ErrorResponse, "description": "Forbidden"},
    500: {"model": ErrorResponse, "description": "Internal Server Error"}
})
async def create_booking(bookings: BookingDataPost, current_user: dict = Depends(get_current_user)):
	
	db = get_db()
	cursor = db.cursor()
	try:
		cursor.execute("DELETE FROM bookings WHERE userId = %s", (current_user["id"],))

		cursor.execute("INSERT INTO bookings (attractionId, date, time, price, userId) VALUES (%s, %s, %s, %s, %s)",
		(bookings.attractionId, bookings.date, bookings.time, bookings.price, current_user["id"]))
		db.commit()

		# 刪除對應的 Redis 快取
		cache_key = f"booking:{current_user['id']}"
		await redis_client.delete(cache_key)
		print(f"Deleted Redis cache: {cache_key}")  # 調試信息

		return {"description": "Booking created successfully"}
	except Exception as e:
		print(f"Database Error: {str(e)}")
		return JSONResponse(status_code=500, content={
			"error": True,
            "message": "伺服器內部錯誤"
		})
	finally:
		cursor.close()
		db.close()

@router.delete("/api/booking", responses={
	200: {"description": "Booking deleted successfully", "content": {"application/json": {"example": {"ok": "true"}}}},
	403: {"model": ErrorResponse}
	})
async def delete_booking(current_user: dict = Depends(get_current_user)):
	db = get_db()
	cursor = db.cursor()
	try:
		cursor.execute("DELETE FROM bookings WHERE userId = %s", (current_user["id"],))
		db.commit()

		# 刪除對應的 Redis 快取
		cache_key = f"booking:{current_user['id']}"
		await redis_client.delete(cache_key)

	except Exception as e:
		print(f"Database Error: {str(e)}")
		return JSONResponse(status_code=500, content={
			"error": True,
            "message": "伺服器內部錯誤"
		})
	finally:
		cursor.close()
		db.close()
