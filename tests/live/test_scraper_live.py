"""實際連線 Threads 的爬蟲測試（AC3.1、AC3.3、AC3.6、AC3.7）。

預設不執行（pytest.ini 排除 live）；手動執行：python -m pytest -m live -v
登入模式需要 spike/storage_state.json 或 THREADS_STORAGE_STATE。
"""
from __future__ import annotations

import dataclasses
import os
from pathlib import Path

import pytest

from tests.worker.fakes import MemoryStore
from worker.config import load_settings
from worker.pipeline import JobContext, JobError
from worker.scraper import ThreadsScraper

pytestmark = pytest.mark.live

ROOT = Path(__file__).resolve().parents[2]
STATE_FILE = ROOT / "spike" / "storage_state.json"
STATE = os.environ.get("THREADS_STORAGE_STATE") or (str(STATE_FILE) if STATE_FILE.exists() else "")


def run(username: str, max_posts: int = 30, state: str = ""):
    settings = dataclasses.replace(load_settings(env_file=None), threads_storage_state=state,
                                   scrape_delay_ms_min=1200, scrape_delay_ms_max=2000)
    store = MemoryStore()
    job = store.claim_job(store.add_job(target_username=username, max_posts=max_posts)["id"])
    result = ThreadsScraper(settings)(job, JobContext(store, job))
    return result, store, job


def test_anonymous_only_gets_partial_set():
    """AC3.7：未設定登入狀態 → 只用未登入模式，取得 < 30 篇但 > 0。"""
    result, store, job = run("zuck", state="")
    assert result.scrape_mode == "anonymous"
    assert 0 < len(result.posts) <= 30
    assert result.account_meta["follower_count"] > 1_000_000
    assert any("略過登入模式" in m for (_, _, _, m) in store.logs)
    assert all(r["post_url"].startswith("https://www.threads.com/@zuck/post/") for r in result.posts)


@pytest.mark.skipif(not STATE, reason="沒有登入狀態")
def test_authenticated_fallback_reaches_target():
    """AC3.1 + AC3.6：登入 fallback 後 ≥ 30 篇，無重複，必要欄位齊全。"""
    result, store, job = run("zuck", max_posts=30, state=STATE)
    assert result.scrape_mode == "authenticated"
    assert len(result.posts) == 30
    ids = [r["post_id"] for r in result.posts]
    assert len(set(ids)) == len(ids)
    assert all(r["published_at"] and r["post_url"] for r in result.posts)
    dates = [r["published_at"] for r in result.posts]
    assert dates == sorted(dates, reverse=True)
    assert len(store.list_posts(job["id"])) == 30


@pytest.mark.parametrize("state", ["", pytest.param(STATE, id="auth")])
def test_nonexistent_account(state):
    """AC3.3：不存在的帳號 → ACCOUNT_NOT_FOUND。"""
    if state is None:
        pytest.skip()
    with pytest.raises(JobError) as e:
        run("thisuserdoesnotexist_zz9q", state=state)
    assert e.value.code == "ACCOUNT_NOT_FOUND"
    assert e.value.keep_partial is False
