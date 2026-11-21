"""第三方登入、隱私權頁、帳號頁 E2E 測試（PRD AC1.6–1.9）。

第三方登入是否顯示取決於 Supabase 後台是否已啟用；本測試依實際設定驗證兩種情況。
"""
from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from playwright.sync_api import Page, expect

from tests.e2e.conftest import BASE, login, login_as
from tests.helpers import ANON_KEY, URL, create_user, delete_user

pytestmark = pytest.mark.e2e

LABELS = {"google": "使用 Google 繼續", "facebook": "使用 Facebook 繼續"}


def _enabled() -> list[str]:
    ext = httpx.get(f"{URL}/auth/v1/settings", headers={"apikey": ANON_KEY}, timeout=20).json()["external"]
    return [p for p in LABELS if ext.get(p)]


def test_login_page_shows_only_enabled_providers(page: Page):
    enabled = _enabled()
    for path in ("/login", "/signup"):
        page.goto(f"{BASE}{path}")
        for p, label in LABELS.items():
            expect(page.get_by_role("link", name=label)).to_have_count(1 if p in enabled else 0)
        expect(page.get_by_role("link", name="隱私權政策")).to_have_attribute("href", "/privacy")


@pytest.mark.parametrize("provider", ["google", "facebook"])
def test_oauth_route_redirects_to_supabase_or_rejects(page: Page, provider: str):
    r = page.request.get(f"{BASE}/auth/oauth?provider={provider}&next=/dashboard/compare",
                         max_redirects=0)
    assert r.status in (302, 307), r.status
    loc = r.headers["location"]
    if provider in _enabled():
        u = urlparse(loc)
        q = parse_qs(u.query)
        assert loc.startswith(f"{URL}/auth/v1/authorize")
        assert q["provider"] == [provider]
        assert q["code_challenge_method"] == ["s256"]
        assert q["redirect_to"][0].startswith(f"{BASE}/auth/callback?next=")
        assert "code-verifier" in r.headers.get("set-cookie", "")
    else:
        assert loc.endswith("/login?error=oauth_unavailable")


def test_unknown_provider_rejected(page: Page):
    page.goto(f"{BASE}/auth/oauth?provider=github")
    page.wait_for_url(f"{BASE}/login?error=oauth_unavailable")
    expect(page.locator("form [role=alert]")).to_have_text("此登入方式目前未開放")


def test_cancelled_oauth_shows_message(page: Page):
    page.goto(f"{BASE}/auth/callback?error=access_denied&error_description=user+denied")
    page.wait_for_url(f"{BASE}/login?error=oauth_cancelled")
    expect(page.locator("form [role=alert]")).to_have_text("已取消第三方登入")


def test_privacy_page_is_public(page: Page):
    page.goto(f"{BASE}/privacy")
    expect(page.get_by_role("heading", level=1)).to_have_text("隱私權政策與資料刪除")
    expect(page.locator("#data-deletion")).to_contain_text("刪除帳號")


def test_account_page_shows_info(page: Page, user):
    login_as(page, user)
    page.get_by_test_id("user-menu").click()
    page.get_by_role("menuitem", name="帳號設定").click()
    page.wait_for_url(f"{BASE}/dashboard/account")
    info = page.get_by_test_id("account-info")
    expect(info).to_contain_text(user.email)
    expect(info).to_contain_text("Email 與密碼")


def test_delete_account_requires_confirm_text_then_deletes(page: Page, http, user):
    """需先推送 delete_my_account migration。"""
    login_as(page, user)
    page.goto(f"{BASE}/dashboard/account")
    form = page.get_by_test_id("delete-account")
    button = form.get_by_role("button", name="刪除帳號")
    expect(button).to_be_disabled()
    form.get_by_label("確認文字").fill("delete")
    expect(button).to_be_disabled()

    form.get_by_label("確認文字").fill("刪除")
    expect(button).to_be_enabled()
    form.get_by_role("button", name="刪除帳號").click()
    page.wait_for_url(f"{BASE}/login?error=account_deleted")
    expect(page.get_by_role("status").first).to_contain_text("帳號與所有資料已刪除")

    from tests.helpers import admin_headers
    assert http.get(f"{URL}/auth/v1/admin/users/{user.id}", headers=admin_headers()).status_code == 404
    page.goto(f"{BASE}/dashboard")
    page.wait_for_url(f"{BASE}/login?next=%2Fdashboard")


def test_edit_display_name_shows_in_user_menu(page: Page, http):
    """用獨立帳號：同模組的刪除帳號測試會刪掉共用的 user。"""
    u = create_user(http, "e2e-name")
    try:
        login_as(page, u)
        page.goto(f"{BASE}/dashboard/account")
        form = page.get_by_test_id("display-name-form")
        form.get_by_label("顯示名稱").fill("測試小明")
        form.get_by_role("button", name="儲存名稱").click()
        expect(form.get_by_role("status")).to_have_text("✓ 已更新名稱")
        page.reload()
        page.get_by_test_id("user-menu").click()
        expect(page.get_by_role("menu")).to_contain_text("測試小明")
        page.goto(f"{BASE}/dashboard")
        expect(page.get_by_test_id("greeting")).to_have_text("嗨，測試小明")
    finally:
        delete_user(http, u.id)


def test_change_password_then_login_with_new_one(page: Page, http):
    """用獨立帳號測，避免影響同模組其他測試的登入密碼。"""
    u = create_user(http, "e2e-pw")
    try:
        login_as(page, u)
        page.goto(f"{BASE}/dashboard/account")
        form = page.get_by_test_id("change-password-form")
        form.get_by_label("新密碼", exact=True).fill("Abcdefg1")
        form.get_by_label("再輸入一次新密碼").fill("Abcdefg2")
        form.get_by_role("button", name="更新密碼").click()
        expect(form.get_by_role("alert")).to_have_text("兩次輸入的新密碼不一致")

        new_password = "NewPassw0rd!x"
        form.get_by_label("新密碼", exact=True).fill(new_password)
        form.get_by_label("再輸入一次新密碼").fill(new_password)
        form.get_by_role("button", name="更新密碼").click()
        expect(form.get_by_role("status")).to_contain_text("密碼已更新")

        page.context.clear_cookies()
        page.goto(f"{BASE}/login")
        login(page, u.email, new_password)
        page.wait_for_url(f"{BASE}/dashboard")
    finally:
        delete_user(http, u.id)


def test_forgot_password_shows_same_message_for_unknown_email(page: Page):
    """不洩漏帳號是否存在；用不存在的 Email，Supabase 不會真的寄信。"""
    page.goto(f"{BASE}/login")
    page.get_by_role("link", name="忘記密碼？").click()
    page.wait_for_url(f"{BASE}/forgot-password")
    page.get_by_label("Email").fill("nobody-e2e-reset@example.com")
    page.get_by_role("button", name="寄送重設連結").click()
    expect(page.get_by_role("status")).to_contain_text("若這個 Email 已註冊")
