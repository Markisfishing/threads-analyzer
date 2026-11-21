"""第三方登入、隱私權頁、帳號頁 E2E 測試（PRD AC1.6–1.9）。

第三方登入是否顯示取決於 Supabase 後台是否已啟用；本測試依實際設定驗證兩種情況。
"""
from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from playwright.sync_api import Page, expect

from tests.e2e.conftest import BASE, login_as
from tests.helpers import ANON_KEY, URL

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
    form.get_by_label("確認文字").fill("delete")
    form.get_by_role("button", name="刪除帳號").click()
    expect(form.get_by_role("alert")).to_have_text("請輸入「刪除」確認")

    form.get_by_label("確認文字").fill("刪除")
    form.get_by_role("button", name="刪除帳號").click()
    page.wait_for_url(f"{BASE}/login?error=account_deleted")
    expect(page.get_by_role("status").first).to_contain_text("帳號與所有資料已刪除")

    from tests.helpers import admin_headers
    assert http.get(f"{URL}/auth/v1/admin/users/{user.id}", headers=admin_headers()).status_code == 404
    page.goto(f"{BASE}/dashboard")
    page.wait_for_url(f"{BASE}/login?next=%2Fdashboard")
