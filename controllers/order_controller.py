from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from models.order import OrderRequest, OrderDetail, ErrorResponse, Trip, Attraction, Contact
from dependencies import get_db, get_current_user
import time
import datetime
import requests

router = APIRouter()


@router.post("/api/orders", responses={
	200: {"description": "orders created successfully"},
    400: {"model": ErrorResponse, "description": "訂單建立失敗，輸入不正確或其他原因"},
    403: {"model": ErrorResponse, "description": "未登入系統，拒絕存取"},
    500: {"model": ErrorResponse, "description": "伺服器內部錯誤"}
})
async def create_order(order_request: OrderRequest, current_user: dict = Depends(get_current_user)):
	print(f"Received booking data: {order_request}")
	print(f"Current user: {current_user}")
	db = get_db()
	cursor = db.cursor()
	try:
		prime = order_request.prime
		order = order_request.order
		price = order.price   
		trip = order.trip
		contact = order.contact

		timestamp = int(time.time())
		now = datetime.datetime.now()
		order_number = now.strftime("Y%m%d%H%M%S%f")

		attraction_id = trip.attraction.id
		attraction_name = trip.attraction.name
		attraction_address = trip.attraction.address
		attraction_image = trip.attraction.image
		trip_date = trip.date
		trip_time = trip.time
		contact_name = contact.name
		contact_email = contact.email
		contact_phone = contact.phone
	
		payment_status = 0 
		payment_message = "UNPAID"  

		query = """
			INSERT INTO orders (order_number, prime, price, attraction_id, attraction_name, attraction_address, 
			attraction_image, date, time, contact_name, contact_email, contact_phone, payment_status, 
			payment_message, user_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
		"""
		values = (
			order_number,
			prime,
			price,
			attraction_id,
			attraction_name,
			attraction_address,
			attraction_image,
			trip_date,
			trip_time,
			contact_name,
			contact_email,
			contact_phone,
			payment_status,
			payment_message,
			current_user["id"]
		)
		cursor.execute(query, values)
		db.commit()

		pay_by_prime_url = "https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime"
		headers = {
            "Content-Type": "application/json",
            "x-api-key": "partner_5S6s0EozVToOKwHvzqMJjMXU0IJ05IS7J5DMikxlYJbBmx5poM9jBS1a"
        }
		payment_payload = {
            "prime": prime,
            "partner_key": "partner_5S6s0EozVToOKwHvzqMJjMXU0IJ05IS7J5DMikxlYJbBmx5poM9jBS1a",
            "merchant_id": "yneq_CTBC",
            "details": "TapPay Test",
            "amount": price,
            "cardholder": {
                "phone_number": contact_phone,
                "name": contact_name,
                "email": contact_email,
                "zip_code": "",
                "address": attraction_address,
                "national_id": ""
            },
            "remember": True
        }
		payment_response = requests.post(pay_by_prime_url, json=payment_payload, headers=headers)
		payment_result = payment_response.json()

		print(f"Payment response: {payment_result}")  # 打印支付結果以進行調試

		if payment_response.status_code == 200 and payment_result["status"] == 0:
			payment_status = 1
			payment_message = "PAID"
		else:
			payment_status = 0
			payment_message = "UNPAID"

		update_query = """
			UPDATE orders
			SET payment_status = %s, payment_message = %s
			WHERE order_number = %s
		"""

		cursor.execute(update_query, (payment_status, payment_message, order_number))
		db.commit()

		return {"data": {
			"number": order_number,
			"payment": {
				"status": payment_status,
				"message": payment_message
				}
			}}
	except Exception as e:
		print(f"Error: {str(e)}")
		raise HTTPException(status_code=500, detail="伺服器內部錯誤")
	finally:
		cursor.close()
		db.close()

@router.get("/api/order/{orderNumber}", response_model=OrderDetail, responses={
	200: {"description": "Order Got successfully"},
	403: {"model": ErrorResponse, "description": "未登入系統，拒絕存取"}
})
async def get_order(orderNumber: str, current_user: dict = Depends(get_current_user)):
	db = get_db()
	cursor = db.cursor(dictionary=True)
	try:
		print(f"Fetching order for orderNumber: {orderNumber}, userId: {current_user['id']}")
		cursor.execute("SELECT * FROM orders WHERE order_number = %s AND user_id = %s", (orderNumber, current_user["id"]))
		order = cursor.fetchone()

		if order is None:
			return {"data": None}
		order_detail = OrderDetail(
			number = order["order_number"],
			price = order["price"],
			trip = Trip(
				attraction = Attraction(
					id = order["attraction_id"],
					name = order["attraction_name"],
					address = order["attraction_address"],
					image = order["attraction_image"],
				),
				date = order["date"].strftime('%Y-%m-%d'),
				time = order["time"],
			),
			contact = Contact(
				name = order["contact_name"],
				email = order["contact_email"],
				phone = order["contact_phone"],
			),
			status = order["payment_status"]
		)
		return order_detail		

	except Exception as e:
		print(f"Error: {str(e)}")
		raise HTTPException(status_code=500, detail="伺服器內部錯誤")
	finally:
		cursor.close()
		db.close()


