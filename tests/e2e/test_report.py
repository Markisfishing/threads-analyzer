"""報告頁 E2E 測試（PRD AC7.1、AC6.2 UI、AC12 來源標示）。

以 worker 的真實分析程式對固定樣本資料產生結果，用 service role 寫入後檢查頁面。
"""
from __future__ import annotations

import httpx
import pytest
from playwright.sync_api import Page, expect

from tests.e2e.conftest import BASE, login_as
from tests.helpers import REST, admin_headers
from tests.worker.fakes import MemoryStore
from tests.worker.sample import META, cleaned
from worker.analysis import make_analyzer
from worker.config import load_settings
from worker.pipeline import JobContext

pytestmark = pytest.mark.e2e


def seed_job(http: httpx.Client, user, target: str, n_posts: int, status: str = "completed") -> str:
    r = http.post(f"{REST}/analysis_jobs", headers={**user.h, "Prefer": "return=representation"},
                  json={"target_username": target})
    job = r.json()[0]
    posts = cleaned(n_posts)
    for p in posts:
        p.update(job_id=job["id"], user_id=user.id)
    store = MemoryStore()
    fake = store.claim_job(store.add_job()["id"])
    row = make_analyzer(load_settings(env_file=None))(fake, posts, META, JobContext(store, fake))
    ah = {**admin_headers(), "Prefer": "return=minimal"}
    assert http.post(f"{REST}/posts", headers=ah, json=posts).status_code == 201
    assert http.post(f"{REST}/analysis_results", headers=ah,
                     json={"job_id": job["id"], "user_id": user.id, **row}).status_code == 201
    http.patch(f"{REST}/analysis_jobs?id=eq.{job['id']}", headers=ah,
               json={"status": status, "scraped_count": n_posts, "account_meta": META})
    return job["id"]


def test_completed_report_has_required_sections(page: Page, http, user):
    """AC7.1：總覽卡片、Top posts、≥ 2 張圖表、≥ 3 點觀察、資料限制。"""
    job_id = seed_job(http, user, "report.full", 30)
    login_as(page, user)
    page.goto(f"{BASE}/dashboard/jobs/{job_id}")
    expect(page.get_by_test_id("report")).to_be_visible()
    expect(page.get_by_test_id("overview").locator("dt")).to_have_count(8)
    expect(page.get_by_test_id("top-posts").locator("tbody tr")).to_have_count(5)
    charts = page.locator("[data-testid^=chart-]")
    assert charts.count() >= 2
    expect(page.get_by_test_id("groups")).to_be_visible()
    insights = page.get_by_test_id("insights").locator("li")
    assert insights.count() >= 3
    first = insights.first
    for label in ("觀察（數據）", "推測", "建議", "驗證方法"):
        expect(first.get_by_text(label, exact=True)).to_be_visible()
    expect(page.get_by_test_id("insight-source")).to_contain_text("規則模板")
    expect(page.get_by_test_id("limitations")).to_contain_text("曝光數")


def test_chart_table_view_toggle(page: Page, http, user):
    job_id = seed_job(http, user, "report.table", 30)
    login_as(page, user)
    page.goto(f"{BASE}/dashboard/jobs/{job_id}")
    card = page.get_by_test_id("chart-types")
    card.get_by_role("button", name="表格檢視").click()
    expect(card.locator("table tbody tr")).to_have_count(4)


def test_partial_report_shows_group_skip_reason(page: Page, http, user):
    """AC6.2 UI：8 篇 → partial，顯示未分組原因與資料不足提示。"""
    job_id = seed_job(http, user, "report.small", 8, status="partial")
    http.patch(f"{REST}/analysis_jobs?id=eq.{job_id}", headers=admin_headers(),
               json={"error_code": "INSUFFICIENT_POSTS", "error_message": "僅取得 8 篇（目標 30），結果可信度較低"})
    login_as(page, user)
    page.goto(f"{BASE}/dashboard/jobs/{job_id}")
    expect(page.get_by_test_id("groups-skipped")).to_contain_text("樣本不足 9 篇")
    expect(page.get_by_test_id("job-finished")).to_contain_text("僅取得 8 篇")
    expect(page.get_by_test_id("limitations")).to_contain_text("僅取得 8 篇")
