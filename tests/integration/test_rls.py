"""RLS 資料隔離整合測試（PRD AC1.4、AC1.5）。

對真實 Supabase 專案執行：建立兩個測試使用者 A、B，驗證彼此無法讀取或修改對方資料。
需要 .env 的 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY 與 .env.local 的 NEXT_PUBLIC_SUPABASE_ANON_KEY；
缺少時自動略過。測試結束會刪除測試使用者（連帶刪除其資料）。

執行：python -m pytest -m integration
"""
from __future__ import annotations

import os
import secrets
import uuid
from pathlib import Path

import httpx
import pytest

pytestmark = pytest.mark.integration

ROOT = Path(__file__).resolve().parents[2]


def _read_env(path: Path) -> dict[str, str]:
    """讀單一 .env 檔（不寫入 os.environ，避免 .env 與 .env.local 的佔位值互相覆蓋）。"""
    out: dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out


_worker_env = _read_env(ROOT / ".env")
_web_env = _read_env(ROOT / ".env.local")

URL = (os.environ.get("SUPABASE_URL") or _worker_env.get("SUPABASE_URL", "")).rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or _worker_env.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANON_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or _web_env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

if not (URL and SERVICE_KEY and ANON_KEY) or "your-" in ANON_KEY:
    pytest.skip("未設定 Supabase 環境變數", allow_module_level=True)

REST = f"{URL}/rest/v1"


def admin_headers() -> dict:
    return {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"} \
        if SERVICE_KEY.startswith("eyJ") else {"apikey": SERVICE_KEY}


def user_headers(token: str | None) -> dict:
    h = {"apikey": ANON_KEY}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


class User:
    def __init__(self, client: httpx.Client):
        self.email = f"rls-test-{uuid.uuid4().hex[:10]}@example.com"
        password = secrets.token_urlsafe(24)
        r = client.post(f"{URL}/auth/v1/admin/users", headers=admin_headers(),
                        json={"email": self.email, "password": password, "email_confirm": True})
        r.raise_for_status()
        self.id = r.json()["id"]
        r = client.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": ANON_KEY},
                        json={"email": self.email, "password": password})
        r.raise_for_status()
        self.token = r.json()["access_token"]
        self.h = user_headers(self.token)


@pytest.fixture(scope="module")
def client():
    with httpx.Client(timeout=30) as c:
        yield c


@pytest.fixture(scope="module")
def users(client):
    created: list[User] = []
    try:
        a, b = User(client), User(client)
        created = [a, b]
        yield a, b
    finally:
        for u in created:
            client.delete(f"{URL}/auth/v1/admin/users/{u.id}", headers=admin_headers())


def rows(client, path, headers):
    r = client.get(f"{REST}/{path}", headers=headers)
    return r.status_code, (r.json() if r.status_code == 200 else r.text)


def create_job(client, user: User, target: str) -> dict:
    r = client.post(f"{REST}/analysis_jobs", headers={**user.h, "Prefer": "return=representation"},
                    json={"target_username": target})
    assert r.status_code == 201, r.text
    return r.json()[0]


# ---------------------------------------------------------------- tests

def test_profile_created_by_trigger(client, users):
    a, _ = users
    code, data = rows(client, "profiles?select=id,email", a.h)
    assert code == 200
    assert data == [{"id": a.id, "email": a.email}]


def test_user_cannot_read_other_users_job(client, users):
    a, b = users
    job = create_job(client, a, "zuck")
    assert job["status"] == "queued" and job["user_id"] == a.id

    _, data = rows(client, f"analysis_jobs?id=eq.{job['id']}", b.h)
    assert data == []
    _, data = rows(client, f"analysis_jobs?id=eq.{job['id']}", a.h)
    assert len(data) == 1


def test_user_cannot_read_other_users_posts_results_logs(client, users):
    a, b = users
    job = create_job(client, a, "mosseri")
    # 以 Worker（service role）身分寫入 A 的資料
    ah = {**admin_headers(), "Prefer": "return=minimal"}
    for table, body in [
        ("posts", {"job_id": job["id"], "user_id": a.id, "post_id": "X1",
                   "post_url": "https://www.threads.com/@mosseri/post/X1", "likes": 1}),
        ("analysis_results", {"job_id": job["id"], "user_id": a.id, "summary": {},
                              "top_posts": [], "insights": [], "generator": "test"}),
        ("job_logs", {"job_id": job["id"], "user_id": a.id, "level": "info",
                      "step": "system", "message": "test"}),
    ]:
        r = client.post(f"{REST}/{table}", headers=ah, json=body)
        assert r.status_code == 201, r.text

    for table in ("posts", "analysis_results", "job_logs"):
        _, data = rows(client, f"{table}?job_id=eq.{job['id']}", b.h)
        assert data == [], table
        _, data = rows(client, f"{table}?job_id=eq.{job['id']}", a.h)
        assert len(data) == 1, table


