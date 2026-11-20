/** 多帳號比較（PRD F9、AC9.1）。純函式。 */
import type { Summary } from "./report";

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 勾選數量的提示文字；可比較時回傳 null。 */
export function selectionHint(count: number): string | null {
  if (count < COMPARE_MIN) return `請勾選 ${COMPARE_MIN}–${COMPARE_MAX} 個已完成的分析（目前 ${count} 個）`;
  if (count > COMPARE_MAX) return `最多比較 ${COMPARE_MAX} 個分析（目前 ${count} 個）`;
  return null;
}

/** 解析 ?ids=a,b,c：去重、驗證 UUID、保留勾選順序。 */
export function parseCompareIds(raw: string | string[] | undefined): { ids: string[]; error: string | null } {
  const joined = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const ids = [...new Set(joined.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (ids.some((id) => !UUID_RE.test(id))) return { ids: [], error: "比較網址格式錯誤" };
  return { ids, error: selectionHint(ids.length) };
}

export type CompareEntry = {
  jobId: string;
  username: string;
  createdAt: string;
  status: string;
  summary: Summary;
};

export type CompareRow = {
  jobId: string;
  label: string;
  posts: number;
  followers: number | null;
  avgEngagement: number | null;
  medianEngagement: number | null;
  avgRatePct: number | null;
  postsPerWeek: number | null;
  bestTime: string | null;
  topType: string | null;
  status: string;
};

const DATE = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit" });

/** 同帳號被勾選多次時，標籤加上建立日期區分。 */
export function compareLabels(entries: Pick<CompareEntry, "username" | "createdAt">[]): string[] {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.username, (counts.get(e.username) ?? 0) + 1);
  return entries.map((e) =>
    (counts.get(e.username) ?? 0) > 1 ? `@${e.username}（${DATE.format(new Date(e.createdAt))}）` : `@${e.username}`,
  );
}

export function buildCompareRows(entries: CompareEntry[]): CompareRow[] {
  const labels = compareLabels(entries);
  return entries.map((e, i) => {
    const o = e.summary.overview;
    const t = e.summary.time;
    const best = [t.best_weekday?.label, t.best_hour ? `${t.best_hour.hour} 時` : null].filter(Boolean).join("／");
    const top = [...e.summary.types].sort((a, b) => b.count - a.count)[0];
    return {
      jobId: e.jobId,
      label: labels[i],
      posts: o.post_count,
      followers: o.follower_count,
      avgEngagement: o.engagement.mean,
      medianEngagement: o.engagement.median,
      avgRatePct: o.engagement_rate_pct.mean,
      postsPerWeek: o.posts_per_week,
      bestTime: best || null,
      topType: top ? top.type : null,
      status: e.status,
    };
  });
}

/** 分組長條圖資料：每種貼文類型一列，各帳號占比（%）為欄 s0..s3。 */
export function typeShareSeries(entries: CompareEntry[]): { type: string; [series: string]: number | string }[] {
  const order: string[] = [];
  for (const e of entries) for (const t of e.summary.types) if (!order.includes(t.type)) order.push(t.type);
  return order.map((type) => {
    const row: { type: string; [series: string]: number | string } = { type };
    entries.forEach((e, i) => {
      const t = e.summary.types.find((x) => x.type === type);
      row[`s${i}`] = t ? Math.round(t.share * 1000) / 10 : 0;
    });
    return row;
  });
}
