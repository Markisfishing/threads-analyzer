"""Supabase 資料存取（service role，經 PostgREST）。Worker 只透過這個模組讀寫資料庫。"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol

import httpx

log = logging.getLogger("worker.db")

ACTIVE = ("queued", "scraping", "cleaning", "analyzing")
RUNNING = ("scraping", "cleaning", "analyzing")
ZOMBIE_AFTER = timedelta(minutes=15)
MAX_ATTEMPTS = 3


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobStore(Protocol):
    """Pipeline 依賴的介面；測試可用記憶體實作替換。"""

    def get_job(self, job_id: str) -> dict | None: ...
    def claim_job(self, job_id: str) -> dict | None: ...
    def claim_next(self) -> dict | None: ...
    def update_job(self, job_id: str, **fields: Any) -> None: ...
    def set_status(self, job_id: str, status: str, **fields: Any) -> bool: ...
    def log(self, job: dict, level: str, step: str, message: str) -> None: ...
    def upsert_posts(self, rows: list[dict]) -> None: ...
    def list_posts(self, job_id: str) -> list[dict]: ...
    def save_results(self, row: dict) -> None: ...
    def reset_zombies(self) -> int: ...
    def mark_crashed(self, job_id: str, run_url: str = "") -> bool: ...


class SupabaseStore:
    def __init__(self, url: str, key: str, client: httpx.Client | None = None):
        self.rest = f"{url.rstrip('/')}/rest/v1"
        headers = {"apikey": key, "Content-Type": "application/json"}
        if key.startswith("eyJ"):  # 舊版 JWT key 需同時放 Authorization
            headers["Authorization"] = f"Bearer {key}"
        self.http = client or httpx.Client(timeout=30, headers=headers)
        if client is not None:
            self.http.headers.update(headers)

    # ------------------------------------------------------------ helpers
    def _req(self, method: str, path: str, *, params=None, json=None, prefer: str | None = None):
        headers = {"Prefer": prefer} if prefer else {}
        r = self.http.request(method, f"{self.rest}/{path}", params=params, json=json, headers=headers)
        if r.status_code >= 400:
            raise RuntimeError(f"Supabase {method} {path} {r.status_code}: {r.text[:300]}")
        return r.json() if r.content else None

    # ------------------------------------------------------------ jobs
    def get_job(self, job_id: str) -> dict | None:
        rows = self._req("GET", "analysis_jobs", params={"id": f"eq.{job_id}", "select": "*"})
        return rows[0] if rows else None

    def claim_job(self, job_id: str) -> dict | None:
        """queued → scraping 的原子性搶鎖；已被其他 Worker 領走則回傳 None。"""
        current = self.get_job(job_id)
        if not current or current["status"] != "queued":
            return None
        rows = self._req(
            "PATCH", "analysis_jobs",
            params={"id": f"eq.{job_id}", "status": "eq.queued"},
            json={"status": "scraping", "started_at": now_iso(), "attempt": current["attempt"] + 1,
                  "error_code": None, "error_message": None},
            prefer="return=representation",
        )
        return rows[0] if rows else None

    def claim_next(self) -> dict | None:
        rows = self._req("GET", "analysis_jobs", params={
            "status": "eq.queued", "select": "id", "order": "created_at.asc", "limit": "5"})
        for row in rows or []:
            job = self.claim_job(row["id"])
            if job:
                return job
        return None

    def update_job(self, job_id: str, **fields: Any) -> None:
        self._req("PATCH", "analysis_jobs", params={"id": f"eq.{job_id}"}, json=fields, prefer="return=minimal")

    def set_status(self, job_id: str, status: str, **fields: Any) -> bool:
        """狀態轉換；若任務已被使用者取消則不覆寫並回傳 False。"""
        rows = self._req("PATCH", "analysis_jobs",
                         params={"id": f"eq.{job_id}", "status": "neq.cancelled", "select": "id"},
                         json={"status": status, **fields}, prefer="return=representation")
        return bool(rows)

    def mark_crashed(self, job_id: str, run_url: str = "") -> bool:
        """E14：GitHub Actions 執行失敗時，若任務仍未到終態 → failed / WORKER_CRASHED。"""
        fields: dict[str, Any] = {"status": "failed", "error_code": "WORKER_CRASHED",
                                  "error_message": "分析服務執行失敗，可重跑", "finished_at": now_iso()}
        if run_url:
            fields["run_url"] = run_url
        rows = self._req("PATCH", "analysis_jobs",
                         params={"id": f"eq.{job_id}", "status": f"in.({','.join(ACTIVE)})", "select": "id,user_id"},
                         json=fields, prefer="return=representation")
        for row in rows or []:
            self.log(row, "error", "system", "Worker 執行失敗（GitHub Actions），任務標記為失敗")
        return bool(rows)

    def reset_zombies(self, stale_after: timedelta = ZOMBIE_AFTER, job_ids: list[str] | None = None) -> int:
        """E10：執行中但超過 15 分鐘沒有心跳的任務 → 重新排隊（上限 3 次）或標記失敗。"""
        cutoff = (datetime.now(timezone.utc) - stale_after).isoformat()
        params = {"status": f"in.({','.join(RUNNING)})", "updated_at": f"lt.{cutoff}", "select": "id,attempt,user_id"}
        if job_ids:
            params["id"] = f"in.({','.join(job_ids)})"
        rows = self._req("GET", "analysis_jobs", params=params)
        for row in rows or []:
            if row["attempt"] >= MAX_ATTEMPTS:
                self.update_job(row["id"], status="failed", error_code="WORKER_CRASHED",
                                error_message="分析服務多次中斷，請稍後重跑", finished_at=now_iso())
            else:
                self.update_job(row["id"], status="queued")
            self.log(row, "warn", "system", "偵測到中斷的任務，已重設狀態")
        return len(rows or [])

    # ------------------------------------------------------------ logs / data
    def log(self, job: dict, level: str, step: str, message: str) -> None:
        getattr(log, "warning" if level == "warn" else level)("[%s] %s: %s", job["id"][:8], step, message)
        try:
            self._req("POST", "job_logs", json={"job_id": job["id"], "user_id": job["user_id"],
                                                "level": level, "step": step, "message": message[:2000]},
                      prefer="return=minimal")
        except RuntimeError:
            log.exception("寫入 job_logs 失敗")

    def upsert_posts(self, rows: list[dict]) -> None:
        if not rows:
            return
        self._req("POST", "posts", params={"on_conflict": "job_id,post_id"}, json=rows,
                  prefer="resolution=merge-duplicates,return=minimal")

    def list_posts(self, job_id: str) -> list[dict]:
        return self._req("GET", "posts", params={"job_id": f"eq.{job_id}", "select": "*",
                                                 "order": "published_at.desc"}) or []

    def save_results(self, row: dict) -> None:
        self._req("POST", "analysis_results", params={"on_conflict": "job_id"}, json=row,
                  prefer="resolution=merge-duplicates,return=minimal")