def test_anon_cannot_read_anything(client, users):
    for table in ("profiles", "analysis_jobs", "posts", "analysis_results", "job_logs"):
        code, data = rows(client, f"{table}?select=*", user_headers(None))
        assert code != 200 or data == [], table


def test_user_cannot_create_job_for_other_user(client, users):
    a, b = users
    r = client.post(f"{REST}/analysis_jobs", headers=a.h,
                    json={"target_username": "threads", "user_id": b.id})
    assert r.status_code in (401, 403), r.text


def test_user_cannot_set_status_on_insert(client, users):
    a, _ = users
    r = client.post(f"{REST}/analysis_jobs", headers=a.h,
                    json={"target_username": "someone", "status": "completed"})
    assert r.status_code in (401, 403), r.text


def test_duplicate_active_job_rejected(client, users):
    a, _ = users
    create_job(client, a, "dup.test")
    r = client.post(f"{REST}/analysis_jobs", headers=a.h, json={"target_username": "dup.test"})
    assert r.status_code == 409, r.text


def test_status_update_only_to_cancelled(client, users):
    a, b = users
    job = create_job(client, a, "cancel.test")
    rep = {**a.h, "Prefer": "return=representation"}

    # 不能自行標記完成
    r = client.patch(f"{REST}/analysis_jobs?id=eq.{job['id']}", headers=rep, json={"status": "completed"})
    assert r.status_code in (401, 403), r.text
    # B 不能取消 A 的任務（RLS 過濾後影響 0 列）
    r = client.patch(f"{REST}/analysis_jobs?id=eq.{job['id']}", headers={**b.h, "Prefer": "return=representation"},
                     json={"status": "cancelled"})
    assert r.status_code == 200 and r.json() == []
    # 不能改其他欄位
    r = client.patch(f"{REST}/analysis_jobs?id=eq.{job['id']}", headers=rep, json={"scraped_count": 99})
    assert r.status_code in (401, 403), r.text
    # 可以取消自己的
    r = client.patch(f"{REST}/analysis_jobs?id=eq.{job['id']}", headers=rep, json={"status": "cancelled"})
    assert r.status_code == 200 and r.json()[0]["status"] == "cancelled"


def test_delete_rules(client, users):
    a, b = users
    job = create_job(client, a, "delete.test")
    rep = {**a.h, "Prefer": "return=representation"}

    # 進行中不能刪
    r = client.delete(f"{REST}/analysis_jobs?id=eq.{job['id']}", headers=rep)
    assert r.status_code == 200 and r.json() == []
    client.patch(f"{REST}/analysis_jobs?id=eq.{job['id']}", headers=rep, json={"status": "cancelled"})
    # B 不能刪 A 的
    r = client.delete(f"{REST}/analysis_jobs?id=eq.{job['id']}", headers={**b.h, "Prefer": "return=representation"})
    assert r.status_code == 200 and r.json() == []
    # A 刪除已取消的任務
    r = client.delete(f"{REST}/analysis_jobs?id=eq.{job['id']}", headers=rep)
    assert r.status_code == 200 and len(r.json()) == 1


def test_rerun_parent_must_be_own_job(client, users):
    a, b = users
    a_job = create_job(client, a, "parent.test")
    # B 不能以 A 的任務作為重跑來源
    r = client.post(f"{REST}/analysis_jobs", headers=b.h,
                    json={"target_username": "parent.test", "parent_job_id": a_job["id"]})
    assert r.status_code in (401, 403), r.text
    # A 可以重跑自己的任務（先取消原任務以免觸發重複任務限制）
    client.patch(f"{REST}/analysis_jobs?id=eq.{a_job['id']}", headers=a.h, json={"status": "cancelled"})
    r = client.post(f"{REST}/analysis_jobs", headers={**a.h, "Prefer": "return=representation"},
                    json={"target_username": "parent.test", "parent_job_id": a_job["id"]})
    assert r.status_code == 201, r.text
    assert r.json()[0]["parent_job_id"] == a_job["id"]


def test_invalid_username_rejected(client, users):
    a, _ = users
    r = client.post(f"{REST}/analysis_jobs", headers=a.h, json={"target_username": "Bad Name!"})
    assert r.status_code == 400, r.text
