"""T1 spike：探查 Threads 個人頁面結構（未登入）。

用法：python spike/probe.py <username>
輸出：spike/out/<username>_probe.html、截圖，以及關鍵元素統計。
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)

username = sys.argv[1] if len(sys.argv) > 1 else "zuck"
url = f"https://www.threads.com/@{username}"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(locale="zh-TW", viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    resp = page.goto(url, wait_until="domcontentloaded", timeout=30000)
    print("status", resp.status if resp else None, "final url", page.url)
    page.wait_for_timeout(5000)
    print("title", page.title())
    print("time tags", page.locator("time").count())
    print("post links", page.locator('a[href*="/post/"]').count())
    print("pagelets", page.locator('div[data-pressable-container="true"]').count())
    (OUT / f"{username}_probe.html").write_text(page.content(), encoding="utf-8")
    page.screenshot(path=str(OUT / f"{username}_probe.png"), full_page=False)
    browser.close()
