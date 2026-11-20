"""24 小時快取 E2E 測試（PRD F11、T17：第二次建立同帳號出現快取選項）。"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.conftest import BASE, login_as
from tests.e2e.test_jobs import JOB_URL, create
from tests.e2e.test_report import seed_job
from tests.helpers import REST, admin_headers

pytestmark = pytest.mark.e2e


def _finish(http, job_id: str, hours_ago: float):
    at = (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()
    r = http.patch(f"{REST}/analysis_jobs?id=eq.{job_id}", headers=admin_headers(), json={"finished_at": at})
    assert r.status_code in (200, 204), r.text


def _jobs_for(http, user, target: str) -> list:
    r = http.get(f"{REST}/analysis_jobs?user_id=eq.{user.id}&target_username=eq.{target}&select=id",
                 headers=admin_headers())
    return r.json()


def test_recent_result_offers_cache_choice(page: Page, http, user):
    cached_id = seed_job(http, user, "cache.recent", 30)
    _finish(http, cached_id, 2)
    login_as(page, user)

    create(page, "@cache.recent")
    choice = page.get_by_test_id("cache-choice")
    expect(choice).to_contain_text("24 小時內")
    assert len(_jobs_for(http, user, "cache.recent")) == 1, "提示時不應建立新任務"

    choice.get_by_role("link", name="使用快取結果").click()
    page.wait_for_url(f"{BASE}/dashboard/jobs/{cached_id}")
    expect(page.get_by_test_id("report")).to_be_visible()


def test_force_rescrape_creates_new_job(page: Page, http, user):
    cached_id = seed_job(http, user, "cache.force", 30)
    _finish(http, cached_id, 1)
    login_as(page, user)

    create(page, "cache.force")
    page.get_by_test_id("cache-choice").get_by_role("button", name="強制重新爬取").click()
    page.wait_for_url(JOB_URL)
    assert not page.url.endswith(cached_id)
    assert len(_jobs_for(http, user, "cache.force")) == 2


def test_stale_result_does_not_offer_cache(page: Page, http, user):
    old_id = seed_job(http, user, "cache.stale", 30)
    _finish(http, old_id, 25)
    login_as(page, user)

    create(page, "cache.stale")
    page.wait_for_url(JOB_URL)
    assert not page.url.endswith(old_id)
