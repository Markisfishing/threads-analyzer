"""Threads 貼文爬蟲（PRD F3，依 T1 spike 結論）。

資料取自頁面內嵌 JSON 與捲動時的 /graphql 回應，不解析 DOM。
流程：未登入模式 → 篇數不足且有登入狀態 → 登入模式續爬（以 post_id 去重）。
"""
from __future__ import annotations

import base64
import json
import logging
import random
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from worker.config import Settings
from worker.pipeline import JobContext, JobError, ScrapeResult

log = logging.getLogger("worker.scraper")

PROFILE_URL = "https://www.threads.com/@{username}"
NOT_FOUND_PATTERNS = ("頁面不存在", "頁面真的走丟了", "this page isn't available", "Sorry, this page", "page isn't available")
LOGIN_WALL_TEXT = ("使用 Instagram 帳號繼續", "Continue with Instagram")
MAX_STALE_SCROLLS = 3
MAX_SCROLL_ROUNDS = 60


# ============================================================ 純函式：JSON 解析（可單元測試）

def find_posts(obj: Any, acc: dict[str, dict]) -> None:
    """遞迴找出貼文物件（同時具有 code、taken_at、like_count 的 dict），以 code 為 key。"""
    if isinstance(obj, dict):
        if "code" in obj and "taken_at" in obj and "like_count" in obj and obj.get("code"):
            acc[obj["code"]] = obj
        for v in obj.values():
            find_posts(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            find_posts(v, acc)


def find_user_meta(obj: Any, username: str) -> dict | None:
    """找出目標帳號的使用者資訊（含 follower_count 的 user dict）。"""
    target = username.lower()
    stack = [obj]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            if str(cur.get("username", "")).lower() == target and "follower_count" in cur:
                return {
                    "display_name": cur.get("full_name") or None,
                    "follower_count": _int(cur.get("follower_count")),
                    "is_private": bool(cur.get("is_private") or cur.get("text_post_app_is_private")),
                    "is_verified": bool(cur.get("is_verified")),
                }
            stack.extend(cur.values())
        elif isinstance(cur, list):
            stack.extend(cur)
    return None


def _int(v: Any) -> int | None:
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return int(v)
    if isinstance(v, str) and re.fullmatch(r"\d+", v):
        return int(v)
    return None


def is_own_post(raw: dict, username: str) -> bool:
    return str((raw.get("user") or {}).get("username", "")).lower() == username.lower()


def to_row(raw: dict, job: dict) -> dict:
    """原始貼文物件 → posts 表欄位（欄位對應見 docs/spikes/T1-scrape-feasibility.md）。"""
    info = raw.get("text_post_app_info") or {}
    caption = raw.get("caption") if isinstance(raw.get("caption"), dict) else {}
    taken_at = _int(raw.get("taken_at"))
    username = job["target_username"]
    missing = [k for k, v in (("likes", raw.get("like_count")), ("replies", info.get("direct_reply_count")),
                              ("reposts", info.get("repost_count")), ("quotes", info.get("quote_count")),
                              ("published_at", taken_at)) if _int(v) is None]
    return {
        "job_id": job["id"],
        "user_id": job["user_id"],
        "post_id": raw["code"],
        "post_url": f"https://www.threads.com/@{username}/post/{raw['code']}",
        "published_at": datetime.fromtimestamp(taken_at, tz=timezone.utc).isoformat() if taken_at else None,
        "text": (caption or {}).get("text") or "",
        "views": None,  # 公開頁面不可得（PRD R3）
        "likes": _int(raw.get("like_count")),
        "replies": _int(info.get("direct_reply_count")),
        "reposts": _int(info.get("repost_count")),
        "quotes": _int(info.get("quote_count")),
        "missing_fields": missing,
        "raw_json": {
            "code": raw.get("code"),
            "taken_at": taken_at,
            "media_type": raw.get("media_type"),
            "like_count": raw.get("like_count"),
            "text_post_app_info": {k: info.get(k) for k in
                                   ("direct_reply_count", "repost_count", "quote_count", "reshare_count")},
            "is_pinned": bool(raw.get("is_pinned") or info.get("is_pinned")),
        },
    }


def select_rows(raw_posts: dict[str, dict], job: dict) -> list[dict]:
    """過濾非本人貼文 → 依發文時間新到舊 → 截斷至 max_posts。"""
    own = [p for p in raw_posts.values() if is_own_post(p, job["target_username"])]
    own.sort(key=lambda p: _int(p.get("taken_at")) or 0, reverse=True)
    return [to_row(p, job) for p in own[: job["max_posts"]]]


def load_storage_state(value: str) -> dict | None:
    """THREADS_STORAGE_STATE 可為：JSON 字串、檔案路徑、或 JSON 的 base64。"""
    value = (value or "").strip()
    if not value:
        return None
    if value.startswith("{"):
        return json.loads(value)
    path = Path(value)
    if len(value) < 260 and path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return json.loads(base64.b64decode(value).decode("utf-8"))


# ============================================================ 瀏覽器操作

@dataclass
class SessionResult:
    raw_posts: dict[str, dict] = field(default_factory=dict)
    meta: dict | None = None
    not_found: bool = False
    login_redirect: bool = False
    login_wall: bool = False
    timed_out: bool = False


class ThreadsScraper:
    def __init__(self, settings: Settings, *, sleep: Callable[[float], None] = time.sleep):
        self.s = settings
        self.sleep = sleep

    # ------------------------------------------------------------ 入口
    def __call__(self, job: dict, ctx: JobContext) -> ScrapeResult:
        username = job["target_username"]
        target = job["max_posts"]
        deadline = time.monotonic() + self.s.scrape_timeout_sec
        state = self._storage_state(ctx)

        collected: dict[str, dict] = {}
        meta: dict = {}
        mode = "anonymous"
        warning = None

        anon = self._session(job, ctx, None, collected, deadline)
        meta = anon.meta or {}
        own = self._own_count(collected, username)
        ctx.log("info", "scrape", f"未登入模式取得 {own} 篇"
                + ("（出現登入牆）" if anon.login_wall or anon.login_redirect else ""))

        if anon.not_found:
            raise JobError("ACCOUNT_NOT_FOUND", f"找不到帳號 @{username}，請確認拼字", keep_partial=False)
        if meta.get("is_private") and own == 0:
            raise JobError("ACCOUNT_PRIVATE", f"@{username} 為私人帳號，無法分析", keep_partial=False)

        if own < target and not anon.timed_out:
            if state:
                mode = "authenticated"
                ctx.log("info", "scrape", "篇數不足，改用登入模式續爬")
                auth = self._session(job, ctx, state, collected, deadline)
                meta = auth.meta or meta
                if auth.not_found:
                    raise JobError("ACCOUNT_NOT_FOUND", f"找不到帳號 @{username}，請確認拼字", keep_partial=False)
                if auth.login_redirect:
                    warning = "登入狀態失效，僅以未登入資料分析"
                    mode = "anonymous"
                anon.timed_out = auth.timed_out
            else:
                ctx.log("info", "scrape", "未設定登入狀態，略過登入模式")

        rows = select_rows(collected, job)
        ctx.store.update_job(job["id"], account_meta=meta or None, scrape_mode=mode)
        if rows:
            ctx.store.upsert_posts(rows)
        ctx.progress(len(rows))

        if not rows:
            if meta.get("is_private"):
                raise JobError("ACCOUNT_PRIVATE", f"@{username} 為私人帳號，無法分析", keep_partial=False)
            if anon.login_redirect and not state:
                raise JobError("ACCOUNT_NOT_FOUND",
                               f"找不到帳號 @{username}，或 Threads 要求登入才能查看", keep_partial=False)
            raise JobError("SCRAPE_BLOCKED", "Threads 暫時限制存取，請稍後重跑", keep_partial=False)
        if anon.timed_out and len(rows) < 30:
            raise JobError("TIMEOUT", f"抓取逾時，已保存 {len(rows)} 篇")

        return ScrapeResult(posts=rows, account_meta=meta, scrape_mode=mode, warning=warning)

    # ------------------------------------------------------------ 單一瀏覽器階段
    def _session(self, job, ctx: JobContext, storage_state: dict | None, collected: dict, deadline: float) -> SessionResult:
        from playwright.sync_api import Error as PwError
        from playwright.sync_api import sync_playwright

        username = job["target_username"]
        res = SessionResult()

        def on_response(resp):
            if not re.search(r"/(graphql|api)/", resp.url):
                return
            try:
                data = resp.json()
            except Exception:  # noqa: BLE001 — 非 JSON 回應直接略過
                return
            find_posts(data, collected)
            if res.meta is None:
                res.meta = find_user_meta(data, username)

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=self.s.headless)
            try:
                context = browser.new_context(
                    locale="zh-TW", timezone_id="Asia/Taipei", viewport={"width": 1280, "height": 900},
                    storage_state=storage_state,
                )
                page = context.new_page()
                page.on("response", on_response)
                self._goto_with_retry(page, PROFILE_URL.format(username=username), ctx, PwError)
                page.wait_for_timeout(3000)

                if "/login" in page.url:
                    res.login_redirect = True
                    return res
                body = page.locator("body").inner_text(timeout=10000)
                if any(t in body for t in NOT_FOUND_PATTERNS):
                    res.not_found = True
                    return res

                for s in page.locator('script[type="application/json"]').all():
                    try:
                        data = json.loads(s.inner_text())
                    except Exception:  # noqa: BLE001
                        continue
                    find_posts(data, collected)
                    if res.meta is None:
                        res.meta = find_user_meta(data, username)

                res.login_wall = any(page.get_by_text(t).count() > 0 for t in LOGIN_WALL_TEXT)
                if res.login_wall:
                    page.keyboard.press("Escape")

                stale = 0
                for rnd in range(MAX_SCROLL_ROUNDS):
                    own = self._own_count(collected, username)
                    ctx.progress(min(own, job["max_posts"]))  # 心跳＋取消檢查
                    if own >= job["max_posts"] or stale >= MAX_STALE_SCROLLS:
                        break
                    if time.monotonic() > deadline:
                        res.timed_out = True
                        ctx.log("warn", "scrape", "整體爬取時間超過上限")
                        break
                    before = len(collected)
                    page.mouse.wheel(0, 4000)
                    page.wait_for_timeout(random.randint(self.s.scrape_delay_ms_min, self.s.scrape_delay_ms_max))
                    gained = len(collected) - before
                    stale = stale + 1 if gained == 0 else 0
                    if gained:
                        ctx.log("info", "scrape", f"第 {rnd + 1} 批 +{gained} 篇（本人貼文共 {self._own_count(collected, username)}）")
            finally:
                browser.close()
        return res

    def _goto_with_retry(self, page, url: str, ctx: JobContext, pw_error) -> None:
        attempts = max(1, self.s.scrape_max_retries)
        for i in range(attempts):
            try:
                resp = page.goto(url, wait_until="domcontentloaded", timeout=30000)
                if resp is not None and resp.status == 429:
                    raise JobError("SCRAPE_BLOCKED", "Threads 暫時限制存取，請稍後重跑")
                return
            except (pw_error, JobError) as e:
                if i == attempts - 1:
                    if isinstance(e, JobError):
                        raise
                    raise JobError("TIMEOUT", "Threads 頁面載入逾時，請稍後重跑") from e
                wait = 2 ** (i + 1)
                ctx.log("warn", "scrape", f"載入失敗（{type(e).__name__}），{wait} 秒後重試 {i + 1}/{attempts - 1}")
                self.sleep(wait)

    def _storage_state(self, ctx: JobContext) -> dict | None:
        try:
            return load_storage_state(self.s.threads_storage_state)
        except Exception:  # noqa: BLE001
            ctx.log("warn", "scrape", "THREADS_STORAGE_STATE 格式錯誤，略過登入模式")
            return None

    @staticmethod
    def _own_count(collected: dict, username: str) -> int:
        return sum(1 for p in collected.values() if is_own_post(p, username))


def make_scraper(settings: Settings) -> ThreadsScraper:
    return ThreadsScraper(settings)
