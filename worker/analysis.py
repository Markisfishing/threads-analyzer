"""分析階段組裝：指標（F5）→ 三群組 NLP（F6）→ 策略建議（F12，Groq 優先、規則模板 fallback）。"""
from __future__ import annotations

from worker.config import Settings
from worker.insights import rule_based_insights
from worker.llm import GroqGenerator, LLMError
from worker.metrics import compute_summary, top_posts
from worker.nlp import analyze_groups
from worker.pipeline import JobContext

RULE_GENERATOR = "rule_based_v1"


def make_analyzer(settings: Settings, llm: GroqGenerator | None = None):
    if llm is None and settings.groq_api_key:
        llm = GroqGenerator(settings.groq_api_key, settings.groq_model, timeout=settings.llm_timeout_sec)

    def analyze(job: dict, posts: list[dict], meta: dict, ctx: JobContext) -> dict:
        groups = analyze_groups(posts)  # 會就地標記 group_label
        summary = compute_summary(posts, meta)
        top = top_posts(posts)
        summary["limitations"] = limitations(posts, meta, groups)

        insights, generator = None, RULE_GENERATOR
        if llm is not None:
            try:
                insights = llm.generate(summary, groups, top)
                generator = llm.name
            except LLMError as e:
                ctx.log("warn", "llm", f"{e}，改用規則模板")
        else:
            ctx.log("info", "llm", "未設定 GROQ_API_KEY，使用規則模板")
        if insights is None:
            insights = rule_based_insights(summary, groups, top)

        return {"summary": summary, "top_posts": top, "groups": groups, "insights": insights, "generator": generator}

    return analyze


def limitations(posts: list[dict], meta: dict, groups: dict) -> list[str]:
    """報告中的資料限制提示（F7 第 6 點）。"""
    out = ["曝光數僅帳號本人可見，無法取得；互動率以粉絲數為分母。"]
    if len(posts) < 30:
        out.append(f"僅取得 {len(posts)} 篇貼文（目標 30），統計結果可信度較低。")
    if not meta.get("follower_count"):
        out.append("無法取得粉絲數，互動率未計算，Top posts 改依總互動排序。")
    missing = sum(1 for p in posts if p.get("missing_fields"))
    if missing:
        out.append(f"{missing} 篇貼文有欄位缺失，平均值以有效樣本計算。")
    outliers = sum(1 for p in posts if p.get("is_outlier"))
    if outliers:
        out.append(f"{outliers} 篇互動異常高（IQR 法），另提供排除異常值的平均。")
    if groups.get("skipped"):
        out.append(groups["reason"])
    out.append("時段分析使用台北時間（Asia/Taipei）。")
    return out
