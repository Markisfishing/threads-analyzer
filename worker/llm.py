"""Groq LLM 策略建議（PRD F12）。

- OpenAI 相容 Chat Completions，要求 JSON 輸出
- 驗證：schema 檢查 + 數字防幻覺（引用的數字必須出現在送出的資料中）
- 逾時 / 429 / 5xx 重試 2 次；失敗或合格條目 < 3 → 由呼叫端改用規則模板
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Callable

import httpx

log = logging.getLogger("worker.llm")

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-oss-120b"
REQUIRED = ("title", "observation", "hypothesis", "action", "validation", "priority", "timeline")
PRIORITIES = {"P1", "P2", "P3"}
NUM_RE = re.compile(r"-?\d[\d,]*\.?\d*")
MIN_VALID, MAX_ITEMS = 3, 5

SYSTEM_PROMPT = """你是社群內容策略分析師。根據使用者提供的 Threads 帳號分析數據（JSON），用繁體中文提出 3–5 條具體、可執行的內容策略建議。

規則：
1. 每條建議的 observation 必須引用資料中「實際出現」的數字，不可自行計算新數字或編造數字。
2. 清楚區分 observation（數據觀察）與 hypothesis（推測原因）。
3. action 要具體到下一週就能執行。
4. validation 說明如何用數據驗證建議是否有效。
5. priority 只能是 P1、P2、P3；timeline 例如「2 週」。
6. evidence 填入 observation 引用的原始數字（數字陣列）。

