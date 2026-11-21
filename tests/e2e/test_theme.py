"""主題切換 E2E 測試：跟隨系統／亮色／暗色、重新整理後保留、無 JS 閃爍、導覽列按鈕。執行：python -m pytest -m e2e"""
from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect, sync_playwright

from tests.e2e.conftest import BASE, login_as

pytestmark = pytest.mark.e2e


@pytest.fixture()
def dark_page():
    """系統偏好為暗色的瀏覽器。"""
    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_context(locale="zh-TW", color_scheme="dark").new_page()
        pg.set_default_timeout(20000)
        yield pg
        browser.close()


def theme(page: Page) -> str | None:
    return page.evaluate("document.documentElement.dataset.theme")


def bg(page: Page) -> str:
    return page.evaluate("getComputedStyle(document.body).backgroundColor")


def wait_theme(page: Page, value: str):
    """換色在 View Transition 的下一個畫格才套用，等到 data-theme 變更為止。"""
    page.wait_for_function(f"document.documentElement.dataset.theme === '{value}'", timeout=5000)


def choose(page: Page, label: str, expected: str):
    page.get_by_test_id("theme-toggle").first.click()
    page.get_by_role("menuitemradio", name=label).click()
    wait_theme(page, expected)


def test_follows_system_by_default(dark_page: Page):
    dark_page.goto(f"{BASE}/login")
    assert theme(dark_page) == "dark"
    expect(dark_page.get_by_test_id("theme-toggle")).to_have_attribute("aria-label", "切換主題（目前：跟隨系統）")


def test_manual_light_overrides_system_and_persists(dark_page: Page):
    dark_page.goto(f"{BASE}/login")
    dark_bg = bg(dark_page)
    choose(dark_page, "亮色", "light")
    assert theme(dark_page) == "light"
    assert bg(dark_page) != dark_bg
    # 重新整理：inline script 在繪製前就套用，第一個讀到的值已是亮色
    dark_page.reload()
    assert theme(dark_page) == "light"
    expect(dark_page.get_by_role("menuitemradio")).to_have_count(0)
    dark_page.get_by_test_id("theme-toggle").click()
    expect(dark_page.get_by_role("menuitemradio", name="亮色")).to_have_attribute("aria-checked", "true")
    # 選回跟隨系統
    dark_page.get_by_role("menuitemradio", name="跟隨系統").click()
    wait_theme(dark_page, "dark")
    assert dark_page.evaluate("localStorage.getItem('theme')") is None


def test_manual_dark_and_menu_closes_on_escape(page: Page):
    page.goto(f"{BASE}/login")
    assert theme(page) == "light"
    choose(page, "暗色", "dark")
    assert theme(page) == "dark"
    assert page.evaluate("getComputedStyle(document.documentElement).colorScheme") == "dark"
    page.get_by_test_id("theme-toggle").click()
    expect(page.get_by_role("menu", name="主題")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.get_by_role("menu", name="主題")).to_have_count(0)


def test_dashboard_navbar_toggle(page: Page, user):
    login_as(page, user)
    # 導覽列只放一顆（浮動按鈕在 /dashboard 隱藏）
    expect(page.get_by_test_id("theme-toggle")).to_have_count(1)
    choose(page, "暗色", "dark")
    page.goto(f"{BASE}/dashboard/account")
    assert theme(page) == "dark"
