"""三群組成敗分析（PRD D2、F6）。

1. 互動分數 score = like + 2 × reply，依 P33 / P67 分為 high / mid / low
2. 每組取 3–5 篇代表貼文（high 取最高、low 取最低、mid 取最接近中位數）
3. 對每組代表貼文套用同一套 NLP：TF-IDF 特徵詞、文字特徵、詞典情緒
4. 比較 high vs low，產出成功／失敗因素敘述
"""
from __future__ import annotations

import math
from collections import Counter
from statistics import mean, median, quantiles

from worker.text import keywords, sentiment

MIN_POSTS_FOR_GROUPS = 9
REP_MAX, REP_MIN = 5, 3
GROUP_LABEL = {"high": "高互動", "mid": "中互動", "low": "低互動"}


def assign_groups(posts: list[dict]) -> dict | None:
    """就地設定 group_label；樣本不足或分數全相同時回傳 None 並說明原因（AC6.2、AC6.3）。"""
    scored = [p for p in posts if p.get("score") is not None]
    if len(scored) < MIN_POSTS_FOR_GROUPS:
        return {"skipped": True, "reason": f"樣本不足 {MIN_POSTS_FOR_GROUPS} 篇（目前 {len(scored)} 篇），未進行群組分析"}
    scores = [p["score"] for p in scored]
    if len(set(scores)) == 1:
        return {"skipped": True, "reason": "所有貼文互動分數相同，無法分組"}
    p33, p67 = _tertiles(scores)
    for p in scored:
        p["group_label"] = "high" if p["score"] > p67 else "low" if p["score"] <= p33 else "mid"
    # 分界值剛好使某組為空（大量同分）時，改用排序後均分
    if any(not [p for p in scored if p["group_label"] == g] for g in ("high", "mid", "low")):
        ordered = sorted(scored, key=lambda p: p["score"])
        n = len(ordered)
        for i, p in enumerate(ordered):
            p["group_label"] = "low" if i < n / 3 else "mid" if i < 2 * n / 3 else "high"
    return {"skipped": False, "p33": p33, "p67": p67}


def _tertiles(values: list[float]) -> tuple[float, float]:
    qs = quantiles(values, n=3, method="inclusive")
    return round(qs[0], 2), round(qs[1], 2)


def representatives(posts: list[dict], group: str) -> list[dict]:
    members = [p for p in posts if p.get("group_label") == group]
    if group == "high":
        ordered = sorted(members, key=lambda p: p["score"], reverse=True)
    elif group == "low":
        ordered = sorted(members, key=lambda p: p["score"])
    else:
        mid = median(p["score"] for p in members) if members else 0
        ordered = sorted(members, key=lambda p: abs(p["score"] - mid))
    return ordered[:REP_MAX]


def tfidf_top_terms(corpus: list[list[str]], doc_ids: list[int], top: int = 10) -> list[dict]:
    """以全帳號貼文為語料計算 IDF，回傳指定文件的平均 TF-IDF 最高詞。"""
    n = len(corpus)
    df = Counter(t for doc in corpus for t in set(doc))
    idf = {t: math.log((1 + n) / (1 + c)) + 1 for t, c in df.items()}
    scores: Counter[str] = Counter()
    for i in doc_ids:
        doc = corpus[i]
        if not doc:
            continue
        tf = Counter(doc)
        norm = math.sqrt(sum((tf[t] / len(doc) * idf[t]) ** 2 for t in tf)) or 1
        for t, c in tf.items():
            scores[t] += (c / len(doc) * idf[t]) / norm
    k = max(len(doc_ids), 1)
    return [{"term": t, "score": round(s / k, 4)} for t, s in sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))[:top]]


def features(posts: list[dict]) -> dict:
    """同一套文字特徵（數值皆為比例或平均，方便組間比較）。"""
    if not posts:
        return {}
    n = len(posts)
    sents = [sentiment(p.get("text") or "") for p in posts]
    return {
        "avg_chars": round(mean(p.get("char_count") or 0 for p in posts), 1),
        "question_ratio": round(sum(1 for p in posts if "?" in (p.get("text") or "") or "？" in (p.get("text") or "")) / n, 2),
        "emoji_ratio": round(sum(1 for p in posts if (p.get("emoji_count") or 0) > 0) / n, 2),
        "hashtag_ratio": round(sum(1 for p in posts if (p.get("hashtag_count") or 0) > 0) / n, 2),
        "mention_ratio": round(sum(1 for p in posts if (p.get("mention_count") or 0) > 0) / n, 2),
        "link_ratio": round(sum(1 for p in posts if (p.get("url_count") or 0) > 0) / n, 2),
        "positive_ratio": round(sum(1 for s in sents if s > 0) / n, 2),
        "negative_ratio": round(sum(1 for s in sents if s < 0) / n, 2),
        "avg_likes": round(mean(p.get("likes") or 0 for p in posts), 1),
        "avg_replies": round(mean(p.get("replies") or 0 for p in posts), 1),
    }


