"""帳號相關資料庫函式整合測試（PRD F1：第三方登入名稱、帳號刪除）。

需先推送 migration 20261121000000_oauth_profile_and_account_deletion.sql。
"""
from __future__ import annotations

import httpx
import pytest

from tests.helpers import ANON_KEY, CONFIGURED, REST, URL, admin_headers, create_user, delete_user

pytestmark = pytest.mark.integration

if not CONFIGURED:
    pytest.skip("未設定 Supabase 環境變數", allow_module_level=True)


@pytest.fixture(scope="module")
def http():
    with httpx.Client(timeout=30) as c:
        yield c


def _profile(http, uid):
    r = http.get(f"{REST}/profiles?id=eq.{uid}&select=display_name", headers=admin_headers())
    return r.json()


def test_new_user_gets_display_name_from_oauth_metadata(http):
    u = create_user(http, "oauth-name", metadata={"full_name": "王小明", "avatar_url": "https://x"})
    try:
        assert _profile(http, u.id) == [{"display_name": "王小明"}]
    finally:
        delete_user(http, u.id)


def test_email_signup_has_empty_display_name(http):
    u = create_user(http, "plain")
    try:
        assert _profile(http, u.id) == [{"display_name": None}]
    finally:
        delete_user(http, u.id)


def test_delete_my_account_removes_user_and_all_data(http):
    u = create_user(http, "delete-me")
    other = create_user(http, "keep-me")
    try:
        job = http.post(f"{REST}/analysis_jobs", headers={**u.h, "Prefer": "return=representation"},
                        json={"target_username": "someone"}).json()[0]
        keep = http.post(f"{REST}/analysis_jobs", headers={**other.h, "Prefer": "return=representation"},
                         json={"target_username": "someone"}).json()[0]
        http.post(f"{REST}/job_logs", headers=admin_headers(),
                  json={"job_id": job["id"], "user_id": u.id, "level": "info", "step": "system", "message": "x"})

        r = http.post(f"{REST}/rpc/delete_my_account", headers=u.h, json={})
        assert r.status_code in (200, 204), r.text

        assert http.get(f"{URL}/auth/v1/admin/users/{u.id}", headers=admin_headers()).status_code == 404
        assert _profile(http, u.id) == []
        for table, col in (("analysis_jobs", "id"), ("job_logs", "job_id")):
            rows = http.get(f"{REST}/{table}?{col}=eq.{job['id']}&select={col}", headers=admin_headers()).json()
            assert rows == [], table
        # 其他使用者不受影響
        rows = http.get(f"{REST}/analysis_jobs?id=eq.{keep['id']}&select=id", headers=admin_headers()).json()
        assert rows == [{"id": keep["id"]}]
    finally:
        delete_user(http, u.id)
        delete_user(http, other.id)


def test_anon_cannot_call_delete_my_account(http):
    r = http.post(f"{REST}/rpc/delete_my_account", headers={"apikey": ANON_KEY}, json={})
    assert r.status_code in (401, 403, 404), r.text
