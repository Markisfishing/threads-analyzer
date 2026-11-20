"""任務狀態機單元測試（PRD F2、§5 E3/E4/E8、F8 取消）。"""
from __future__ import annotations

import pytest

from tests.worker.fakes import MemoryStore
from worker.pipeline import JobError, ScrapeResult, run_job


def make_posts(job, n):
    return [{"job_id": job["id"], "user_id": job["user_id"], "post_id": f"P{i}",
             "post_url": f"https://www.threads.com/@x/post/P{i}"} for i in range(n)]


def scraper(n, **kw):
    def _scrape(job, ctx):
        posts = make_posts(job, n)
        ctx.store.upsert_posts(posts)
        ctx.progress(len(posts))
        return ScrapeResult(posts=posts, account_meta={"follower_count": 100}, **kw)
    return _scrape


def identity_clean(job, posts):
    return posts


def ok_analyze(job, posts, meta, ctx):
    return {"summary": {"n": len(posts)}, "top_posts": [], "groups": None, "insights": [], "generator": "test"}


@pytest.fixture()
def store():
    return MemoryStore()


def claim(store, **fields):
    job = store.add_job(**fields)
    return store.claim_job(job["id"])


def test_completed_when_enough_posts(store):
    job = claim(store)
    assert run_job(store, job, scrape=scraper(35), clean=identity_clean, analyze=ok_analyze) == "completed"
    saved = store.jobs[job["id"]]
    assert saved["status"] == "completed" and saved["scraped_count"] == 35
    assert saved["error_code"] is None and saved["finished_at"]
    assert store.results[job["id"]]["summary"] == {"n": 35}
    steps = [s for (_, _, s, _) in store.logs]
    assert {"system", "scrape", "clean", "analyze"} <= set(steps)


def test_partial_when_fewer_than_30(store):
    """E3：1–29 篇 → partial，仍產出分析結果。"""
    job = claim(store)
    assert run_job(store, job, scrape=scraper(12), clean=identity_clean, analyze=ok_analyze) == "partial"
    saved = store.jobs[job["id"]]
    assert saved["error_code"] == "INSUFFICIENT_POSTS" and "12" in saved["error_message"]
    assert job["id"] in store.results


def test_failed_when_no_posts(store):
    job = claim(store)
    assert run_job(store, job, scrape=scraper(0), clean=identity_clean, analyze=ok_analyze) == "failed"
    assert store.jobs[job["id"]]["error_code"] == "NO_POSTS"


def test_scrape_error_without_posts_fails_with_code(store):
    """E2a：帳號不存在 → failed，保留錯誤代碼與訊息。"""
    def boom(job, ctx):
        raise JobError("ACCOUNT_NOT_FOUND", "找不到帳號 @x", keep_partial=False)

    job = claim(store)
    assert run_job(store, job, scrape=boom, clean=identity_clean, analyze=ok_analyze) == "failed"
    saved = store.jobs[job["id"]]
    assert saved["error_code"] == "ACCOUNT_NOT_FOUND" and saved["error_message"] == "找不到帳號 @x"


def test_scrape_blocked_keeps_partial_posts(store):
    """E4：爬取中途受阻 → 已取得的貼文仍分析，狀態 partial。"""
    def blocked(job, ctx):
        ctx.store.upsert_posts(make_posts(job, 8))
        raise JobError("SCRAPE_BLOCKED", "Threads 暫時限制存取，請稍後重跑")

    job = claim(store)
    assert run_job(store, job, scrape=blocked, clean=identity_clean, analyze=ok_analyze) == "partial"
    saved = store.jobs[job["id"]]
    assert saved["error_code"] == "SCRAPE_BLOCKED"
    assert job["id"] in store.results


def test_unexpected_error_marks_failed(store):
    """E8：分析拋出未預期例外 → failed，ANALYSIS_ERROR，貼文保留。"""
    def crash(job, posts, meta, ctx):
        raise ValueError("bug")

    job = claim(store)
    assert run_job(store, job, scrape=scraper(30), clean=identity_clean, analyze=crash) == "failed"
    assert store.jobs[job["id"]]["error_code"] == "ANALYSIS_ERROR"
    assert len(store.list_posts(job["id"])) == 30
    assert any(level == "error" for (_, level, _, _) in store.logs)


def test_cancel_during_scrape_stops_and_keeps_cancelled(store):
    """F8/AC8.4：使用者取消後，Worker 在下一批前停止且不覆寫狀態。"""
    job = claim(store)

    def cancel_hook(j):
        j["status"] = "cancelled"

    store.on_get_job = cancel_hook
    assert run_job(store, job, scrape=scraper(30), clean=identity_clean, analyze=ok_analyze) == "cancelled"
    assert store.jobs[job["id"]]["status"] == "cancelled"
    assert job["id"] not in store.results


def test_cancel_between_stages_not_overwritten(store):
    job = claim(store)

    def scrape_then_cancel(job, ctx):
        posts = make_posts(job, 30)
        store.jobs[job["id"]]["status"] = "cancelled"  # 爬完後使用者取消
        return ScrapeResult(posts=posts)

    assert run_job(store, job, scrape=scrape_then_cancel, clean=identity_clean, analyze=ok_analyze) == "cancelled"
    assert store.jobs[job["id"]]["status"] == "cancelled"


def test_claim_is_exclusive(store):
    job = store.add_job()
    assert store.claim_job(job["id"]) is not None
    assert store.claim_job(job["id"]) is None
