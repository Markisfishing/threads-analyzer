/** 「我的分析」列表用的純函式：迷你趨勢線、排序、搜尋。可單元測試。 */

export type ListStats = {
  followers: number | null;
  avgEngagement: number | null;
  ratePct: number | null;
  /** 依發文時間排序、分段平均後的互動數列（迷你趨勢線） */
  spark: number[];
};

export type SortKey = "created" | "rate" | "engagement" | "followers";

export const SORT_LABEL: Record<SortKey, string> = {
  created: "最新建立",
  rate: "粉絲基準互動率",
  engagement: "平均互動",
  followers: "粉絲數",
};

/** 把貼文依時間排序後切成最多 `buckets` 段，每段取平均互動；少於 3 篇不畫。 */
export function sparkline(posts: { published_at: string | null; engagement: number | null }[], buckets = 12): number[] {
  const rows = posts
    .filter((p) => p.published_at && p.engagement != null)
    .sort((a, b) => a.published_at!.localeCompare(b.published_at!));
  if (rows.length < 3) return [];
  const n = Math.min(buckets, rows.length);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const slice = rows.slice(Math.floor((i * rows.length) / n), Math.floor(((i + 1) * rows.length) / n));
    out.push(slice.reduce((s, p) => s + Number(p.engagement), 0) / slice.length);
  }
  return out;
}

type Sortable = { created_at: string; target_username: string; display_name?: string | null; stats?: ListStats };

/** 數值排序時沒有資料的排在最後；同值依建立時間新到舊。 */
export function sortJobs<T extends Sortable>(jobs: T[], key: SortKey): T[] {
  const val = (j: T): number | null =>
    key === "rate" ? j.stats?.ratePct ?? null
    : key === "engagement" ? j.stats?.avgEngagement ?? null
    : key === "followers" ? j.stats?.followers ?? null
    : null;
  return [...jobs].sort((a, b) => {
    if (key !== "created") {
      const va = val(a);
      const vb = val(b);
      if (va == null && vb != null) return 1;
      if (vb == null && va != null) return -1;
      if (va != null && vb != null && va !== vb) return vb - va;
    }
    return b.created_at.localeCompare(a.created_at);
  });
}

/** 依帳號或顯示名稱搜尋（不分大小寫，可加 @）。 */
export function filterJobs<T extends Sortable>(jobs: T[], query: string): T[] {
  const q = query.trim().replace(/^@/, "").toLowerCase();
  if (!q) return jobs;
  return jobs.filter(
    (j) => j.target_username.includes(q) || (j.display_name ?? "").toLowerCase().includes(q),
  );
}

/** 1234 → 1,234；12345 → 1.2萬 */
export function compactNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}萬`;
  return Math.round(n).toLocaleString("en-US");
}
