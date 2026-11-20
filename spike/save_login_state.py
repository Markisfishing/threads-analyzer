"""產生 Threads 登入狀態（storageState）。

會開啟一個可見的 Chromium 視窗，請在視窗中自行登入 Threads。
偵測到登入成功（sessionid cookie 出現）後自動儲存到 spike/storage_state.json 並關閉。
最多等待 10 分鐘。此檔含登入 session，已列入 .gitignore，請勿分享。
"""
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

STATE = Path(__file__).parent / "storage_state.json"


def logged_in(ctx):
    return any(c["name"] == "sessionid" and "threads" in c["domain"] for c in ctx.cookies())


with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    ctx = browser.new_context(locale="zh-TW", viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    page.goto("https://www.threads.com/login")
    print("請在開啟的瀏覽器視窗中登入 Threads……", flush=True)
    deadline = time.time() + 600
    while time.time() < deadline:
        if logged_in(ctx):
            page.wait_for_timeout(3000)
            ctx.storage_state(path=str(STATE))
            print(f"已儲存登入狀態：{STATE}", flush=True)
            break
        page.wait_for_timeout(2000)
    else:
        print("逾時未偵測到登入。", flush=True)
    browser.close()
