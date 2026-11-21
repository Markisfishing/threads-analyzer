/** analysis_results 的資料形狀（對應 worker/metrics.py、nlp.py、insights.py、llm.py 的輸出）。 */

export type Stat = { mean: number | null; median: number | null; n: number };

export type Overview = {
  post_count: number;
  follower_count: number | null;
  display_name: string | null;
  first_post_at: string | null;
  last_post_at: string | null;
  posts_per_week: number | null;
  outlier_count: number;
  missing_count: number;
  likes: Stat;
  replies: Stat;
  reposts: Stat;
  quotes: Stat;
  engagement: Stat;
  engagement_rate_pct: Stat;
  engagement_excl_outliers: Stat;
};

export type Cell = { count: number; avg_engagement: number | null };

export type Summary = {
  overview: Overview;
  time: {
    timezone: string;
    weekday: ({ weekday: number; label: string } & Cell)[];
    hour: ({ hour: number } & Cell)[];
    heatmap: ({ weekday: number; hour: number } & Cell)[];
    most_posted_weekday: ({ label: string } & Cell) | null;
    most_posted_hour: ({ hour: number } & Cell) | null;
    best_weekday: ({ label: string } & Cell) | null;
    best_hour: ({ hour: number } & Cell) | null;
  };
  length: {
    bins: { label: string; count: number; avg_engagement: number | null }[];
    spearman: number | null;
    points: { post_id: string; char_count: number; engagement: number; is_outlier: boolean }[];
  };
  types: { type: string; count: number; share: number; avg_engagement: number | null }[];
  keywords: { keywords: { term: string; posts: number }[]; hashtags: { tag: string; count: number }[] };
  limitations?: string[];
};

export type TopPost = {
  post_id: string;
  post_url: string;
  published_at: string | null;
  text: string;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  engagement: number | null;
  engagement_rate_pct: number | null;
  post_types: string[] | null;
  group: string | null;
};

export type GroupKey = "high" | "mid" | "low";

export type Group = {
  label: string;
  size: number;
  score_range: [number, number] | null;
  representatives: { post_id: string; post_url: string; text: string; likes: number | null; replies: number | null; score: number }[];
  features: Record<string, number>;
  top_terms: { term: string; score: number }[];
};

export type Groups = {
  method: Record<string, string>;
  skipped: boolean;
  reason?: string;
  thresholds?: { p33: number; p67: number };
  groups?: Record<GroupKey, Group>;
  comparison?: { success_factors: string[]; failure_factors: string[] };
};

export type Insight = {
  title: string;
  observation: string;
  hypothesis: string;
  action: string;
  validation: string;
  priority: "P1" | "P2" | "P3";
  timeline: string;
  evidence?: number[];
  evidence_paths?: string[]; // LLM 建議的數字來源路徑（例如 overview.replies.mean）
  source: "llm" | "rule";
};

export type AnalysisResult = {
  job_id: string;
  summary: Summary;
  top_posts: { sort_by: "engagement_rate" | "engagement"; items: TopPost[] };
  groups: Groups | null;
  insights: Insight[];
  generator: string;
  created_at: string;
};

const nf = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 1 });
const nfInt = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });

export function fmt(n: number | null | undefined, digits: 0 | 1 | 2 = 1): string {
  if (n === null || n === undefined) return "—";
  if (digits === 0) return nfInt.format(n);
  if (digits === 2) return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(n);
  return nf.format(n);
}

/** 大數字縮寫：12,300 → 1.2 萬 */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (Math.abs(n) >= 1e8) return `${nf.format(n / 1e8)} 億`;
  if (Math.abs(n) >= 1e4) return `${nf.format(n / 1e4)} 萬`;
  return nfInt.format(n);
}

export const FEATURE_LABEL: Record<string, string> = {
  avg_chars: "平均字數",
  question_ratio: "提問比例",
  emoji_ratio: "含 emoji",
  hashtag_ratio: "含 hashtag",
  mention_ratio: "含 mention",
  link_ratio: "含連結",
  positive_ratio: "正向語氣",
  negative_ratio: "負向語氣",
  avg_likes: "平均按讚",
  avg_replies: "平均回覆",
};

export function formatFeature(key: string, v: number | undefined): string {
  if (v === undefined) return "—";
  return key.endsWith("_ratio") ? `${Math.round(v * 100)}%` : fmt(v);
}
