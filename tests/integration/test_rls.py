"""RLS 資料隔離整合測試（PRD AC1.4、AC1.5）。

對真實 Supabase 專案執行：建立兩個測試使用者 A、B，驗證彼此無法讀取或修改對方資料。
需要 .env 的 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY 與 .env.local 的 NEXT_PUBLIC_SUPABASE_ANON_KEY；
缺少時自動略過。測試結束會刪除測試使用者（連帶刪除其資料）。

執行：python -m pytest -m integration
"""
from __future__ import annotations

import httpx
import pytest

from tests.helpers import CONFIGURED, REST, SbUser, admin_headers, create_user, delete_user, user_headers

pytestmark = pytest.mark.integration

if not CONFIGURED:
    pytest.skip("未設定 Supabase 環境變數", allow_module_level=True)

User = SbUser


@pytest.fixture(scope="module")
def client():
    with httpx.Client(timeout=30) as c:
        yield c


@pytest.fixture(scope="module")
def users(client):
    created = []
    try:
        created = [create_user(client, "rls-test"), create_user(client, "rls-test")]
        yield tuple(created)
    finally:
        for u in created:
            delete_user(client, u.id)


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
