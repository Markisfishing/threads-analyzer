"""多帳號比較 E2E 測試（PRD AC9.1）。"""
from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.conftest import BASE, login_as
from tests.e2e.test_report import seed_job

pytestmark = pytest.mark.e2e


def test_compare_selection_limits_and_result(page: Page, http, user):
    """勾選 1 或 5 個 → 按鈕停用並提示；勾選 2 個 → 顯示比較表與圖。"""
    names = [f"cmp.acct{i}" for i in range(5)]
    for i, n in enumerate(names):
        seed_job(http, user, n, 30 if i % 2 == 0 else 12, status="completed" if i % 2 == 0 else "partial")

    login_as(page, user)
    page.goto(f"{BASE}/dashboard")
    bar = page.get_by_test_id("compare-bar")
    button = bar.get_by_role("button", name="比較所選帳號")
    hint = bar.locator("#compare-hint")
    box = lambda n: page.get_by_role("checkbox", name=f"加入比較 @{n}")  # noqa: E731

    expect(button).to_be_disabled()
    box(names[0]).check()
    expect(button).to_be_disabled()
    expect(hint).to_contain_text("請勾選 2–4 個")

    for n in names[1:]:
        box(n).check()
    expect(button).to_be_disabled()
    expect(hint).to_contain_text("最多比較 4 個")

    for n in names[2:]:
        box(n).uncheck()
    expect(button).to_be_enabled()
    button.click()
    page.wait_for_url("**/dashboard/compare?ids=*")

    table = page.get_by_test_id("compare-table")
    expect(table.locator("thead th")).to_have_count(3)
    expect(table).to_contain_text(f"@{names[0]}")
    expect(table).to_contain_text(f"@{names[1]}")
    expect(table.get_by_role("row", name="平均互動率")).to_be_visible()
    expect(page.get_by_role("status")).to_contain_text("部分完成")

    chart = page.get_by_test_id("chart-compare-types")
    expect(chart.locator(".recharts-bar-rectangle").first).to_be_visible()
    chart.get_by_role("button", name="表格檢視").click()
    expect(chart.locator("thead th")).to_have_count(3)


def test_compare_rejects_bad_selection_and_foreign_jobs(page: Page, http, user, other_user):
    mine = seed_job(http, user, "cmp.mine", 30)
    theirs = seed_job(http, other_user, "cmp.theirs", 30)
    login_as(page, user)

    page.goto(f"{BASE}/dashboard/compare?ids={mine}")
    expect(page.locator("p[role=alert]")).to_contain_text("請勾選 2–4 個")

    page.goto(f"{BASE}/dashboard/compare?ids={mine},{theirs}")
    expect(page.locator("p[role=alert]")).to_contain_text("不屬於你")
    expect(page.get_by_test_id("compare-table")).to_have_count(0)
