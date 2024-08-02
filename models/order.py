from pydantic import BaseModel, EmailStr
from models.attraction import Attraction

class Trip(BaseModel):
	attraction: Attraction
	date: str
	time: str

class Contact(BaseModel):
	name: str
	email: EmailStr
	phone: str

class Order(BaseModel):
	price: int
	trip: Trip
	contact: Contact

class OrderRequest(BaseModel):
	prime: str
	order: Order

class OrderDetail(BaseModel):
	number: str
	price: int
	trip: Trip
	contact: Contact
	status: int

class ErrorResponse(BaseModel):
	error: bool
	message: str 

