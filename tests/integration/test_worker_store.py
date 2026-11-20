"""Worker 與真實 Supabase 的整合測試：搶鎖、狀態機、日誌、殭屍任務、取消不被覆寫。"""
from __future__ import annotations

import time
from datetime import timedelta

import httpx
import pytest

from tests.helpers import CONFIGURED, REST, SERVICE_KEY, URL, create_user, delete_user
from worker.db import SupabaseStore
from worker.pipeline import ScrapeResult, run_job

pytestmark = pytest.mark.integration

if not CONFIGURED:
    pytest.skip("未設定 Supabase 環境變數", allow_module_level=True)


@pytest.fixture(scope="module")
def http():
    with httpx.Client(timeout=30) as c:
        yield c


@pytest.fixture(scope="module")
def user(http):
    u = create_user(http, "worker-test")
    yield u
    delete_user(http, u.id)


@pytest.fixture(scope="module")
def store():
    return SupabaseStore(URL, SERVICE_KEY)


def new_job(http, user, target) -> dict:
    r = http.post(f"{REST}/analysis_jobs", headers={**user.h, "Prefer": "return=representation"},
                  json={"target_username": target})
    assert r.status_code == 201, r.text
    return r.json()[0]


def fake_scrape(n):
    def _scrape(job, ctx):
        posts = [{"job_id": job["id"], "user_id": job["user_id"], "post_id": f"P{i}",
                  "post_url": f"https://www.threads.com/@{job['target_username']}/post/P{i}", "likes": i}
                 for i in range(n)]
        ctx.store.upsert_posts(posts)
        ctx.progress(n)
        return ScrapeResult(posts=posts, account_meta={"follower_count": 1000})
    return _scrape


def analyze(job, posts, meta, ctx):
    return {"summary": {"n": len(posts)}, "top_posts": [], "groups": None, "insights": [], "generator": "test"}


def test_claim_run_complete_and_user_can_read(http, user, store):
    job = new_job(http, user, "worker.ok")
    claimed = store.claim_job(job["id"])
    assert claimed and claimed["status"] == "scraping" and claimed["attempt"] == 1
    assert store.claim_job(job["id"]) is None  # 不可重複領取

    final = run_job(store, claimed, scrape=fake_scrape(31), clean=lambda j, p, m: p, analyze=analyze)
    assert final == "completed"

    # 使用者（RLS）可讀到結果與日誌
    j = http.get(f"{REST}/analysis_jobs?id=eq.{job['id']}", headers=user.h).json()[0]
    assert j["status"] == "completed" and j["scraped_count"] == 31 and j["finished_at"]
    posts = http.get(f"{REST}/posts?job_id=eq.{job['id']}&select=post_id", headers=user.h).json()
    assert len(posts) == 31
    logs = http.get(f"{REST}/job_logs?job_id=eq.{job['id']}&select=step", headers=user.h).json()
    assert {"system", "scrape", "clean", "analyze"} <= {r["step"] for r in logs}


def test_upsert_is_idempotent(http, user, store):
    """AC3.2：重複寫入同一貼文不會產生重複列。"""
    job = new_job(http, user, "worker.dup")
    row = {"job_id": job["id"], "user_id": user.id, "post_id": "SAME", "post_url": "u", "likes": 1}
    store.upsert_posts([row])
    store.upsert_posts([{**row, "likes": 5}])
    posts = http.get(f"{REST}/posts?job_id=eq.{job['id']}&select=likes", headers=user.h).json()
    assert posts == [{"likes": 5}]


def test_cancel_not_overwritten(http, user, store):
    job = new_job(http, user, "worker.cancel")
    claimed = store.claim_job(job["id"])

    def scrape_then_user_cancels(job, ctx):
        r = http.patch(f"{REST}/analysis_jobs?id=eq.{job['id']}", headers=user.h, json={"status": "cancelled"})
        assert r.status_code == 204, r.text
        return ScrapeResult(posts=[{"job_id": job["id"], "user_id": job["user_id"], "post_id": "A", "post_url": "u"}])

    assert run_job(store, claimed, scrape=scrape_then_user_cancels, clean=lambda j, p, m: p, analyze=analyze) == "cancelled"
    j = http.get(f"{REST}/analysis_jobs?id=eq.{job['id']}", headers=user.h).json()[0]
    assert j["status"] == "cancelled"


def test_reset_zombies(http, user, store):
    """E10：執行中且心跳過期 → 重新排隊（以 job_ids 限定範圍，避免影響其他任務）。"""
    job = new_job(http, user, "worker.zombie")
    store.claim_job(job["id"])
    time.sleep(1.5)
    assert store.reset_zombies(stale_after=timedelta(seconds=1), job_ids=[job["id"]]) == 1
    assert store.get_job(job["id"])["status"] == "queued"
    # 心跳仍新的任務不會被重設
    store.claim_job(job["id"])
    assert store.reset_zombies(stale_after=timedelta(minutes=15), job_ids=[job["id"]]) == 0


def test_mark_crashed_only_touches_unfinished_jobs(http, user, store):
    """E14：workflow 失敗 → 未結束任務標為 WORKER_CRASHED；已結束或已取消的不變。"""
    queued = new_job(http, user, "crash.queued")
    assert store.mark_crashed(queued["id"], "https://github.com/x/y/actions/runs/1") is True
    job = store.get_job(queued["id"])
    assert job["status"] == "failed"
    assert job["error_code"] == "WORKER_CRASHED"
    assert job["run_url"].endswith("/runs/1")
    assert job["finished_at"]

    done = new_job(http, user, "crash.done")
    store.update_job(done["id"], status="completed")
    assert store.mark_crashed(done["id"]) is False
    assert store.get_job(done["id"])["status"] == "completed"

    cancelled = new_job(http, user, "crash.cancelled")
    store.update_job(cancelled["id"], status="cancelled")
    assert store.mark_crashed(cancelled["id"]) is False
    assert store.get_job(cancelled["id"])["status"] == "cancelled"
