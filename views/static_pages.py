from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

router = APIRouter()

@router.get("/", include_in_schema=False)
async def index(request: Request):
	return FileResponse("./static/index.html", media_type="text/html")
@router.get("/diary", include_in_schema=False)
async def diary(request: Request, id: int):
	return FileResponse("./static/diary.html", media_type="text/html")
@router.get("/board", include_in_schema=False)
async def board(request: Request):
	return FileResponse("./static/board.html", media_type="text/html")
@router.get("/match", include_in_schema=False)
async def match(request: Request):
	return FileResponse("./static/match.html", media_type="text/html")
	
