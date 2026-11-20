"""指標、三群組 NLP、規則建議、Groq 生成器測試（AC4.3、AC5.1–5.2、AC6.1–6.3、AC7.2、AC12.1–12.3）。"""
from __future__ import annotations

import json
from statistics import mean, median

import httpx
import pytest

from tests.worker.fakes import MemoryStore
from tests.worker.sample import JOB, META, cleaned
from worker.analysis import RULE_GENERATOR, make_analyzer
from worker.config import load_settings
from worker.insights import rule_based_insights
from worker.llm import GroqGenerator, LLMError, build_payload, validate
from worker.metrics import compute_summary, spearman, time_distribution, top_posts
from worker.nlp import analyze_groups
from worker.pipeline import JobContext


# ------------------------------------------------------------------ metrics

def test_overview_matches_manual_calculation():
    """AC5.1：平均與中位數與手算一致。"""
    posts = cleaned()
    ov = compute_summary(posts, META)["overview"]
    likes = [p["likes"] for p in posts]
    assert ov["likes"]["mean"] == round(mean(likes), 2)
    assert ov["likes"]["median"] == round(median(likes), 2)
    assert ov["likes"]["n"] == 30 and ov["post_count"] == 30


def test_overview_ignores_nulls():
    posts = cleaned(10)
    posts[0]["likes"] = None
    ov = compute_summary(posts, META)["overview"]
    assert ov["likes"]["n"] == 9


def test_timezone_taipei():
    """AC4.3：UTC 2026-11-20T01:30Z → 台北週五 09 時。"""
    t = time_distribution([{"published_at": "2026-11-20T01:30:00+00:00", "engagement": 5}])
    fri = t["weekday"][4]
    assert fri["label"] == "週五" and fri["count"] == 1
    assert t["hour"][9]["count"] == 1


def test_top_posts_sorted_by_rate_and_fallback():
    """AC5.2"""
    posts = cleaned()
    top = top_posts(posts)
    rates = [p["engagement_rate_pct"] for p in top["items"]]
    assert top["sort_by"] == "engagement_rate" and len(rates) == 5 and rates == sorted(rates, reverse=True)
    for p in posts:
        p["engagement_rate"] = None
    assert top_posts(posts)["sort_by"] == "engagement"


def test_spearman():
    assert spearman([1, 2, 3, 4], [10, 20, 30, 40]) == 1.0
    assert spearman([1, 2, 3, 4], [40, 30, 20, 10]) == -1.0
    assert spearman([1, 1, 1], [1, 2, 3]) is None


def test_summary_has_required_sections():
    s = compute_summary(cleaned(), META)
    assert {"overview", "time", "length", "types", "keywords"} <= set(s)
    assert len(s["length"]["bins"]) == 4
    assert {t["type"] for t in s["types"]} == {"純文字", "含連結", "含 hashtag", "含 mention"}
    assert s["keywords"]["keywords"] and s["keywords"]["hashtags"][0]["tag"] in {"產品", "上線"}


# ------------------------------------------------------------------ groups / NLP

def test_groups_split_into_three_with_consistent_features():
    """AC6.1：30 篇分三組，各組 3–5 篇代表貼文，特徵欄位一致。"""
    posts = cleaned()
    g = analyze_groups(posts)
    assert not g["skipped"]
    sizes = [g["groups"][k]["size"] for k in ("high", "mid", "low")]
    assert sum(sizes) == 30 and all(8 <= s <= 12 for s in sizes)
    keys = None
    for k in ("high", "mid", "low"):
        grp = g["groups"][k]
        assert 3 <= len(grp["representatives"]) <= 5
        assert keys is None or set(grp["features"]) == keys
        keys = set(grp["features"])
    assert all(p["group_label"] in ("high", "mid", "low") for p in posts)
    # 樣本設計中提問貼文互動較高，應被偵測為成功因素
    assert any("提問" in s for s in g["comparison"]["success_factors"])


def test_groups_skipped_when_too_few():
    """AC6.2"""
    g = analyze_groups(cleaned(8))
    assert g["skipped"] and "樣本不足 9 篇" in g["reason"]


def test_groups_skipped_when_scores_equal():
    """AC6.3"""
    posts = cleaned(12)
    for p in posts:
        p["score"] = 10
    g = analyze_groups(posts)
    assert g["skipped"] and "相同" in g["reason"]


