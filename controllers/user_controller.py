from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from models.user import User, UserResponse, UserCheckin
from dependencies import get_db, get_current_user, create_access_token

router = APIRouter()


@router.post("/api/user")
async def create_user(user: User):
	try:
		db = get_db()
		cursor = db.cursor()
		cursor.execute("SELECT * FROM users WHERE email=%s", (user.email,))
		existing_user = cursor.fetchone()
		if existing_user:
			return JSONResponse(status_code=400, content = {
				"error": True,
				"message": "註冊失敗，重複的 Email 或其他原因"
			})
		cursor.execute("INSERT INTO users(name, email, password) VALUES (%s, %s, %s)", (user.name, user.email, user.password))
		db.commit()
		cursor.close()
		db.close()
		return {"ok": True}
	except Exception as e:
		print(f"Database error: {str(e)}") 
		return JSONResponse(status_code=500, content={
			"error": True,
			"message": "伺服器內部錯誤"
		})
	
@router.get("/api/user/auth", response_model=UserResponse)
async def read_user(current_user: dict = Depends(get_current_user)):
	try:
		if not current_user:
			raise HTTPException(status_code=401, detail="Unauthorized")

		db = get_db()
		cursor = db.cursor()
		cursor.execute("SELECT id, name, email FROM users WHERE id=%s", (current_user["id"], ))
		user = cursor.fetchone()
		cursor.close()
		db.close()

		if not user:
			raise HTTPException(status_code=404, detail="User not found")
		return UserResponse(id=user[0], name=user[1], email=user[2])
	except Exception as e:
		print(f"Database error: {str(e)}")
		raise HTTPException(status_code=500, detail="伺服器內部錯誤")

@router.put("/api/user/auth")
async def check_user(user: UserCheckin):
	try:
		db = get_db()
		cursor = db.cursor(dictionary=True)
		cursor.execute("SELECT * FROM users WHERE email=%s AND password=%s", (user.email, user.password))
		user_data = cursor.fetchone()
		cursor.close()
		db.close()
		
		if not user_data:
			return JSONResponse(status_code=400,content={
				"error": True,
				"message": "登入失敗，帳號或密碼錯誤或其他原因"
			})
		access_token = await create_access_token(data={
			"id": user_data["id"],
			"name": user_data["name"],
			"email": user_data["email"],
		})
		return {"token": access_token}
		
	except HTTPException as http_exc:
		print(f"HTTP Exception: {str(http_exc)}") 
		return JSONResponse(status_code=http_exc.status_code, content={"error": True, "message": http_exc.detail})
	except Exception as e:
		print(f"General Exception: {str(e)}")
		return JSONResponse(status_code=500, content={
			"error": True,
			"message": f"伺服器內部錯誤: {str(e)}"
		})
