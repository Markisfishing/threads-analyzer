"""數據分析指標（PRD F5）。輸入為清理後的貼文列，輸出可直接存入 analysis_results.summary 的 JSON。"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime
from statistics import mean, median
from typing import Iterable
from zoneinfo import ZoneInfo

from worker.text import keywords

TZ = ZoneInfo("Asia/Taipei")
WEEKDAYS = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"]
LENGTH_BINS = [(0, 50, "0–50 字"), (51, 150, "51–150 字"), (151, 300, "151–300 字"), (301, None, "300 字以上")]
METRICS = ("likes", "replies", "reposts", "quotes", "engagement")
TOP_N = 5


def to_taipei(iso: str | None) -> datetime | None:
    if not iso:
        return None
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(TZ)


def _r(x: float | None, nd: int = 2) -> float | None:
    return None if x is None else round(x, nd)


def stat(values: Iterable[float | None]) -> dict:
    """平均、中位數與有效樣本數；NULL 不計入（AC4.5）。"""
    vals = [v for v in values if v is not None]
    if not vals:
        return {"mean": None, "median": None, "n": 0}
    return {"mean": _r(mean(vals)), "median": _r(median(vals)), "n": len(vals)}


def rank(values: list[float]) -> list[float]:
    """平均名次（處理同分）。"""
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def spearman(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 3 or len(xs) != len(ys):
        return None
    rx, ry = rank(xs), rank(ys)
    mx, my = mean(rx), mean(ry)
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    vx = sum((a - mx) ** 2 for a in rx)
    vy = sum((b - my) ** 2 for b in ry)
    if vx == 0 or vy == 0:
        return None
    return round(cov / (vx * vy) ** 0.5, 3)


def overview(posts: list[dict], meta: dict) -> dict:
    dates = sorted(d for d in (to_taipei(p.get("published_at")) for p in posts) if d)
    clean = [p for p in posts if not p.get("is_outlier")]
    span_days = (dates[-1] - dates[0]).total_seconds() / 86400 if len(dates) >= 2 else None
    return {
        "post_count": len(posts),
        "follower_count": meta.get("follower_count"),
        "display_name": meta.get("display_name"),
        "first_post_at": dates[0].isoformat() if dates else None,
        "last_post_at": dates[-1].isoformat() if dates else None,
        "posts_per_week": _r(len(dates) / span_days * 7, 1) if span_days else None,
        "outlier_count": sum(1 for p in posts if p.get("is_outlier")),
        "missing_count": sum(1 for p in posts if p.get("missing_fields")),
        **{k: stat(p.get(k) for p in posts) for k in METRICS},
        # 互動率以百分比呈現
        "engagement_rate_pct": stat(
            p["engagement_rate"] * 100 if p.get("engagement_rate") is not None else None for p in posts
        ),
        "engagement_excl_outliers": stat(p.get("engagement") for p in clean),
    }


def top_posts(posts: list[dict], n: int = TOP_N) -> dict:
    """互動率最高前 n 篇；粉絲數缺失時改依總互動排序（E11、AC5.2）。"""
    has_rate = any(p.get("engagement_rate") is not None for p in posts)
    key = "engagement_rate" if has_rate else "engagement"
    ranked = sorted((p for p in posts if p.get(key) is not None), key=lambda p: p[key], reverse=True)[:n]
    return {
        "sort_by": key,
        "items": [
            {
                "post_id": p["post_id"],
                "post_url": p["post_url"],
                "published_at": p.get("published_at"),
                "text": (p.get("text") or "")[:200],
                "likes": p.get("likes"),
                "replies": p.get("replies"),
                "reposts": p.get("reposts"),
                "quotes": p.get("quotes"),
                "engagement": p.get("engagement"),
                "engagement_rate_pct": _r(p["engagement_rate"] * 100, 3) if p.get("engagement_rate") is not None else None,
                "post_types": p.get("post_types"),
                "group": p.get("group_label"),
            }
            for p in ranked
        ],
    }


def time_distribution(posts: list[dict]) -> dict:
    """星期 × 小時（台北時間）：發文數與平均互動（AC4.3）。"""
    grid: dict[tuple[int, int], list[float]] = defaultdict(list)
    by_wd: dict[int, list[float]] = defaultdict(list)
    by_hr: dict[int, list[float]] = defaultdict(list)
    for p in posts:
        d = to_taipei(p.get("published_at"))
        if d is None:
            continue
        e = p.get("engagement")
        grid[(d.weekday(), d.hour)].append(e)
        by_wd[d.weekday()].append(e)
        by_hr[d.hour].append(e)

    def cell(vals):
        nums = [v for v in vals if v is not None]
        return {"count": len(vals), "avg_engagement": _r(mean(nums)) if nums else None}

    weekday = [{"weekday": i, "label": WEEKDAYS[i], **cell(by_wd.get(i, []))} for i in range(7)]
    hour = [{"hour": h, **cell(by_hr.get(h, []))} for h in range(24)]
    heatmap = [{"weekday": w, "hour": h, **cell(v)} for (w, h), v in sorted(grid.items())]

    def best(rows, min_count=2):
        cands = [r for r in rows if r["count"] >= min_count and r["avg_engagement"] is not None]
        return max(cands, key=lambda r: r["avg_engagement"]) if cands else None

    most_wd = max(weekday, key=lambda r: r["count"])
    most_hr = max(hour, key=lambda r: r["count"])
    return {
        "timezone": "Asia/Taipei",
        "weekday": weekday,
        "hour": hour,
        "heatmap": heatmap,
        "most_posted_weekday": most_wd if most_wd["count"] else None,
        "most_posted_hour": most_hr if most_hr["count"] else None,
        "best_weekday": best(weekday),
        "best_hour": best(hour),
    }


def length_analysis(posts: list[dict]) -> dict:
    bins = []
    for lo, hi, label in LENGTH_BINS:
        sel = [p for p in posts if (p.get("char_count") or 0) >= lo and (hi is None or (p.get("char_count") or 0) <= hi)]
        bins.append({"label": label, "min": lo, "max": hi, "count": len(sel),
                     "avg_engagement": stat(p.get("engagement") for p in sel)["mean"]})
    pairs = [(p.get("char_count") or 0, p["engagement"]) for p in posts if p.get("engagement") is not None]
    points = [{"post_id": p["post_id"], "char_count": p.get("char_count") or 0, "engagement": p.get("engagement"),
               "is_outlier": bool(p.get("is_outlier"))} for p in posts if p.get("engagement") is not None]
    return {
        "bins": bins,
        "spearman": spearman([a for a, _ in pairs], [b for _, b in pairs]),
        "points": points,
    }


def type_analysis(posts: list[dict]) -> list[dict]:
    rows = []
    for t in ("純文字", "含連結", "含 hashtag", "含 mention"):
        sel = [p for p in posts if t in (p.get("post_types") or [])]
        rows.append({"type": t, "count": len(sel), "share": _r(len(sel) / len(posts), 3) if posts else 0,
                     "avg_engagement": stat(p.get("engagement") for p in sel)["mean"]})
    return rows


def keyword_analysis(posts: list[dict], top: int = 20) -> dict:
    words: Counter[str] = Counter()
    tags: Counter[str] = Counter()
    for p in posts:
        words.update(set(keywords(p.get("text") or "")))  # 每篇只計一次（文件頻率）
        tags.update(p.get("hashtags") or [])
    return {
        "keywords": [{"term": w, "posts": c} for w, c in words.most_common(top)],
        "hashtags": [{"tag": t, "count": c} for t, c in tags.most_common(top)],
    }


def compute_summary(posts: list[dict], meta: dict) -> dict:
    return {
        "overview": overview(posts, meta),
        "time": time_distribution(posts),
        "length": length_analysis(posts),
        "types": type_analysis(posts),
        "keywords": keyword_analysis(posts),
    }
