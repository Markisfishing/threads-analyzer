"""T1 spike：測試可取得的貼文篇數與欄位。

兩種資料來源同時收集並比較：
  1. 頁面內嵌 JSON（<script type="application/json">）
  2. 捲動時的 GraphQL / API 回應（攔截 network response）
貼文物件辨識規則：dict 同時有 code、taken_at、like_count。

用法：
  python spike/t1_scrape.py <username> [--auth] [--max 50] [--headed]
  --auth：載入 spike/storage_state.json（登入狀態）
輸出：spike/out/<username>_<mode>.json 與統計摘要。
"""
import argparse
import json
import random
import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)
STATE = ROOT / "storage_state.json"


def find_posts(obj, acc):
    """遞迴找出貼文物件，以 code 為 key 存入 acc。"""
    if isinstance(obj, dict):
        if "code" in obj and "taken_at" in obj and "like_count" in obj:
            acc[obj["code"]] = obj
        for v in obj.values():
            find_posts(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            find_posts(v, acc)


def find_key(obj, key):
    if isinstance(obj, dict):
        if key in obj and obj[key] is not None:
            return obj[key]
        for v in obj.values():
            r = find_key(v, key)
            if r is not None:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = find_key(v, key)
            if r is not None:
                return r
    return None


def slim(p):
    info = p.get("text_post_app_info") or {}
    caption = p.get("caption") or {}
    user = p.get("user") or {}
    return {
        "code": p.get("code"),
        "username": user.get("username"),
        "taken_at": p.get("taken_at"),
        "text": caption.get("text") if isinstance(caption, dict) else None,
        "like_count": p.get("like_count"),
        "reply_count": info.get("direct_reply_count"),
        "repost_count": info.get("repost_count"),
        "quote_count": info.get("quote_count"),
        "reshare_count": info.get("reshare_count"),
        "view_count": p.get("view_count"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("username")
    ap.add_argument("--auth", action="store_true")
    ap.add_argument("--max", type=int, default=50)
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()
    mode = "auth" if args.auth else "anon"

    posts: dict = {}
    sources = {"embedded": set(), "network": set()}
    follower = None
    log = []

    def on_response(resp):
        url = resp.url
        if not re.search(r"/(graphql|api)/", url):
            return
        try:
            data = resp.json()
        except Exception:
            return
        acc = {}
        find_posts(data, acc)
        if acc:
            posts.update(acc)
            sources["network"].update(acc)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        ctx_kwargs = dict(locale="zh-TW", viewport={"width": 1280, "height": 900},
                          timezone_id="Asia/Taipei")
        if args.auth:
            ctx_kwargs["storage_state"] = str(STATE)
        ctx = browser.new_context(**ctx_kwargs)
        page = ctx.new_page()
        page.on("response", on_response)

        t0 = time.time()
        page.goto(f"https://www.threads.com/@{args.username}",
                  wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(4000)

        for s in page.locator('script[type="application/json"]').all():
            try:
                data = json.loads(s.inner_text())
            except Exception:
                continue
            acc = {}
            find_posts(data, acc)
            posts.update(acc)
            sources["embedded"].update(acc)
            if follower is None:
                follower = find_key(data, "follower_count")

        login_wall = page.get_by_text("使用 Instagram 帳號繼續").count() > 0
        log.append(f"初始：posts={len(posts)} dom_time={page.locator('time').count()} login_modal={login_wall}")

        # 關閉登入彈窗（按 Escape），嘗試捲動
        page.keyboard.press("Escape")
        stale = 0
        rounds = 0
        while len(own_posts(posts, args.username)) < args.max and stale < 3 and rounds < 40:
            before = len(posts)
            dom_before = page.locator("time").count()
            page.mouse.wheel(0, 4000)
            page.wait_for_timeout(random.randint(1500, 3000))
            rounds += 1
            dom_after = page.locator("time").count()
            got = len(posts) - before
            stale = stale + 1 if (got == 0 and dom_after == dom_before) else 0
            log.append(f"捲動 {rounds}: +{got} 篇 (json 共 {len(posts)}), dom time={dom_after}")

        dom_count = page.locator("time").count()
        url_now = page.url
        page.screenshot(path=str(OUT / f"{args.username}_{mode}_end.png"))
        elapsed = time.time() - t0
        browser.close()

    mine = own_posts(posts, args.username)
    rows = sorted((slim(p) for p in mine.values()), key=lambda r: r["taken_at"] or 0, reverse=True)
    (OUT / f"{args.username}_{mode}.json").write_text(
        json.dumps({"follower_count": follower, "posts": rows}, ensure_ascii=False, indent=1),
        encoding="utf-8")

    print("\n".join(log))
    print(f"== {args.username} [{mode}] 耗時 {elapsed:.0f}s, 結束網址 {url_now}")
    print(f"JSON 貼文(本人) {len(rows)} / 全部 {len(posts)}；來源 embedded={len(sources['embedded'])} network={len(sources['network'])}；DOM time={dom_count}")
    print(f"粉絲數 {follower}")
    if rows:
        def filled(k):
            return sum(1 for r in rows if r[k] is not None)
        print("欄位覆蓋：" + ", ".join(f"{k}={filled(k)}" for k in
              ["taken_at", "text", "like_count", "reply_count", "repost_count", "quote_count", "view_count"]))
        print("範例：", json.dumps(rows[0], ensure_ascii=False)[:300])


def own_posts(posts, username):
    return {c: p for c, p in posts.items()
            if ((p.get("user") or {}).get("username") or "").lower() == username.lower()}


if __name__ == "__main__":
    main()
