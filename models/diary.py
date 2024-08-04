from pydantic import BaseModel, Field, validator
from datetime import datetime, date
from typing import Optional

class PresigneUrlRequest(BaseModel):
    filename: str

#class MessageRequest(BaseModel):
#    text: str
#    imageUrl: str

class DiaryEntryRequest(BaseModel):
    title: str
    content: str
    image_url: str = None
    is_public: bool = False
    date: date

class DiaryEntryResponse(BaseModel):
    id: int
    user_id: int
    title: str
    content: str
    image_url: Optional[str] = None
    is_public: bool = Field(..., description="0 for False, 1 for True")
    date: date
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            date: lambda v: v.isoformat()
        }

    @validator('is_public', pre=True)
    def convert_is_public(cls, v):
        if isinstance(v, int):
            return bool(v)
        return v