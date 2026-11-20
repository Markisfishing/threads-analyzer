"""任務狀態機：scraping → cleaning → analyzing → completed / partial / failed（PRD F2–F6、§5）。

各階段以函式注入，方便測試與逐步實作：
  scrape(job, ctx)   -> ScrapeResult      爬取並分批寫入原始貼文
  clean(job, posts, meta) -> list[dict]   清理後的貼文列（寫回 posts）
  analyze(job, posts, meta, ctx) -> dict  analysis_results 列內容；可就地更新 posts 的 group_label（分析後寫回）
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from worker.db import JobStore, now_iso

log = logging.getLogger("worker.pipeline")

MIN_POSTS = 30  # PRD E3：少於 30 篇為 partial


class JobError(Exception):
    """可預期的任務失敗，code 對應 PRD §5 錯誤代碼，message 為使用者可讀訊息。"""

    def __init__(self, code: str, message: str, *, keep_partial: bool = True):
        super().__init__(message)
        self.code = code
        self.message = message
        self.keep_partial = keep_partial  # 已取得的貼文是否仍可用於分析


class JobCancelled(Exception):
    pass


@dataclass
class ScrapeResult:
    posts: list[dict]
    account_meta: dict = field(default_factory=dict)
    scrape_mode: str = "anonymous"
    warning: str | None = None  # 例如登入狀態失效（E12）


@dataclass
class JobContext:
    """傳給各階段的工具：寫日誌、回報進度、檢查取消。"""

    store: JobStore
    job: dict

    def log(self, level: str, step: str, message: str) -> None:
        self.store.log(self.job, level, step, message)

    def progress(self, scraped_count: int) -> None:
        self.check_cancelled()
        self.store.update_job(self.job["id"], scraped_count=scraped_count)

    def check_cancelled(self) -> None:
        current = self.store.get_job(self.job["id"])
        if current is None or current["status"] == "cancelled":
            raise JobCancelled()


Scraper = Callable[[dict, JobContext], ScrapeResult]
Cleaner = Callable[[dict, list[dict], dict], list[dict]]
Analyzer = Callable[[dict, list[dict], dict, JobContext], dict]


def run_job(store: JobStore, job: dict, *, scrape: Scraper, clean: Cleaner, analyze: Analyzer) -> str:
    """執行已領取（status=scraping）的任務，回傳最終狀態。"""
    ctx = JobContext(store, job)
    jid = job["id"]
    t0 = time.monotonic()
    ctx.log("info", "system", f"開始任務 @{job['target_username']}（目標 {job['max_posts']} 篇，第 {job['attempt']} 次）")

    raw: list[dict] = []
    meta: dict[str, Any] = {}
    failure: JobError | None = None

    try:
        # ---------------- 爬取
        try:
            result = scrape(job, ctx)
            raw, meta = result.posts, result.account_meta
            store.update_job(jid, scraped_count=len(raw), account_meta=meta or None, scrape_mode=result.scrape_mode)
            if result.warning:
                ctx.log("warn", "scrape", result.warning)
        except JobError as e:
            failure = e
            raw = store.list_posts(jid) if e.keep_partial else []
            ctx.log("error", "scrape", f"{e.code}: {e.message}")
        ctx.log("info", "scrape", f"爬取結束，共 {len(raw)} 篇")

        if not raw:
            err = failure or JobError("NO_POSTS", "找不到任何貼文")
            _finish(store, jid, "failed", err.code, err.message)
            return "failed"

        # ---------------- 清理
        _transition(store, jid, "cleaning")
        cleaned = clean(job, raw, meta)
        store.upsert_posts(cleaned)
        ctx.log("info", "clean", f"清理完成，{len(cleaned)} 篇")

        # ---------------- 分析
        _transition(store, jid, "analyzing")
        try:
            row = analyze(job, cleaned, meta, ctx)
        except JobError as e:
            ctx.log("error", "analyze", f"{e.code}: {e.message}")
            _finish(store, jid, "failed", e.code, e.message)
            return "failed"
        store.upsert_posts(cleaned)  # 寫回分析時標記的 group_label
        store.save_results({"job_id": jid, "user_id": job["user_id"], **row})
        ctx.log("info", "analyze", f"分析完成（{row.get('generator', '?')}）")

        # ---------------- 結束狀態
        if failure is not None or len(cleaned) < MIN_POSTS:
            msg = failure.message if failure else f"僅取得 {len(cleaned)} 篇（目標 {MIN_POSTS}），結果可信度較低"
            code = failure.code if failure else "INSUFFICIENT_POSTS"
            _finish(store, jid, "partial", code, msg)
            final = "partial"
        else:
            _finish(store, jid, "completed")
            final = "completed"
        ctx.log("info", "system", f"任務結束：{final}，耗時 {time.monotonic() - t0:.0f} 秒")
        return final

    except JobCancelled:
        ctx.log("info", "system", "任務已被使用者取消")
        store.update_job(jid, finished_at=now_iso())
        return "cancelled"
    except Exception as e:  # noqa: BLE001 — 未預期錯誤一律記錄並標記失敗（E8）
        log.exception("任務 %s 發生未預期錯誤", jid)
        ctx.log("error", "system", f"{type(e).__name__}: {e}")
        _finish(store, jid, "failed", "ANALYSIS_ERROR", "分析失敗，原始貼文已保存，可重跑分析")
        return "failed"


def _transition(store: JobStore, job_id: str, status: str) -> None:
    if not store.set_status(job_id, status):
        raise JobCancelled()


def _finish(store: JobStore, job_id: str, status: str, code: str | None = None, message: str | None = None) -> None:
    # 已取消的任務不覆寫狀態
    store.set_status(job_id, status, error_code=code, error_message=message, finished_at=now_iso())
