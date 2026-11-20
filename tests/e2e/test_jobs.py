"""建立任務與任務列表 E2E 測試（PRD AC2.1–2.3、AC8.1、AC1.4 UI）。

未啟動 Worker 時任務會停在「排隊中」，正好用來驗證建立與重複任務流程。
"""
from __future__ import annotations

import re

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.conftest import BASE, login_as

pytestmark = pytest.mark.e2e

JOB_URL = re.compile(rf"{re.escape(BASE)}/dashboard/jobs/[0-9a-f-]{{36}}")


def create(page: Page, target: str):
    page.goto(f"{BASE}/dashboard")
    page.get_by_label("Threads 帳號或網址").fill(target)
    page.get_by_role("button", name="新增分析").click()


def test_create_job_normalizes_url_and_shows_progress(page: Page, user):
    """AC2.1：網址輸入正規化為 username，建立 queued 任務並導向任務頁。"""
    login_as(page, user)
    create(page, "https://www.threads.com/@E2E.Target_1")
    page.wait_for_url(JOB_URL)
    expect(page.get_by_role("heading", level=1)).to_have_text("@e2e.target_1")
    expect(page.locator("header [data-status]")).to_have_text("排隊中")
    expect(page.get_by_test_id("job-progress")).to_be_visible()


def test_invalid_input_shows_error(page: Page, user):
    """AC2.2：格式錯誤不建立任務。"""
    login_as(page, user)
    create(page, "zu ck!")
    expect(page.locator("form [role=alert]")).to_have_text("請輸入有效的 username 或 Threads 網址")
    assert page.url == f"{BASE}/dashboard"


def test_duplicate_active_job_redirects(page: Page, user):
    """AC2.3：同帳號進行中 → 不新增，導向既有任務。"""
    login_as(page, user)
    create(page, "@dup_target")
    page.wait_for_url(JOB_URL)
    first = page.url
    create(page, "dup_target")
    page.wait_for_url(re.compile(re.escape(first) + r"\?notice=duplicate"))
    expect(page.get_by_role("status")).to_contain_text("已在分析中")
    page.goto(f"{BASE}/dashboard")
    expect(page.get_by_test_id("job-list").get_by_text("@dup_target")).to_have_count(1)


def test_list_shows_only_own_jobs_and_other_job_is_404(page: Page, user, other_user):
    """AC8.1 只顯示自己的任務；AC1.4 開別人的任務頁 → 404。"""
    login_as(page, other_user)
    create(page, "@other_secret")
    page.wait_for_url(JOB_URL)
    other_job_url = page.url

    page.context.clear_cookies()
    login_as(page, user)
    expect(page.get_by_test_id("job-list").get_by_text("@other_secret")).to_have_count(0)
    resp = page.goto(other_job_url)
    assert resp is not None and resp.status == 404
