"""爬蟲 JSON 解析單元測試（不連網）。結構依 T1 spike 實際觀察到的 Threads 回應。"""
from __future__ import annotations

import base64
import json

from worker.scraper import find_posts, find_user_meta, load_storage_state, select_rows, to_row

JOB = {"id": "job-1", "user_id": "u1", "target_username": "zuck", "max_posts": 3}


def raw_post(code, taken_at, user="zuck", likes=10, replies=2, reposts=1, quotes=0, text="hi"):
    return {
        "code": code, "taken_at": taken_at, "like_count": likes, "media_type": 19,
        "user": {"username": user},
        "caption": {"text": text},
        "text_post_app_info": {"direct_reply_count": replies, "repost_count": reposts,
                               "quote_count": quotes, "reshare_count": 5},
    }


GRAPHQL = {
    "data": {"mediaData": {"edges": [
        {"node": {"thread_items": [{"post": raw_post("A", 1794000000)}]}},
        {"node": {"thread_items": [{"post": raw_post("B", 1795000000)}]}},
        {"node": {"thread_items": [{"post": raw_post("R", 1796000000, user="someone_else")}]}},
        {"node": {"thread_items": [{"post": raw_post("C", 1793000000, likes=None)}]}},
        {"node": {"thread_items": [{"post": raw_post("D", 1792000000)}]}},
    ]}},
    "user": {"username": "Zuck", "full_name": "Mark", "follower_count": 5780051, "is_verified": True},
}


def test_find_posts_collects_by_code():
    acc = {}
    find_posts(GRAPHQL, acc)
    assert set(acc) == {"A", "B", "R", "C", "D"}


def test_find_posts_dedupes_same_code():
    acc = {}
    find_posts([raw_post("A", 1), raw_post("A", 1, likes=99)], acc)
    assert len(acc) == 1 and acc["A"]["like_count"] == 99


def test_user_meta_case_insensitive():
    meta = find_user_meta(GRAPHQL, "zuck")
    assert meta == {"display_name": "Mark", "follower_count": 5780051, "is_private": False, "is_verified": True}
    assert find_user_meta(GRAPHQL, "nobody") is None


def test_select_rows_filters_sorts_truncates():
    """過濾轉發他人貼文、依時間新到舊、截斷到 max_posts。"""
    acc = {}
    find_posts(GRAPHQL, acc)
    rows = select_rows(acc, JOB)
    assert [r["post_id"] for r in rows] == ["B", "A", "C"]


def test_to_row_maps_fields():
    row = to_row(raw_post("A", 1794267070, likes=1482, replies=264, reposts=49, quotes=9, text="Pavlova"), JOB)
    assert row["post_url"] == "https://www.threads.com/@zuck/post/A"
    assert row["published_at"].startswith("2026-11-")
    assert (row["likes"], row["replies"], row["reposts"], row["quotes"]) == (1482, 264, 49, 9)
    assert row["views"] is None and row["text"] == "Pavlova" and row["missing_fields"] == []


def test_to_row_records_missing_fields():
    row = to_row(raw_post("C", 1, likes=None), JOB)
    assert row["likes"] is None and "likes" in row["missing_fields"]


def test_to_row_empty_caption():
    raw = raw_post("E", 1)
    raw["caption"] = None
    assert to_row(raw, JOB)["text"] == ""


def test_load_storage_state_formats(tmp_path):
    state = {"cookies": [{"name": "sessionid"}], "origins": []}
    raw = json.dumps(state)
    p = tmp_path / "s.json"
    p.write_text(raw, encoding="utf-8")
    assert load_storage_state(raw) == state
    assert load_storage_state(str(p)) == state
    assert load_storage_state(base64.b64encode(raw.encode()).decode()) == state
    assert load_storage_state("") is None
