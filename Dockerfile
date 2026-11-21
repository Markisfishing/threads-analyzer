# Python Worker：Playwright 爬取 → 清理 → 分析 → 寫回 Supabase
# 基底映像已內建 Chromium 與系統相依套件，版本需與 requirements.txt 的 playwright 一致
FROM mcr.microsoft.com/playwright/python:v1.65.2-noble

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8 PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY worker/ worker/
COPY data/ data/

# 機密（.env、Threads 登入狀態）不進映像，執行時由 docker compose 提供
USER pwuser
ENTRYPOINT ["python", "-m", "worker"]
CMD ["poll"]
