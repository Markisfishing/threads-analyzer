"""登入與頁面保護 E2E 測試（PRD AC1.1–AC1.3）。

需要先啟動前端：npm run dev（預設 http://localhost:3000，可用 E2E_BASE_URL 覆寫）。
執行：python -m pytest -m e2e
"""
from __future__ import annotations

import os

import httpx
import pytest
from playwright.sync_api import Page, expect, sync_playwright

from tests.helpers import CONFIGURED, create_user, delete_user

pytestmark = pytest.mark.e2e

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:3000").rstrip("/")


def _server_up() -> bool:
    try:
        return httpx.get(BASE, timeout=5).status_code < 500
    except httpx.HTTPError:
        return False


if not CONFIGURED:
    pytest.skip("未設定 Supabase 環境變數", allow_module_level=True)
if not _server_up():
    pytest.skip(f"前端未啟動：{BASE}", allow_module_level=True)


@pytest.fixture(scope="module")
def user():
    with httpx.Client(timeout=30) as c:
        u = create_user(c, "e2e")
        yield u
        delete_user(c, u.id)


@pytest.fixture()
def page():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(locale="zh-TW")
        pg = ctx.new_page()
        pg.set_default_timeout(20000)
        yield pg
        browser.close()


def login(page: Page, email: str, password: str):
    page.get_by_label("Email").fill(email)
    page.get_by_label("密碼").fill(password)
    page.get_by_role("button", name="登入").click()


def test_login_success(page: Page, user):
    """AC1.1：正確帳密 → 導向 /dashboard 並顯示 Email。"""
    page.goto(f"{BASE}/login")
    login(page, user.email, user.password)
    page.wait_for_url(f"{BASE}/dashboard")
    expect(page.get_by_test_id("user-email")).to_have_text(user.email)


def test_login_wrong_password(page: Page, user):
    """AC1.2：錯誤密碼 → 顯示錯誤訊息，停留登入頁。"""
    page.goto(f"{BASE}/login")
    login(page, user.email, "wrong-password-123")
    expect(page.locator("form [role=alert]")).to_have_text("Email 或密碼錯誤")
    assert page.url.startswith(f"{BASE}/login")


def test_protected_route_redirects_and_returns(page: Page, user):
    """AC1.3：未登入開受保護頁 → /login?next=…，登入後回原頁。"""
    target = "/dashboard/jobs/00000000-0000-0000-0000-000000000000"
    page.goto(f"{BASE}{target}")
    page.wait_for_url(f"{BASE}/login?next=*")
    assert "next=%2Fdashboard%2Fjobs" in page.url
    login(page, user.email, user.password)
    page.wait_for_url(f"{BASE}{target}")


def test_logout(page: Page, user):
    page.goto(f"{BASE}/login")
    login(page, user.email, user.password)
    page.wait_for_url(f"{BASE}/dashboard")
    page.get_by_role("button", name="登出").click()
    page.wait_for_url(f"{BASE}/login")
    page.goto(f"{BASE}/dashboard")
    page.wait_for_url(f"{BASE}/login?next=*")


def test_open_redirect_blocked(page: Page, user):
    page.goto(f"{BASE}/login?next=//evil.example.com")
    login(page, user.email, user.password)
    page.wait_for_url(f"{BASE}/dashboard")
