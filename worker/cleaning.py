"""資料清理（PRD F4）：去重、數字解析、缺失欄位、文字特徵、貼文類型、互動指標、異常值。"""
from __future__ import annotations

import re
from statistics import quantiles
from typing import Any

URL_RE = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)
# hashtag：# 後接中英數字與底線（Threads 也允許中文標籤）
HASHTAG_RE = re.compile(r"(?<![\w&])#([0-9A-Za-z_一-鿿㐀-䶿]+)")
MENTION_RE = re.compile(r"(?<![\w@])@([A-Za-z0-9._]{1,30})")
EMOJI_RE = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF\U00002B00-\U00002BFF\U0001F000-\U0001F2FF]"
)

TYPE_LINK, TYPE_HASHTAG, TYPE_MENTION, TYPE_TEXT = "含連結", "含 hashtag", "含 mention", "純文字"
OUTLIER_IQR_K = 3.0


def parse_count(value: Any) -> int | None:
    """「1.2萬」「1.2K」「3,456」「987」→ 整數；無法解析回傳 None（AC4.1）。"""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    s = str(value).strip().replace(",", "").replace(" ", "")
    if not s:
        return None
    m = re.fullmatch(r"(\d+(?:\.\d+)?)(萬|万|億|亿|[KkMm])?", s)
    if not m:
        return None
    num = float(m.group(1))
    mult = {"萬": 1e4, "万": 1e4, "億": 1e8, "亿": 1e8, "K": 1e3, "k": 1e3, "M": 1e6, "m": 1e6}.get(m.group(2) or "", 1)
    return int(round(num * mult))


def text_features(text: str | None) -> dict:
    """字數（去除 URL 後、不含空白）、hashtag、mention、URL、emoji 數量（AC4.4）。"""
    text = text or ""
    urls = URL_RE.findall(text)
    without_urls = URL_RE.sub("", text)
    hashtags = HASHTAG_RE.findall(without_urls)
    mentions = MENTION_RE.findall(without_urls)
    types = []
    if urls:
        types.append(TYPE_LINK)
    if hashtags:
        types.append(TYPE_HASHTAG)
    if mentions:
        types.append(TYPE_MENTION)
    if not types:
        types.append(TYPE_TEXT)
    return {
        "char_count": len(re.sub(r"\s+", "", without_urls)),
        "hashtag_count": len(hashtags),
        "mention_count": len(mentions),
        "url_count": len(urls),
        "emoji_count": len(EMOJI_RE.findall(text)),
        "hashtags": [h.lower() for h in hashtags],
        "mentions": [m.lower() for m in mentions],
        "post_types": types,
    }


def engagement_of(row: dict) -> int | None:
    parts = [row.get(k) for k in ("likes", "replies", "reposts", "quotes")]
    vals = [v for v in parts if v is not None]
    return sum(vals) if vals else None


def score_of(row: dict) -> int | None:
    """互動分數 = like + 2 × reply（PRD D2）；任一缺失則為 None。"""
    if row.get("likes") is None or row.get("replies") is None:
        return None
    return row["likes"] + 2 * row["replies"]


def dedupe(posts: list[dict]) -> list[dict]:
    """以 post_id 去重；沒有 post_id 時以（發文時間, 文字前 50 字）去重（AC4.2）。後出現的覆蓋先出現的。"""
    seen: dict[Any, dict] = {}
    for p in posts:
        key = p.get("post_id") or (p.get("published_at"), (p.get("text") or "")[:50])
        seen[key] = p
    return list(seen.values())


def mark_outliers(rows: list[dict]) -> None:
    """IQR 法：engagement > Q3 + 3×IQR 標記為異常值（樣本 < 4 不判斷）。"""
    vals = [r["engagement"] for r in rows if r.get("engagement") is not None]
    if len(vals) < 4:
        for r in rows:
            r["is_outlier"] = False
        return
    q1, _, q3 = quantiles(vals, n=4, method="inclusive")
    upper = q3 + OUTLIER_IQR_K * (q3 - q1)
    for r in rows:
        e = r.get("engagement")
        r["is_outlier"] = bool(e is not None and e > upper)


def clean_posts(job: dict, posts: list[dict], meta: dict | None = None) -> list[dict]:
    followers = (meta or {}).get("follower_count")
    rows: list[dict] = []
    for p in dedupe(posts):
        r = dict(p)
        missing = set(r.get("missing_fields") or [])
        for k in ("likes", "replies", "reposts", "quotes"):
            r[k] = parse_count(r.get(k))
            if r[k] is None:
                missing.add(k)
        if not r.get("published_at"):
            missing.add("published_at")
        r.update(text_features(r.get("text")))
        r["engagement"] = engagement_of(r)
        r["score"] = score_of(r)
        r["engagement_rate"] = (
            round(r["engagement"] / followers, 8) if followers and r["engagement"] is not None else None
        )
        r["missing_fields"] = sorted(missing)
        r["group_label"] = None
        rows.append(r)
    mark_outliers(rows)
    return rows
