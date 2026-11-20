"""匯出 E2E 測試（PRD AC10.1–10.3）。"""
from __future__ import annotations

import csv
import io
import json

import pytest
from playwright.sync_api import Page

from tests.e2e.conftest import BASE, login_as
from tests.e2e.test_report import seed_job

pytestmark = pytest.mark.e2e


def test_csv_download_has_bom_and_one_row_per_post(page: Page, http, user):
    """AC10.1：UTF-8 BOM、列數 = posts 數、中文正常。"""
    job_id = seed_job(http, user, "export.csv", 30)
    login_as(page, user)
    page.goto(f"{BASE}/dashboard/jobs/{job_id}")
    with page.expect_download() as dl:
        page.get_by_test_id("export-links").get_by_role("link", name="下載貼文 CSV").click()
    raw = open(dl.value.path(), "rb").read()
    assert raw.startswith(b"\xef\xbb\xbf")
    assert dl.value.suggested_filename == f"threads-export.csv-{job_id[:8]}.csv"
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    assert len(rows) == 30
    assert all(r["post_url"].startswith("https://") for r in rows)
    assert any(any("一" <= ch <= "鿿" for ch in r["text"]) for r in rows)


def test_json_export_contains_sections(page: Page, http, user):
    """AC10.2：可 JSON.parse，含 posts、summary、groups、insights。"""
    job_id = seed_job(http, user, "export.json", 30)
    login_as(page, user)
    r = page.request.get(f"{BASE}/api/jobs/{job_id}/export?format=json")
    assert r.status == 200
    assert "application/json" in r.headers["content-type"]
    body = json.loads(r.text())
    for key in ("posts", "summary", "groups", "insights"):
        assert body[key], key
    assert len(body["posts"]) == 30
    assert "raw_json" not in body["posts"][0]


def test_other_user_gets_404(page: Page, http, user, other_user):
    """AC10.3：B 呼叫 A 任務的匯出網址 → 404；未登入 → 401。"""
    job_id = seed_job(http, user, "export.private", 30)
    anon = page.request.get(f"{BASE}/api/jobs/{job_id}/export?format=csv")
    assert anon.status == 401
    login_as(page, other_user)
    for fmt in ("csv", "json"):
        r = page.request.get(f"{BASE}/api/jobs/{job_id}/export?format={fmt}")
        assert r.status == 404, fmt
