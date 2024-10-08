FROM --platform=linux/amd64 python:3.12-slim

# 設置工作目錄
WORKDIR /app

# 安裝 curl 和調試工具
RUN apt-get update && apt-get install -y curl procps net-tools

# 複製 requirements.txt
COPY requirements.txt .

# 安裝 Python 依賴
RUN pip install --no-cache-dir -r requirements.txt

# 將當前目錄的內容複製到容器中的/app
COPY . .

# 創建靜態文件目錄
RUN mkdir -p /app/static/

# 暴露端口
EXPOSE 3001

# 使用 uvicorn 運行應用
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "3001"]