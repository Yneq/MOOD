from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, HTMLResponse
import os

router = APIRouter()

root_path = os.getenv('ROOT_PATH', '')

async def serve_html(file_path: str, request: Request):
    with open(file_path, 'r') as file:
        content = file.read()
		# 注入根路徑到 HTML
        content = content.replace('</head>', f'<script>window.ROOT_PATH = "{root_path}";</script></head>')
        # 動態替換靜態文件路徑
        content = content.replace('href="/static/', f'href="{root_path}/static/')
        content = content.replace('src="/static/', f'src="{root_path}/static/')

    return HTMLResponse(content)

@router.get("/", include_in_schema=False)
async def index(request: Request):
    return await serve_html("./static/index.html", request)
@router.get("/diary", include_in_schema=False)
async def diary(request: Request, id: int):
    return await serve_html("./static/index.html", request)
@router.get("/board", include_in_schema=False)
async def board(request: Request):
    return await serve_html("./static/index.html", request)
@router.get("/match", include_in_schema=False)
async def match(request: Request):
    return await serve_html("./static/index.html", request)
	
