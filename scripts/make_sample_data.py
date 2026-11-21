"""產生 data/sample_posts.json：虛構帳號 @sample_creator 的 40 篇貼文（mock dataset）。

內容與數字皆為虛構，固定亂數種子，重跑結果相同。用於離線報告示範，不代表任何真實帳號。

    .venv\\Scripts\\python scripts\\make_sample_data.py
    .venv\\Scripts\\python -m worker report --input data/sample_posts.json --out reports/sample
"""
from __future__ import annotations

import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "sample_posts.json"

# (文字, 互動基準倍率)：提問、短句、晚間發文的互動刻意較高，讓報告有可觀察的差異
TEXTS = [
    ("你們早上第一件事是滑手機還是喝咖啡？", 2.2),
    ("大家覺得 AI 會取代設計師嗎？留言說說你的看法", 2.6),
    ("整理了 10 個我每天用的效率工具 https://example.com/tools", 0.7),
    ("新企劃上線！感謝一路支持的大家 #新企劃 #感謝", 1.0),
    ("跟 @design.lab 聊了一下午的品牌設計，收穫滿滿", 0.9),
    ("今天只想說：休息也是工作的一部分", 1.6),
    ("長文分享：" + "經營社群最重要的是持續輸出與真誠互動，" * 6, 0.6),
    ("你最常用哪個 AI 寫作工具？我先說我的", 2.4),
    ("抱歉昨天的直播延期了，改到週五晚上", 0.5),
    ("週末去爬山，天氣超好 🌄", 1.1),
    ("如果只能推薦一本書給新手創作者，你會選哪本？", 2.0),
    ("本週筆記 https://example.com/notes #每週筆記", 0.6),
    ("失敗了三次的提案，終於過了", 1.8),
    ("遠端工作兩年，我學到最重要的一件事", 1.3),
    ("限時分享：內容排程表範本 https://example.com/template", 0.8),
    ("有人跟我一樣半夜最有靈感嗎？", 2.1),
    ("感謝 @coffee.studio 的招待 ☕", 0.7),
    ("小提醒：發文前先想清楚你想讓讀者做什麼", 1.4),
    ("#創作日常 今天寫了 3000 字", 0.9),
    ("最近在思考內容的長期價值，短影音之外還有什麼可能", 1.0),
]


def main() -> None:
    rnd = random.Random(20261121)
    start = datetime(2026, 9, 28, 0, 0, tzinfo=timezone(timedelta(hours=8)))
    posts = []
    t = start
    for i in range(40):
        text, mult = TEXTS[i % len(TEXTS)]
        t += timedelta(hours=rnd.choice([18, 22, 26, 30, 40]))
        hour = rnd.choice([8, 9, 12, 13, 18, 20, 21, 22, 23])
        ts = t.replace(hour=hour, minute=rnd.randint(0, 59))
        evening = 1.35 if hour >= 20 else 1.0
        base = rnd.uniform(120, 260) * mult * evening
        likes = int(base)
        replies = int(base * rnd.uniform(0.05, 0.12) * (1.8 if "？" in text else 1.0))
        posts.append({
            "post_id": f"S{i:03d}",
            "post_url": f"https://www.threads.com/@sample_creator/post/S{i:03d}",
            "published_at": ts.isoformat(),
            "text": text,
            "likes": likes,
            "replies": replies,
            "reposts": int(base * rnd.uniform(0.01, 0.04)),
            "quotes": int(base * rnd.uniform(0.0, 0.015)),
        })
    # 示範資料清理：一篇重複、一篇缺讚數、一篇爆紅異常值
    posts.append(dict(posts[5]))
    posts[12]["likes"] = None
    posts[30]["likes"], posts[30]["replies"] = 4200, 380
    posts.sort(key=lambda p: p["published_at"], reverse=True)

    data = {
        "_note": "虛構的 mock dataset，帳號與數字皆非真實資料；由 scripts/make_sample_data.py 產生。",
        "account": {"username": "sample_creator", "display_name": "Sample Creator", "follower_count": 12500},
        "posts": posts,
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(OUT)


if __name__ == "__main__":
    main()
