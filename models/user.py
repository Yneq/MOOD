from pydantic import BaseModel, EmailStr

class User(BaseModel):
	name: str
	email: EmailStr
	password: str        

class UserResponse(BaseModel):
	id: int
	name: str
	email: EmailStr

class UserCheckin(BaseModel):
	email: EmailStr
	password: str