FEATURE_RULES = [
    # (特徵, 門檻差, 高組較多時的敘述, 低組較多時的敘述)
    ("question_ratio", 0.2, "以提問形式發文的比例較高（{h:.0%} vs {l:.0%}），可能較容易引發回覆",
     "低互動組提問比例反而較高（{l:.0%} vs {h:.0%}），提問未必帶來互動"),
    ("emoji_ratio", 0.2, "較常使用 emoji（{h:.0%} vs {l:.0%}）", "低互動組較常使用 emoji（{l:.0%} vs {h:.0%}）"),
    ("link_ratio", 0.2, "含連結比例較高（{h:.0%} vs {l:.0%}）",
     "低互動組含連結比例較高（{l:.0%} vs {h:.0%}），外連可能分散注意力"),
    ("hashtag_ratio", 0.2, "較常使用 hashtag（{h:.0%} vs {l:.0%}）", "低互動組較常使用 hashtag（{l:.0%} vs {h:.0%}）"),
    ("mention_ratio", 0.2, "較常提及其他帳號（{h:.0%} vs {l:.0%}）", "低互動組較常提及其他帳號（{l:.0%} vs {h:.0%}）"),
    ("positive_ratio", 0.2, "正向語氣比例較高（{h:.0%} vs {l:.0%}）", "低互動組正向語氣比例較高（{l:.0%} vs {h:.0%}）"),
    ("negative_ratio", 0.2, "負向／抱怨語氣比例較高（{h:.0%} vs {l:.0%}）", "低互動組負向語氣比例較高（{l:.0%} vs {h:.0%}）"),
]


def compare(high: dict, low: dict, high_terms: list[dict], low_terms: list[dict]) -> dict:
    success, failure = [], []
    for key, gap, more_in_high, more_in_low in FEATURE_RULES:
        h, l = high.get(key, 0), low.get(key, 0)
        if h - l >= gap:
            success.append(more_in_high.format(h=h, l=l))
        elif l - h >= gap:
            failure.append(more_in_low.format(h=h, l=l))
    hc, lc = high.get("avg_chars", 0), low.get("avg_chars", 0)
    if hc and lc:
        if hc >= lc * 1.5:
            success.append(f"文字較長（平均 {hc:.0f} 字 vs {lc:.0f} 字），完整敘述可能更能引起共鳴")
        elif lc >= hc * 1.5:
            success.append(f"文字較精簡（平均 {hc:.0f} 字 vs {lc:.0f} 字）")
            failure.append(f"低互動貼文偏長（平均 {lc:.0f} 字），可能降低閱讀完成率")
    ht = [t["term"] for t in high_terms[:5]]
    lt = [t["term"] for t in low_terms[:5]]
    if ht:
        success.append("高互動貼文的特徵詞：" + "、".join(ht))
    if lt:
        failure.append("低互動貼文的特徵詞：" + "、".join(lt))
    return {"success_factors": success, "failure_factors": failure}


def analyze_groups(posts: list[dict]) -> dict:
    """主函式：分組 → 代表貼文 → 一致的 NLP → 比較。posts 會被就地標記 group_label。"""
    info = assign_groups(posts)
    if info is None or info["skipped"]:
        return {"method": _method(), **(info or {})}

    corpus = [keywords(p.get("text") or "") for p in posts]
    index = {id(p): i for i, p in enumerate(posts)}
    groups = {}
    for g in ("high", "mid", "low"):
        reps = representatives(posts, g)
        members = [p for p in posts if p.get("group_label") == g]
        groups[g] = {
            "label": GROUP_LABEL[g],
            "size": len(members),
            "score_range": [min(p["score"] for p in members), max(p["score"] for p in members)] if members else None,
            "representatives": [
                {"post_id": p["post_id"], "post_url": p["post_url"], "text": (p.get("text") or "")[:200],
                 "likes": p.get("likes"), "replies": p.get("replies"), "score": p["score"]}
                for p in reps
            ],
            "features": features(reps),
            "top_terms": tfidf_top_terms(corpus, [index[id(p)] for p in reps]),
        }
    return {
        "method": _method(),
        "skipped": False,
        "thresholds": {"p33": info["p33"], "p67": info["p67"]},
        "groups": groups,
        "comparison": compare(groups["high"]["features"], groups["low"]["features"],
                              groups["high"]["top_terms"], groups["low"]["top_terms"]),
    }


def _method() -> dict:
    return {
        "score": "like + 2 × reply",
        "grouping": "三分位數（P33 / P67）",
        "representatives": f"每組 {REP_MIN}–{REP_MAX} 篇：high 取最高、low 取最低、mid 取最接近中位數",
        "nlp": "jieba 斷詞 + TF-IDF 特徵詞（全帳號為語料）、文字特徵比例、詞典法情緒",
    }
