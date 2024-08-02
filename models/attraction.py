from pydantic import BaseModel

class Attraction(BaseModel):
	id: int
	name: str
	address: str
	image: str
