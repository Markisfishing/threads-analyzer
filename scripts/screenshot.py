"""以示範帳號登入並截圖指定頁面（開發時檢查版面用）。

用法：python scripts/screenshot.py <路徑> <輸出檔> [--width 1280] [--dark]
需要 .env.local 的 DEMO_EMAIL / DEMO_PASSWORD，且前端已啟動（http://localhost:3000）。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from playwright.sync_api import sync_playwright  # noqa: E402

from tests.helpers import ROOT, read_env  # noqa: E402

BASE = "http://localhost:3000"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("out")
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--dark", action="store_true")
    args = ap.parse_args()
    env = read_env(ROOT / ".env.local")

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(locale="zh-TW", viewport={"width": args.width, "height": 900},
                            color_scheme="dark" if args.dark else "light")
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(f"{BASE}/login")
        page.get_by_label("Email").fill(env["DEMO_EMAIL"])
        page.get_by_label("密碼").fill(env["DEMO_PASSWORD"])
        page.get_by_role("button", name="登入").click()
        page.wait_for_url(f"{BASE}/dashboard")
        page.goto(f"{BASE}{args.path}")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1000)
        page.screenshot(path=args.out, full_page=True)
        width = page.evaluate("document.documentElement.scrollWidth")
        print(f"saved {args.out}; scrollWidth={width}; console errors={errors[:5]}")
        b.close()


if __name__ == "__main__":
    main()
