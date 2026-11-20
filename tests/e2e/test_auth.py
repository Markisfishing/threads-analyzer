"""登入與頁面保護 E2E 測試（PRD AC1.1–AC1.3）。執行：python -m pytest -m e2e"""
from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.conftest import BASE, login, login_as

pytestmark = pytest.mark.e2e


def test_login_success(page: Page, user):
    """AC1.1：正確帳密 → 導向 /dashboard 並顯示 Email。"""
    login_as(page, user)
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
    login_as(page, user)
    page.get_by_role("button", name="登出").click()
    page.wait_for_url(f"{BASE}/login")
    page.goto(f"{BASE}/dashboard")
    page.wait_for_url(f"{BASE}/login?next=*")


def test_open_redirect_blocked(page: Page, user):
    page.goto(f"{BASE}/login?next=//evil.example.com")
    login(page, user.email, user.password)
    page.wait_for_url(f"{BASE}/dashboard")
