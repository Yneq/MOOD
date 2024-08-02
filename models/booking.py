from pydantic import BaseModel
from models.attraction import Attraction

class BookingDataGet(BaseModel):
	attraction: Attraction
	date: str
	time: str
	price: int

class BookingDataPost(BaseModel):
	attractionId: int
	date: str
	time: str
	price: int

class ErrorResponse(BaseModel):
	error: bool
	message: str 