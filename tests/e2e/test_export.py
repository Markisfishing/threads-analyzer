"""匯出 E2E 測試（PRD AC10.1–10.3）。"""
from __future__ import annotations

import csv
import io
import json

import openpyxl
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


# openpyxl 讀不懂 Excel 2010 的資料橫條擴充（Excel 本身支援），只會略過並警告
@pytest.mark.filterwarnings("ignore:.*extension is not supported:UserWarning")
def test_xlsx_download_is_readable_report(page: Page, http, user, tmp_path):
    """Excel 報表：三個工作表、中文欄名、凍結標題、數字與百分比格式、可點連結。"""
    job_id = seed_job(http, user, "export.xlsx", 30)
    login_as(page, user)
    page.goto(f"{BASE}/dashboard/jobs/{job_id}")
    with page.expect_download() as dl:
        page.get_by_test_id("export-links").get_by_role("link", name="下載 Excel 報表").click()
    assert dl.value.suggested_filename == f"threads-export.xlsx-{job_id[:8]}.xlsx"
    path = tmp_path / dl.value.suggested_filename
    dl.value.save_as(path)  # 暫存檔沒有副檔名，openpyxl 需要 .xlsx
    wb = openpyxl.load_workbook(path)
    assert wb.sheetnames == ["總覽", "貼文", "策略建議"]

    ws = wb["貼文"]
    assert [c.value for c in ws[1]][:3] == ["發文時間", "內容", "按讚"]
    assert ws.max_row == 31  # 標題 + 30 篇
    assert ws.freeze_panes == "C2"
    assert ws.auto_filter.ref
    row = ws[2]
    assert row[0].number_format == "yyyy-mm-dd hh:mm" and row[0].is_date
    assert row[7].number_format == "0.00%"
    assert row[14].hyperlink.target.startswith("https://")
    assert wb["總覽"]["A1"].value == "@export.xlsx 貼文互動分析"
    assert wb["策略建議"].max_row >= 4  # 標題 + 至少 3 點建議


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
    for fmt in ("csv", "json", "xlsx"):
        r = page.request.get(f"{BASE}/api/jobs/{job_id}/export?format={fmt}")
        assert r.status == 404, fmt
