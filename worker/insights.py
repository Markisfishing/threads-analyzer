"""規則模板策略建議（PRD F7 觀察、F12 fallback）。

每條建議含：observation（數據依據）、hypothesis（推測）、action（建議）、validation（驗證方法）、
priority（P1–P3）、timeline（執行時程）、evidence（引用的數字，供防幻覺檢查與前端顯示）。
"""
from __future__ import annotations

from typing import Callable

Insight = dict
Rule = Callable[[dict, dict, dict], "Insight | None"]


def _fmt(x: float | None, nd: int = 1) -> str:
    return "—" if x is None else f"{x:,.{nd}f}"


def rule_best_time(summary: dict, groups: dict, top: dict) -> Insight | None:
    t = summary["time"]
    best_wd, best_hr = t.get("best_weekday"), t.get("best_hour")
    overall = summary["overview"]["engagement"]["mean"]
    if not overall or not (best_wd or best_hr):
        return None
    pick = best_hr if best_hr and (not best_wd or best_hr["avg_engagement"] >= best_wd["avg_engagement"]) else best_wd
    label = f"{pick['hour']:02d}:00 時段" if "hour" in pick else pick["label"]
    lift = pick["avg_engagement"] / overall
    if lift < 1.2:
        return None
    return {
        "title": f"{label}發文的平均互動最高",
        "observation": f"{label}發文 {pick['count']} 篇，平均互動 {_fmt(pick['avg_engagement'])}，"
                       f"是整體平均 {_fmt(overall)} 的 {lift:.1f} 倍（台北時間）。",
        "hypothesis": "此時段目標受眾較活躍；但樣本數少，也可能受個別爆文影響。",
        "action": f"接下來兩週把重要貼文集中在{label}發布。",
        "validation": f"兩週後比較{label}與其他時段的平均互動，差距仍 ≥ 1.2 倍才維持排程。",
        "priority": "P1" if lift >= 1.5 else "P2",
        "timeline": "2 週",
        "evidence": [pick["avg_engagement"], overall],
        "effect": lift,
    }


def rule_length(summary: dict, groups: dict, top: dict) -> Insight | None:
    bins = [b for b in summary["length"]["bins"] if b["count"] >= 3 and b["avg_engagement"] is not None]
    if len(bins) < 2:
        return None
    best = max(bins, key=lambda b: b["avg_engagement"])
    worst = min(bins, key=lambda b: b["avg_engagement"])
    if worst["avg_engagement"] <= 0:
        return None
    lift = best["avg_engagement"] / worst["avg_engagement"]
    if lift < 1.3:
        return None
    rho = summary["length"].get("spearman")
    return {
        "title": f"{best['label']}的貼文互動較好",
        "observation": f"{best['label']}貼文 {best['count']} 篇平均互動 {_fmt(best['avg_engagement'])}，"
                       f"{worst['label']} {worst['count']} 篇僅 {_fmt(worst['avg_engagement'])}"
                       + (f"；字數與互動的 Spearman 相關係數為 {rho}。" if rho is not None else "。"),
        "hypothesis": "此長度較符合受眾的閱讀習慣；也可能是內容主題差異造成，非長度本身。",
        "action": f"新貼文以{best['label']}為主要篇幅。",
        "validation": "連續 10 篇控制主題相近、只改變長度，比較兩種長度的平均互動。",
        "priority": "P2",
        "timeline": "3 週",
        "evidence": [best["avg_engagement"], worst["avg_engagement"]],
        "effect": lift,
    }


def rule_types(summary: dict, groups: dict, top: dict) -> Insight | None:
    types = {t["type"]: t for t in summary["types"]}
    plain = types.get("純文字")
    cands = [t for t in summary["types"] if t["type"] != "純文字" and t["count"] >= 3 and t["avg_engagement"] is not None]
    if not plain or plain["count"] < 3 or not plain["avg_engagement"] or not cands:
        return None
    best = max(cands, key=lambda t: abs(t["avg_engagement"] / plain["avg_engagement"] - 1))
    ratio = best["avg_engagement"] / plain["avg_engagement"]
    if abs(ratio - 1) < 0.3:
        return None
    better = ratio > 1
    return {
        "title": f"{best['type']}的貼文互動{'較高' if better else '較低'}",
        "observation": f"{best['type']}貼文 {best['count']} 篇平均互動 {_fmt(best['avg_engagement'])}，"
                       f"純文字貼文 {plain['count']} 篇為 {_fmt(plain['avg_engagement'])}（{ratio:.1f} 倍）。",
        "hypothesis": ("此形式提供更多脈絡或觸及，受眾較願意互動。" if better
                       else "此形式可能讓讀者離開平台或顯得像廣告，降低互動意願。"),
        "action": (f"適度增加{best['type']}的貼文比例。" if better else f"減少{best['type']}的貼文，或把重點直接寫在內文。"),
        "validation": "下 10 篇中一半採用此形式，比較兩組平均互動與回覆數。",
        "priority": "P2",
        "timeline": "2 週",
        "evidence": [best["avg_engagement"], plain["avg_engagement"]],
        "effect": max(ratio, 1 / ratio) if ratio else 1,
    }


