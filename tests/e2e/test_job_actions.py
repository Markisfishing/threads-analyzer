"""任務操作 E2E 測試（PRD AC8.2 重跑、AC8.3 刪除、AC8.4 取消）。"""
from __future__ import annotations

import re

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.conftest import BASE, login_as
from tests.e2e.test_report import seed_job
from tests.helpers import REST, admin_headers

pytestmark = pytest.mark.e2e


def _rows(http, table: str, col: str, job_id: str) -> list:
    r = http.get(f"{REST}/{table}?{col}=eq.{job_id}&select={col}", headers=admin_headers())
    assert r.status_code == 200, r.text
    return r.json()


def test_rerun_creates_child_job_and_keeps_old_result(page: Page, http, user):
    """AC8.2：重跑建立新任務（parent_job_id 指向原任務），舊結果仍可檢視。"""
    old_id = seed_job(http, user, "actions.rerun", 30)
    login_as(page, user)
    page.goto(f"{BASE}/dashboard/jobs/{old_id}")
    page.get_by_test_id("job-actions").get_by_role("button", name="重跑").click()
    page.wait_for_url(re.compile(r"/dashboard/jobs/(?!" + old_id + r")[0-9a-f-]{36}$"))
    new_id = page.url.rsplit("/", 1)[-1]

    r = http.get(f"{REST}/analysis_jobs?id=eq.{new_id}&select=parent_job_id,status,max_posts",
                 headers=admin_headers())
    job = r.json()[0]
    assert job["parent_job_id"] == old_id
    assert job["status"] == "queued"
    expect(page.get_by_role("link", name="先前的分析")).to_have_attribute("href", f"/dashboard/jobs/{old_id}")

    page.goto(f"{BASE}/dashboard/jobs/{old_id}")
    expect(page.get_by_test_id("report")).to_be_visible()


def test_cancel_active_job(page: Page, http, user):
    """AC8.4：進行中任務可取消，狀態變為已取消且不再顯示取消按鈕。"""
    r = http.post(f"{REST}/analysis_jobs", headers={**user.h, "Prefer": "return=representation"},
                  json={"target_username": "actions.cancel"})
    job_id = r.json()[0]["id"]
    login_as(page, user)
    page.goto(f"{BASE}/dashboard/jobs/{job_id}")
    actions = page.get_by_test_id("job-actions")
    actions.get_by_role("button", name="取消任務").click()
    expect(page.locator("[data-status=cancelled]").first).to_be_visible()
    expect(actions.get_by_role("button", name="重跑")).to_be_visible()
    assert _rows(http, "analysis_jobs", "id", job_id)


def test_delete_requires_confirmation_and_cascades(page: Page, http, user):
    """AC8.3：取消對話框不刪除；確認後任務、貼文、結果、日誌全部刪除。"""
    job_id = seed_job(http, user, "actions.delete", 30)
    http.post(f"{REST}/job_logs", headers=admin_headers(),
              json={"job_id": job_id, "user_id": user.id, "step": "system", "level": "info", "message": "seed"})
    assert _rows(http, "posts", "job_id", job_id)
    assert _rows(http, "job_logs", "job_id", job_id)

    login_as(page, user)
    page.goto(f"{BASE}/dashboard/jobs/{job_id}")
    actions = page.get_by_test_id("job-actions")
    actions.get_by_role("button", name="更多操作").click()
    actions.get_by_role("menuitem", name="刪除分析").click()
    dialog = page.get_by_role("dialog")
    expect(dialog).to_be_visible()
    dialog.get_by_role("button", name="保留").click()
    expect(dialog).to_be_hidden()
    assert _rows(http, "analysis_jobs", "id", job_id)

    actions.get_by_role("button", name="更多操作").click()
    actions.get_by_role("menuitem", name="刪除分析").click()
    dialog.get_by_role("button", name="確定刪除").click()
    page.wait_for_url(f"{BASE}/dashboard?notice=deleted")
    expect(page.get_by_role("status")).to_contain_text("已刪除分析")

    for table, col in (("analysis_jobs", "id"), ("posts", "job_id"),
                       ("analysis_results", "job_id"), ("job_logs", "job_id")):
        assert _rows(http, table, col, job_id) == [], table