只輸出 JSON：{"insights":[{"title":"","observation":"","hypothesis":"","action":"","validation":"","priority":"P1","timeline":"","evidence":[0]}]}"""


class LLMError(Exception):
    pass


def build_payload(summary: dict, groups: dict, top: dict) -> dict:
    """送給 LLM 的精簡資料（只含數字與貼文摘要，不含使用者個資）。"""
    ov = summary["overview"]
    t = summary["time"]
    payload: dict[str, Any] = {
        "overview": {k: ov.get(k) for k in ("post_count", "follower_count", "posts_per_week", "outlier_count")}
        | {k: ov.get(k) for k in ("likes", "replies", "reposts", "engagement", "engagement_rate_pct")},
        "best_weekday": t.get("best_weekday"),
        "best_hour": t.get("best_hour"),
        "most_posted_weekday": t.get("most_posted_weekday"),
        "length_bins": summary["length"]["bins"],
        "length_spearman": summary["length"].get("spearman"),
        "post_types": summary["types"],
        "top_keywords": summary["keywords"]["keywords"][:10],
        "top_hashtags": summary["keywords"]["hashtags"][:10],
        "top_posts": [{k: p.get(k) for k in ("text", "likes", "replies", "reposts", "engagement", "engagement_rate_pct")}
                      for p in (top.get("items") or [])[:5]],
    }
    if groups and not groups.get("skipped"):
        payload["groups"] = {
            g: {"size": v["size"], "score_range": v["score_range"], "features": v["features"],
                "top_terms": [x["term"] for x in v["top_terms"][:8]]}
            for g, v in groups["groups"].items()
        }
        payload["group_comparison"] = groups["comparison"]
    return payload


def allowed_numbers(payload: dict) -> list[float]:
    nums: list[float] = []

    def walk(x):
        if isinstance(x, bool) or x is None:
            return
        if isinstance(x, (int, float)):
            nums.extend([float(x), float(x) * 100])  # 比例也允許以百分比呈現
        elif isinstance(x, str):
            nums.extend(_parse_nums(x))
        elif isinstance(x, dict):
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    walk(payload)
    return nums


def _parse_nums(text: str) -> list[float]:
    out = []
    for m in NUM_RE.findall(text):
        try:
            out.append(float(m.replace(",", "").rstrip(".")))
        except ValueError:
            continue
    return out


RATIO_RE = re.compile(r"(\d+(?:\.\d+)?)\s*倍")


def _split_ratios(text: str) -> tuple[list[float], list[float]]:
    """「2.3 倍」視為由 evidence 推導的倍數，其餘數字需直接出現在資料中。"""
    ratios = [float(m) for m in RATIO_RE.findall(text)]
    return _parse_nums(RATIO_RE.sub(" ", text)), ratios


def _ratio_ok(r: float, evidence: list[float]) -> bool:
    """倍數必須等於 evidence 中某兩個數字的比值（容許四捨五入誤差）。"""
    if r.is_integer() and r < 10 and not evidence:
        return True
    return any(b and abs(a / b - r) <= 0.051 for i, a in enumerate(evidence) for j, b in enumerate(evidence) if i != j)


def _supported(n: float, allowed: list[float]) -> bool:
    if abs(n) < 10 and float(n).is_integer():
        return True  # 小整數（篇數、週數、倍數）不檢查
    return any(abs(n - a) <= max(0.05 * max(abs(a), 1) if abs(a) < 10 else 0.011 * abs(a), 0.051) for a in allowed)


def validate(items: Any, payload: dict) -> list[dict]:
    """schema 與防幻覺檢查，回傳合格條目（AC12.3）。"""
    if not isinstance(items, list):
        return []
    allowed = allowed_numbers(payload)
    valid = []
    for it in items:
        if not isinstance(it, dict) or not all(isinstance(it.get(k), str) and it[k].strip() for k in REQUIRED):
            continue
        if it["priority"] not in PRIORITIES:
            continue
        evidence = it.get("evidence") if isinstance(it.get("evidence"), list) else []
        ev = [float(x) for x in evidence if isinstance(x, (int, float)) and not isinstance(x, bool)]
        cited, ratios = _split_ratios(it["observation"])
        cited += ev
        ok = cited and all(_supported(n, allowed) for n in cited) and all(_ratio_ok(r, ev) for r in ratios)
        if not ok:
            log.info("捨棄無法驗證數字的建議：%s", it.get("title"))
            continue
        valid.append({k: it[k].strip() for k in REQUIRED} | {"evidence": evidence, "source": "llm"})
    return valid[:MAX_ITEMS]


class GroqGenerator:
    def __init__(self, api_key: str, model: str = "", timeout: float = 20, retries: int = 2,
                 client: httpx.Client | None = None, sleep: Callable[[float], None] = time.sleep):
        self.api_key = api_key
        self.model = model or DEFAULT_MODEL
        self.timeout = timeout
        self.retries = retries
        self.http = client or httpx.Client(timeout=timeout)
        self.sleep = sleep

    @property
    def name(self) -> str:
        return f"groq:{self.model}"

    def generate(self, summary: dict, groups: dict, top: dict) -> list[dict]:
        payload = build_payload(summary, groups, top)
        content = self._call(payload)
        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            raise LLMError("回傳不是合法 JSON") from e
        items = validate(data.get("insights") if isinstance(data, dict) else None, payload)
        if len(items) < MIN_VALID:
            raise LLMError(f"合格建議只有 {len(items)} 條")
        return items

    def _call(self, payload: dict) -> str:
        body = {
            "model": self.model,
            "temperature": 0.3,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
        }
        last = ""
        for i in range(self.retries + 1):
            try:
                r = self.http.post(GROQ_URL, json=body, timeout=self.timeout,
                                   headers={"Authorization": f"Bearer {self.api_key}"})
                if r.status_code == 200:
                    return r.json()["choices"][0]["message"]["content"]
                last = f"HTTP {r.status_code}: {r.text[:200]}"
                if r.status_code not in (429, 500, 502, 503, 504):
                    break
            except httpx.HTTPError as e:
                last = f"{type(e).__name__}"
            if i < self.retries:
                self.sleep(2 ** (i + 1))
        raise LLMError(f"Groq 呼叫失敗：{last}")
