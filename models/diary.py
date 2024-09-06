from pydantic import BaseModel, Field, validator
from datetime import datetime, date
from typing import Optional, Union

class PresigneUrlRequest(BaseModel):
    filename: str

class ProfileUpdateRequest(BaseModel):
    current_password: Optional[str] = None
    new_password: Optional[str] = None
    avatar_url: Optional[str] = None
    self_intro: Optional[str] = None


class MessageRequest(BaseModel):
    text: str
    imageUrl: str
    email: Optional[str] = None  # 添加 email 欄位，設為可選

class MessageResponse(BaseModel):
    id: int
    text: str
    imageUrl: Optional[str]
    email: str
    created_at: str

    class Config:
        orm_mode = True

class MoodData(BaseModel):
    mood_score: Optional[int] = None
    weather: Optional[str] = None


class DiaryEntryRequest(BaseModel):
    title: str
    content: str
    image_url: Optional[str] = None
    is_public: bool = False
    date: Optional[Union[date, datetime]] = None
    email: Optional[str] = None  # 添加 email 欄位，設為可選


class DiaryEntryResponse(BaseModel):
    id: int
    user_id: int
    title: str
    content: str
    image_url: Optional[str] = None
    is_public: bool = Field(..., description="0 for False, 1 for True")
    date: str
    created_at: str
    updated_at: str
    email: Optional[str] = None  # 將 email 設為可選字段
    mood_data: Optional[MoodData] = None


    
    class Config:
        orm_mode = True

    @validator('is_public', pre=True)
    def convert_is_public(cls, v):
        if isinstance(v, int):
            return bool(v)
        return v

class MoodEntryRequest(BaseModel):
    mood_score: Optional[int] = Field(None, ge=1, le=5)
    date: date
    weather: Optional[str] = None
    note: Optional[str] = None

class MoodEntryResponse(BaseModel):
    id: int
    user_id: int
    mood_score: Optional[int] = None
    date: date
    weather: Optional[str] = None
    note: Optional[str]
    created_at: datetime

