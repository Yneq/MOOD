FROM --platform=linux/amd64 python:3.12-slim

# 設置工作目錄
WORKDIR /app

# 安裝 Nginx、Redis、curl 和調試工具
RUN apt-get update && apt-get install -y nginx redis-server curl procps net-tools

# 複製 requirements.txt（確保這個文件在你的專案目錄中）
COPY requirements.txt .

# 安裝 Python 依賴
RUN pip3 install --no-cache-dir -r requirements.txt

# 將當前目錄的內容複製到容器中的/app
COPY . .

# 複製 Nginx 配置文件（確保你有一個適合的 nginx.conf 文件）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 確保移除默認的 default 文件
RUN rm -f /etc/nginx/sites-enabled/default

# 創建靜態文件目錄
RUN mkdir -p /app/static/

# 暴露端口
EXPOSE 80 3000 6379

# 創建並設置啟動腳本
RUN echo '#!/bin/bash\n\
nginx\n\
service redis-server start\n\
uvicorn main:app --host 0.0.0.0 --port 3000\n\
' > /app/start.sh && chmod +x /app/start.sh

# 運行啟動腳本
CMD ["/app/start.sh"]