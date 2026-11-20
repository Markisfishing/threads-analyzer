"""資料清理單元測試（PRD AC4.1–AC4.5）。"""
from __future__ import annotations

import pytest

from worker.cleaning import clean_posts, dedupe, mark_outliers, parse_count, text_features

JOB = {"id": "j", "user_id": "u", "target_username": "x", "max_posts": 30}


def post(pid, **kw):
    base = {"job_id": "j", "user_id": "u", "post_id": pid, "post_url": f"u/{pid}",
            "published_at": "2026-11-20T01:30:00+00:00", "text": "hello",
            "likes": 10, "replies": 2, "reposts": 1, "quotes": 0, "missing_fields": []}
    return {**base, **kw}


@pytest.mark.parametrize("raw,expected", [
    ("1.2萬", 12000), ("3,456", 3456), ("987", 987), ("1.2K", 1200), ("2M", 2_000_000),
    (5, 5), ("", None), (None, None), ("abc", None), (True, None),
])
def test_parse_count(raw, expected):
    """AC4.1"""
    assert parse_count(raw) == expected


def test_dedupe_by_post_id():
    """AC4.2：相同 post_id 只留一筆（保留後出現者）。"""
    rows = dedupe([post("A", likes=1), post("A", likes=9), post("B")])
    assert len(rows) == 2 and {r["post_id"]: r["likes"] for r in rows}["A"] == 9


def test_text_features_counts_and_types():
    """AC4.4"""
    f = text_features("看這裡 https://a.com #AI #行銷 @bob 🎉")
    assert (f["url_count"], f["hashtag_count"], f["mention_count"], f["emoji_count"]) == (1, 2, 1, 1)
    assert f["post_types"] == ["含連結", "含 hashtag", "含 mention"]
    assert f["hashtags"] == ["ai", "行銷"] and f["mentions"] == ["bob"]


def test_text_features_plain_and_char_count_excludes_urls():
    f = text_features("你好 世界 https://example.com/very/long")
    assert f["char_count"] == 4
    assert text_features("只是文字")["post_types"] == ["純文字"]
    assert text_features(None)["char_count"] == 0


def test_url_fragment_not_counted_as_hashtag():
    assert text_features("https://a.com/page#section")["hashtag_count"] == 0


def test_email_not_counted_as_mention():
    assert text_features("寄信到 a@b.com")["mention_count"] == 0


def test_missing_like_stays_null_and_recorded():
    """AC4.5：無法解析 → NULL 並記錄 missing_fields，不當 0。"""
    rows = clean_posts(JOB, [post("A", likes="??")], {"follower_count": 100})
    r = rows[0]
    assert r["likes"] is None and "likes" in r["missing_fields"]
    assert r["score"] is None
    assert r["engagement"] == 3  # 其餘欄位仍計入總互動


def test_engagement_rate_and_score():
    r = clean_posts(JOB, [post("A", likes=10, replies=2, reposts=1, quotes=1)], {"follower_count": 1000})[0]
    assert r["engagement"] == 14 and r["score"] == 14 and r["engagement_rate"] == pytest.approx(0.014)


def test_engagement_rate_none_without_followers():
    """E11：粉絲數取不到 → engagement_rate 為 None。"""
    assert clean_posts(JOB, [post("A")], {})[0]["engagement_rate"] is None


def test_outlier_detection():
    rows = [{"engagement": v} for v in [10, 12, 11, 13, 9, 10, 500]]
    mark_outliers(rows)
    assert [r["is_outlier"] for r in rows] == [False] * 6 + [True]


def test_outlier_skipped_for_small_samples():
    rows = [{"engagement": 1}, {"engagement": 1000}]
    mark_outliers(rows)
    assert not any(r["is_outlier"] for r in rows)