def rule_questions(summary: dict, groups: dict, top: dict) -> Insight | None:
    if not groups or groups.get("skipped"):
        return None
    hi = groups["groups"]["high"]["features"]
    lo = groups["groups"]["low"]["features"]
    h, l = hi.get("question_ratio", 0), lo.get("question_ratio", 0)
    if h - l < 0.2:
        return None
    return {
        "title": "以提問結尾的貼文更容易引發回覆",
        "observation": f"高互動代表貼文的提問比例 {h:.0%}，低互動代表貼文為 {l:.0%}；"
                       f"高互動組平均回覆 {_fmt(hi.get('avg_replies'))}，低互動組 {_fmt(lo.get('avg_replies'))}。",
        "hypothesis": "提問降低回覆門檻，讓讀者有明確的回應方向。",
        "action": "每週至少 3 篇貼文以開放式問題結尾。",
        "validation": "比較有提問與無提問貼文的平均回覆數，持續 3 週。",
        "priority": "P1",
        "timeline": "3 週",
        "evidence": [hi.get("avg_replies"), lo.get("avg_replies")],
        "effect": 1 + (h - l) * 2,
    }


def rule_group_terms(summary: dict, groups: dict, top: dict) -> Insight | None:
    if not groups or groups.get("skipped"):
        return None
    hi = groups["groups"]["high"]
    terms = [t["term"] for t in hi["top_terms"][:5]]
    if not terms:
        return None
    lo = groups["groups"]["low"]
    return {
        "title": "高互動貼文集中在特定主題",
        "observation": f"高互動組（{hi['size']} 篇，分數 {hi['score_range'][0]}–{hi['score_range'][1]}）的特徵詞為"
                       f"「{'、'.join(terms)}」；低互動組（{lo['size']} 篇）分數僅 {lo['score_range'][0]}–{lo['score_range'][1]}。",
        "hypothesis": "這些主題與受眾興趣較契合；但特徵詞樣本少，需更多貼文確認。",
        "action": f"規劃一系列圍繞「{terms[0]}」的貼文。",
        "validation": "發布 5 篇相關主題貼文，檢查是否有 ≥ 3 篇落入高互動組。",
        "priority": "P2",
        "timeline": "4 週",
        "evidence": hi["score_range"] + lo["score_range"],
        "effect": 1.2,
    }


def rule_frequency(summary: dict, groups: dict, top: dict) -> Insight | None:
    ov = summary["overview"]
    ppw = ov.get("posts_per_week")
    if ppw is None:
        return None
    return {
        "title": "建立穩定的發文節奏並追蹤成效",
        "observation": f"分析期間平均每週發文 {ppw} 篇，共 {ov['post_count']} 篇，"
                       f"平均互動 {_fmt(ov['engagement']['mean'])}、中位數 {_fmt(ov['engagement']['median'])}。",
        "hypothesis": "平均數明顯高於中位數代表少數爆文拉高整體表現，穩定產出比追求單篇爆紅更可預期。",
        "action": f"維持每週約 {max(1, round(ppw))} 篇，並每週檢視互動中位數。",
        "validation": "以互動中位數為主要指標，連續 4 週追蹤是否穩定或上升。",
        "priority": "P3",
        "timeline": "4 週",
        "evidence": [ppw, ov["engagement"]["mean"], ov["engagement"]["median"]],
        "effect": 1.0,
    }


def rule_top_post(summary: dict, groups: dict, top: dict) -> Insight | None:
    items = (top or {}).get("items") or []
    overall = summary["overview"]["engagement"]["mean"]
    if not items or not overall or items[0].get("engagement") is None:
        return None
    t = items[0]
    lift = t["engagement"] / overall
    return {
        "title": "拆解最高互動貼文的寫法並複製",
        "observation": f"互動最高的貼文總互動 {_fmt(t['engagement'], 0)}，是整體平均 {_fmt(overall)} 的 {lift:.1f} 倍"
                       f"（按讚 {_fmt(t.get('likes'), 0)}、回覆 {_fmt(t.get('replies'), 0)}）。",
        "hypothesis": "這篇的主題、開頭或形式特別吸引受眾；單篇結果可能有偶然性。",
        "action": "以相同主題或結構再發 2–3 篇變化版本。",
        "validation": "比較變化版本與帳號平均互動，至少 2 篇高於平均才視為可複製。",
        "priority": "P3",
        "timeline": "2 週",
        "evidence": [t["engagement"], overall],
        "effect": lift,
    }


RULES: list[Rule] = [rule_best_time, rule_questions, rule_types, rule_length, rule_group_terms,
                     rule_top_post, rule_frequency]


def rule_based_insights(summary: dict, groups: dict, top: dict, max_items: int = 5) -> list[Insight]:
    """產生最多 5 條建議，依優先級與效果大小排序（資料足夠時至少 3 條）。"""
    found = [i for r in RULES if (i := r(summary, groups, top))]
    found.sort(key=lambda i: (i["priority"], -i.get("effect", 1)))
    out = found[:max_items]
    for i in out:
        i.pop("effect", None)
        i["source"] = "rule"
    return out
