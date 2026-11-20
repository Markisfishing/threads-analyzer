"""固定、可重現的測試資料：30 篇貼文，經過 clean_posts 處理。"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from worker.cleaning import clean_posts

JOB = {"id": "job-s", "user_id": "u", "target_username": "sample", "max_posts": 30}
META = {"follower_count": 10000, "display_name": "Sample"}

TEXTS = [
    "大家覺得 AI 會取代設計師嗎？留言告訴我你的看法",
    "今天分享 AI 工具清單 https://example.com/tools",
    "週末去爬山，天氣超好 🎉",
    "新產品上線了，感謝大家支持！#產品 #上線",
    "跟 @friend 一起討論行銷策略",
    "你最常用哪個 AI 寫作工具？",
    "抱歉今天服務出問題，我們正在處理",
    "短短一句",
    "長文分享：" + "內容策略需要長期累積，" * 12,
    "你覺得遠端工作好還是進辦公室好？",
]


def raw_posts(n: int = 30) -> list[dict]:
    base = datetime(2026, 11, 2, 1, 0, tzinfo=timezone.utc)  # 台北時間週一 09:00
    rows = []
    for i in range(n):
        text = TEXTS[i % len(TEXTS)]
        is_question = "？" in text
        likes = 50 + (i * 37) % 200 + (300 if is_question else 0)
        replies = 5 + (i * 7) % 30 + (60 if is_question else 0)
        rows.append({
            "job_id": JOB["id"], "user_id": JOB["user_id"], "post_id": f"P{i:02d}",
            "post_url": f"https://www.threads.com/@sample/post/P{i:02d}",
            "published_at": (base + timedelta(hours=i * 13)).isoformat(),
            "text": text, "likes": likes, "replies": replies, "reposts": i % 5, "quotes": i % 3,
            "missing_fields": [],
        })
    return rows


def cleaned(n: int = 30) -> list[dict]:
    return clean_posts(JOB, raw_posts(n), META)
