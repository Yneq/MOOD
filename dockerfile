FROM --platform=linux/amd64 python:3.12-slim

# 設置工作目錄
WORKDIR /app

# 安裝 curl 和調試工具（不需要安裝 Nginx 和 Redis，因為它們在單獨的容器中運行）
RUN apt-get update && apt-get install -y curl procps net-tools

# 複製 requirements.txt
COPY requirements.txt .

# 安裝 Python 依賴
RUN pip3 install --no-cache-dir -r requirements.txt

# 將當前目錄的內容複製到容器中的/app
COPY . .

# 創建靜態文件目錄
RUN mkdir -p /app/static/

# 暴露端口（只需要暴露應用端口）
EXPOSE 3001

# 運行應用
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3001"]