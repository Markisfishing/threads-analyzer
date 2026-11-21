"""離線報告：讀取貼文 JSON 檔 → 清理 → 分析 → 輸出 Markdown 報告、CSV、JSON。

不需要 Supabase，用於 data/ 範例資料與 reports/ 範例報告，也可分析自行匯出的資料。

輸入格式：
    {"account": {"username": "...", "display_name": "...", "follower_count": 123},
     "posts": [{"post_id", "post_url", "published_at", "text", "likes", "replies", "reposts", "quotes"}, ...]}
"""
from __future__ import annotations

import csv
import io
import json
from pathlib import Path

from worker.analysis import RULE_GENERATOR, limitations
from worker.cleaning import clean_posts
from worker.insights import rule_based_insights
from worker.metrics import compute_summary, to_taipei, top_posts
from worker.nlp import analyze_groups

CSV_COLUMNS = [
    "post_id", "post_url", "published_at", "text", "likes", "replies", "reposts", "quotes",
    "engagement", "engagement_rate", "score", "group_label", "char_count", "hashtag_count",
    "mention_count", "url_count", "post_types", "is_outlier", "missing_fields",
]


def load_input(path: Path) -> tuple[dict, list[dict]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    account = data.get("account") or {}
    if not account.get("username"):
        raise ValueError("輸入檔缺少 account.username")
    posts = data.get("posts")
    if not isinstance(posts, list) or not posts:
        raise ValueError("輸入檔缺少 posts 陣列")
    return account, posts


def analyze_file(path: Path, llm=None) -> dict:
    """回傳與 Worker 寫入 analysis_results 相同結構的結果，另附清理後的貼文。"""
    account, raw = load_input(path)
    meta = {"follower_count": account.get("follower_count"), "display_name": account.get("display_name")}
    job = {"id": "offline", "user_id": "offline", "target_username": account["username"], "max_posts": len(raw)}
    rows = [{**p, "job_id": job["id"], "user_id": job["user_id"]} for p in raw]
    posts = clean_posts(job, rows, meta)
    groups = analyze_groups(posts)
    summary = compute_summary(posts, meta)
    top = top_posts(posts)
    summary["limitations"] = limitations(posts, meta, groups)

    insights, generator = None, RULE_GENERATOR
    if llm is not None:
        try:
            insights = llm.generate(summary, groups, top)
            generator = llm.name
        except Exception:  # noqa: BLE001 - LLM 失敗一律改用規則模板
            insights = None
    if insights is None:
        insights = rule_based_insights(summary, groups, top)
    return {"account": account, "summary": summary, "top_posts": top, "groups": groups,
            "insights": insights, "generator": generator, "posts": posts}


def _cell(v):
    if isinstance(v, list):
        return "|".join(str(x) for x in v)
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@"):
        return "'" + v  # 避免 Excel 公式注入
    return "" if v is None else v


def posts_csv(posts: list[dict]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(CSV_COLUMNS)
    for p in posts:
        w.writerow([_cell(p.get(c)) for c in CSV_COLUMNS])
    return "﻿" + buf.getvalue()


def _n(x, nd: int = 1) -> str:
    if x is None:
        return "—"
    if isinstance(x, float):
        return f"{x:,.{nd}f}".rstrip("0").rstrip(".")
    return f"{x:,}"


def _one_line(text: str | None, limit: int = 40) -> str:
    t = " ".join((text or "").split()).replace("|", "／")
    return t if len(t) <= limit else t[:limit] + "…"


def _bar_chart(title: str, labels: list[str], values: list[float | None], y_label: str) -> list[str]:
    """Mermaid 長條圖（GitHub、VS Code 可直接顯示），下方附數值表供不支援的檢視器閱讀。"""
    q = ", ".join(f'"{lbl}"' for lbl in labels)
    v = ", ".join(_n(round(x or 0, 1)).replace(",", "") for x in values)
    return [
        "```mermaid",
        "xychart-beta",
        f'    title "{title}"',
        f"    x-axis [{q}]",
        f'    y-axis "{y_label}"',
        f"    bar [{v}]",
        "```",
        "",
        "| " + " | ".join(labels) + " |",
        "|" + "---|" * len(labels),
        "| " + " | ".join(_n(x) for x in values) + " |",
        "",
    ]


def render_markdown(result: dict, source_name: str) -> str:
    a, s, top, g = result["account"], result["summary"], result["top_posts"], result["groups"]
    o, t = s["overview"], s["time"]
    first, last = to_taipei(o.get("first_post_at")), to_taipei(o.get("last_post_at"))
    span = f"{first:%Y-%m-%d} ～ {last:%Y-%m-%d}" if first and last else "—"
    out = [
        f"# @{a['username']} 貼文互動分析報告",
        "",
        f"- 資料來源：`{source_name}`",
        f"- 樣本：{o['post_count']} 篇（{span}，Asia/Taipei）",
        f"- 建議來源：{'Groq LLM' if result['generator'] != RULE_GENERATOR else '規則模板'}",
        "",
        "## 總覽指標",
        "",
        "| 指標 | 平均 | 中位數 |",
        "|---|---|---|",
    ]
    for key, label in [("likes", "讚"), ("replies", "留言"), ("reposts", "轉發"), ("quotes", "引用"),
                       ("engagement", "互動"), ("engagement_rate_pct", "互動率（%）"),
                       ("engagement_excl_outliers", "互動（排除異常值）")]:
        out.append(f"| {label} | {_n(o[key]['mean'])} | {_n(o[key]['median'])} |")
    out += [
        "",
        f"粉絲數 {_n(o.get('follower_count'))}；每週約 {_n(o.get('posts_per_week'))} 篇；"
        f"異常值 {o.get('outlier_count', 0)} 篇；欄位缺失 {o.get('missing_count', 0)} 篇。",
        "",
        f"## Top {len(top['items'])} 貼文（依{'互動率' if top['sort_by'] == 'engagement_rate' else '互動'}）",
        "",
        "| # | 時間 | 內容 | 讚 | 留言 | 轉發+引用 | 互動率 |",
        "|---|---|---|---|---|---|---|",
    ]
    for i, p in enumerate(top["items"], 1):
        ts = to_taipei(p.get("published_at"))
        rate = f"{_n(p.get('engagement_rate_pct'), 2)}%" if p.get("engagement_rate_pct") is not None else "—"
        out.append(
            f"| {i} | {ts:%m-%d %H:%M} | [{_one_line(p.get('text'))}]({p['post_url']}) | {_n(p.get('likes'))} "
            f"| {_n(p.get('replies'))} | {_n((p.get('reposts') or 0) + (p.get('quotes') or 0))} | {rate} |"
        )
    out += ["", "## 圖表", ""]
    out += _bar_chart("各星期平均互動", [d["label"] for d in t["weekday"]],
                      [d["avg_engagement"] for d in t["weekday"]], "平均互動")
    out += _bar_chart("貼文類型平均互動", [d["type"] for d in s["types"]],
                      [d["avg_engagement"] for d in s["types"]], "平均互動")
    out += _bar_chart("文字長度與平均互動", [b["label"] for b in s["length"]["bins"]],
                      [b["avg_engagement"] for b in s["length"]["bins"]], "平均互動")
    out += [
        f"- 發文最多：{t['most_posted_weekday']['label']}、{t['most_posted_hour']['hour']} 時；"
        f"平均互動最高：{t['best_weekday']['label']}、{t['best_hour']['hour']} 時。",
        f"- 字數與互動的 Spearman 相關係數：{_n(s['length'].get('spearman'), 2)}。",
        "- 常見關鍵字：" + "、".join(f"{k['term']}（{k['posts']}）" for k in s["keywords"]["keywords"][:10]),
        "- 常見 hashtag：" + ("、".join(f"#{h['tag']}（{h['count']}）" for h in s["keywords"]["hashtags"][:10]) or "無"),
        "",
        "## 三群組成敗分析",
        "",
    ]
    if g.get("skipped"):
        out += [g.get("reason", "樣本不足，未分組。"), ""]
    else:
        m = g["method"]
        out += [f"分數：{m['score']}；分組：{m['grouping']}；代表貼文：{m['representatives']}；方法：{m['nlp']}。", ""]
        for key in ("high", "mid", "low"):
            grp = g["groups"][key]
            lo, hi = grp["score_range"]
            out.append(f"**{grp['label']}**（{grp['size']} 篇，分數 {_n(lo)}–{_n(hi)}）")
            out += [f"- {_one_line(r['text'], 50)}（讚 {_n(r['likes'])}、留言 {_n(r['replies'])}）"
                    for r in grp["representatives"]]
            out.append("")
        out += ["成功因素：", *[f"- {x}" for x in g["comparison"]["success_factors"]], "",
                "失敗因素：", *[f"- {x}" for x in g["comparison"]["failure_factors"]], ""]
    out += ["## 內容策略觀察與建議", ""]
    for i, ins in enumerate(result["insights"], 1):
        out += [
            f"### {i}. {ins['title']}（{ins.get('priority', '—')}，{ins.get('timeline', '—')}）",
            "",
            f"- **觀察**：{ins['observation']}",
            f"- **推測**：{ins['hypothesis']}",
            f"- **建議**：{ins['action']}",
            f"- **驗證**：{ins['validation']}",
            "",
        ]
    out += ["## 資料限制", "", *[f"- {x}" for x in s["limitations"]], ""]
    return "\n".join(out)


def write_report(input_path: Path, out_dir: Path, llm=None) -> list[Path]:
    result = analyze_file(input_path, llm)
    out_dir.mkdir(parents=True, exist_ok=True)
    md = out_dir / "report.md"
    csv_path = out_dir / "posts.csv"
    js = out_dir / "analysis.json"
    md.write_text(render_markdown(result, input_path.as_posix()), encoding="utf-8", newline="\n")
    csv_path.write_text(posts_csv(result["posts"]), encoding="utf-8", newline="")
    export = {k: result[k] for k in ("account", "summary", "top_posts", "groups", "insights", "generator")}
    export["posts"] = [{c: p.get(c) for c in CSV_COLUMNS} for p in result["posts"]]
    js.write_text(json.dumps(export, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8", newline="\n")
    return [md, csv_path, js]