# ------------------------------------------------------------------ rule insights

def _inputs():
    posts = cleaned()
    groups = analyze_groups(posts)
    return compute_summary(posts, META), groups, top_posts(posts)


def test_rule_insights_at_least_three_with_fields():
    """AC7.1/AC7.2：≥ 3 點，每點含數據依據、推測、建議、驗證方法。"""
    summary, groups, top = _inputs()
    items = rule_based_insights(summary, groups, top)
    assert 3 <= len(items) <= 5
    for it in items:
        for k in ("observation", "hypothesis", "action", "validation", "priority", "timeline"):
            assert it[k]
        assert it["priority"] in ("P1", "P2", "P3")
    assert items == sorted(items, key=lambda i: i["priority"])


def test_rule_insight_numbers_traceable():
    """AC7.2：觀察中的數字可在資料中找到（以 LLM 的防幻覺檢查驗證）。"""
    summary, groups, top = _inputs()
    payload = build_payload(summary, groups, top)
    items = rule_based_insights(summary, groups, top)
    as_llm = [{**i, "priority": i["priority"]} for i in items]
    assert len(validate(as_llm, payload)) == len(items)


# ------------------------------------------------------------------ Groq

def groq_client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def llm_response(items):
    return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"insights": items})}}]})


def good_items(summary):
    ov = summary["overview"]
    base = {"hypothesis": "推測", "action": "行動", "validation": "驗證", "priority": "P1", "timeline": "2 週"}
    return [
        {**base, "title": "平均按讚", "observation": f"平均按讚 {ov['likes']['mean']}", "evidence": [ov["likes"]["mean"]]},
        {**base, "title": "平均回覆", "observation": f"平均回覆 {ov['replies']['mean']}", "evidence": [ov["replies"]["mean"]]},
        {**base, "title": "粉絲", "observation": f"粉絲 {ov['follower_count']:,} 人", "evidence": [ov["follower_count"]]},
    ]


def test_groq_success():
    """AC12.1"""
    summary, groups, top = _inputs()
    seen = {}

    def handler(req):
        seen["auth"] = req.headers["authorization"]
        seen["body"] = json.loads(req.content)
        return llm_response(good_items(summary))

    gen = GroqGenerator("k", "m", client=groq_client(handler), sleep=lambda s: None)
    items = gen.generate(summary, groups, top)
    assert len(items) == 3 and all(i["source"] == "llm" for i in items)
    assert seen["auth"] == "Bearer k" and seen["body"]["response_format"] == {"type": "json_object"}
    assert gen.name == "groq:m"


def test_groq_discards_hallucinated_numbers():
    """AC12.3：引用不存在數字的條目被捨棄。"""
    summary, groups, top = _inputs()
    items = good_items(summary) + [{**good_items(summary)[0], "title": "假的", "observation": "平均按讚 98765.4",
                                    "evidence": [98765.4]}]
    payload = build_payload(summary, groups, top)
    titles = [i["title"] for i in validate(items, payload)]
    assert "假的" not in titles and len(titles) == 3


def test_groq_server_error_retries_then_raises():
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(500, text="boom")

    summary, groups, top = _inputs()
    gen = GroqGenerator("k", client=groq_client(handler), sleep=lambda s: None)
    with pytest.raises(LLMError):
        gen.generate(summary, groups, top)
    assert len(calls) == 3


def test_analyzer_falls_back_to_rules_on_llm_failure():
    """AC12.2：Groq 失敗 → 規則模板，任務仍可完成。"""
    gen = GroqGenerator("bad", client=groq_client(lambda r: httpx.Response(401, text="invalid key")),
                        sleep=lambda s: None)
    analyze = make_analyzer(load_settings(env_file=None), llm=gen)
    store = MemoryStore()
    job = store.claim_job(store.add_job(**{k: v for k, v in JOB.items() if k != "id"})["id"])
    row = analyze(job, cleaned(), META, JobContext(store, job))
    assert row["generator"] == RULE_GENERATOR
    assert len(row["insights"]) >= 3
    assert any(step == "llm" and level == "warn" for (_, level, step, _) in store.logs)
    assert row["summary"]["limitations"]
