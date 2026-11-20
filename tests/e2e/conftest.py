"""E2E 共用設定：需先啟動前端（npm run dev），預設 http://localhost:3000，可用 E2E_BASE_URL 覆寫。"""
from __future__ import annotations

import os

import httpx
import pytest
from playwright.sync_api import Page, sync_playwright

from tests.helpers import CONFIGURED, create_user, delete_user

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:3000").rstrip("/")


def _server_up() -> bool:
    try:
        return httpx.get(BASE, timeout=5).status_code < 500
    except httpx.HTTPError:
        return False


def pytest_collection_modifyitems(config, items):
    reason = None
    if not CONFIGURED:
        reason = "未設定 Supabase 環境變數"
    elif any("e2e" in i.keywords for i in items) and not _server_up():
        reason = f"前端未啟動：{BASE}"
    if reason:
        skip = pytest.mark.skip(reason=reason)
        for item in items:
            if "e2e" in item.keywords:
                item.add_marker(skip)


@pytest.fixture(scope="module")
def http():
    with httpx.Client(timeout=30) as c:
        yield c


@pytest.fixture(scope="module")
def user(http):
    u = create_user(http, "e2e")
    yield u
    delete_user(http, u.id)


@pytest.fixture(scope="module")
def other_user(http):
    u = create_user(http, "e2e")
    yield u
    delete_user(http, u.id)


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


def login_as(page: Page, u):
    page.goto(f"{BASE}/login")
    login(page, u.email, u.password)
    page.wait_for_url(f"{BASE}/dashboard")
