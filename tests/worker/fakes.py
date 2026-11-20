"""記憶體版 JobStore，供 pipeline 單元測試使用。"""
from __future__ import annotations

import copy
import uuid
from typing import Any


class MemoryStore:
    def __init__(self):
        self.jobs: dict[str, dict] = {}
        self.posts: dict[tuple[str, str], dict] = {}
        self.results: dict[str, dict] = {}
        self.logs: list[tuple[str, str, str, str]] = []
        self.on_get_job = None  # 測試鉤子：模擬使用者在中途取消

    def add_job(self, **fields: Any) -> dict:
        job = {"id": str(uuid.uuid4()), "user_id": "u1", "target_username": "tester", "max_posts": 30,
               "status": "queued", "attempt": 0, "scraped_count": 0, **fields}
        self.jobs[job["id"]] = job
        return copy.deepcopy(job)

    def get_job(self, job_id):
        if self.on_get_job:
            self.on_get_job(self.jobs[job_id])
        return copy.deepcopy(self.jobs.get(job_id))

    def claim_job(self, job_id):
        job = self.jobs.get(job_id)
        if not job or job["status"] != "queued":
            return None
        job.update(status="scraping", attempt=job["attempt"] + 1)
        return copy.deepcopy(job)

    def claim_next(self):
        for jid, job in self.jobs.items():
            if job["status"] == "queued":
                return self.claim_job(jid)
        return None

    def update_job(self, job_id, **fields):
        self.jobs[job_id].update(fields)

    def set_status(self, job_id, status, **fields):
        if self.jobs[job_id]["status"] == "cancelled":
            return False
        self.jobs[job_id].update(status=status, **fields)
        return True

    def log(self, job, level, step, message):
        self.logs.append((job["id"], level, step, message))

    def upsert_posts(self, rows):
        for r in rows:
            self.posts[(r["job_id"], r["post_id"])] = r

    def list_posts(self, job_id):
        return [p for (j, _), p in self.posts.items() if j == job_id]

    def save_results(self, row):
        self.results[row["job_id"]] = row

    def reset_zombies(self):
        return 0
