import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { buildCompareRows, parseCompareIds, typeShareSeries, type CompareEntry, type CompareRow } from "@/lib/compare";
import { fmt, type Summary } from "@/lib/report";
import { CompareTypeChart } from "./CompareChart";

export const metadata = { title: "多帳號比較｜Threads Analyzer" };

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex animate-fade-up flex-col gap-4">
      <h1 className="text-2xl font-semibold">多帳號比較</h1>
      <p role="alert" className="rounded-lg border-l-4 border-amber-500 bg-amber-500/10 p-3 text-sm">
        {children}
      </p>
      <Link href="/dashboard" className="link text-sm">
        ← 回到我的分析重新勾選
      </Link>
    </div>
  );
}

/** 從導覽列直接進來（沒有帶 ids）時的說明。 */
function EmptyCompare() {
  return (
    <div className="flex animate-fade-up flex-col gap-4">
      <h1 className="text-2xl font-semibold">多帳號比較</h1>
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--border)] px-6 py-12 text-center" data-testid="compare-empty">
        <p className="font-medium">還沒有選擇要比較的帳號</p>
        <p className="max-w-[36ch] text-sm text-muted">到「我的分析」勾選 2–4 個已完成的分析，再按底部的「比較所選帳號」。</p>
        <Link href="/dashboard" className="btn-primary px-6">
          前往我的分析
        </Link>
      </div>
    </div>
  );
}

type Metric = {
  label: string;
  value: (r: CompareRow) => string;
  /** 有數值的指標才標示最佳與相對長條 */
  num?: (r: CompareRow) => number | null;
};

/** 多帳號比較（PRD F9、AC9.1）：只能比較自己已完成的任務（RLS）。 */
export default async function ComparePage({ searchParams }: PageProps<"/dashboard/compare">) {
  const sp = await searchParams;
  if (!sp.ids) return <EmptyCompare />;
  const { ids, error } = parseCompareIds(sp.ids);
  if (error) return <Notice>{error}</Notice>;

  const { supabase } = await requireUser(`/dashboard/compare?ids=${ids.join(",")}`);
  const [{ data: jobs }, { data: results }] = await Promise.all([
    supabase.from("analysis_jobs").select("id,target_username,created_at,status").in("id", ids),
    supabase.from("analysis_results").select("job_id,summary").in("job_id", ids),
  ]);

  const entries: CompareEntry[] = [];
  for (const id of ids) {
    const job = jobs?.find((j) => j.id === id);
    const res = results?.find((r) => r.job_id === id);
    if (!job || !res) continue;
    entries.push({ jobId: id, username: job.target_username, createdAt: job.created_at, status: job.status, summary: res.summary as Summary });
  }
  if (entries.length !== ids.length) {
    return <Notice>部分分析不存在、尚未完成或不屬於你，請回到清單重新勾選。</Notice>;
  }

  const rows = buildCompareRows(entries);
  const labels = rows.map((r) => r.label);
  const metrics: Metric[] = [
    { label: "分析貼文數", value: (r) => String(r.posts) },
    { label: "粉絲數", value: (r) => (r.followers === null ? "—" : r.followers.toLocaleString("zh-TW")), num: (r) => r.followers },
    { label: "平均互動", value: (r) => fmt(r.avgEngagement), num: (r) => r.avgEngagement },
    { label: "互動中位數", value: (r) => fmt(r.medianEngagement), num: (r) => r.medianEngagement },
    { label: "平均粉絲基準互動率", value: (r) => (r.avgRatePct === null ? "—" : `${fmt(r.avgRatePct, 2)}%`), num: (r) => r.avgRatePct },
    { label: "每週發文", value: (r) => (r.postsPerWeek === null ? "—" : `${fmt(r.postsPerWeek)} 篇`), num: (r) => r.postsPerWeek },
    { label: "互動最佳時段", value: (r) => r.bestTime ?? "—" },
    { label: "最常見類型", value: (r) => r.topType ?? "—" },
  ];

  return (
    <div className="flex animate-fade-up flex-col gap-6">
      <h1 className="text-2xl font-semibold">多帳號比較</h1>
      {rows.some((r) => r.status === "partial") && (
        <p role="status" className="rounded-lg border-l-4 border-amber-500 bg-amber-500/10 p-3 text-sm">
          部分帳號貼文數較少，比較時請留意。
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--border-soft)] bg-surface md:overflow-visible">
        <table className="w-full min-w-[560px] text-left text-sm" data-testid="compare-table">
          <thead className="sticky top-[53px] z-[5] bg-surface">
            <tr className="border-b border-[var(--border)]">
              <th className="px-4 py-3 font-medium text-muted">指標</th>
              {rows.map((r, i) => (
                <th key={r.jobId} scope="col" className="px-4 py-3 font-medium">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: `var(--cmp-${i + 1})` }} />
                    <Link href={`/dashboard/jobs/${r.jobId}`} className="hover:underline">
                      {r.label}
                    </Link>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => {
              const nums = m.num ? rows.map(m.num) : [];
              const valid = nums.filter((n): n is number => n != null);
              const max = valid.length ? Math.max(...valid) : null;
              const showBest = valid.length >= 2 && new Set(valid).size > 1;
              return (
                <tr key={m.label} className="border-b border-[var(--border-soft)] last:border-0">
                  <th scope="row" className="px-4 py-2.5 font-normal text-muted">
                    {m.label}
                  </th>
                  {rows.map((r, i) => {
                    const n = nums[i];
                    const best = showBest && n === max;
                    return (
                      <td key={r.jobId} className="px-4 py-2.5 tabular-nums" data-best={best || undefined}>
                        <span className={best ? "font-semibold" : undefined}>{m.value(r)}</span>
                        {best && (
                          <span className="ml-1.5 text-xs text-accent" aria-label="最高">
                            ▲ 最高
                          </span>
                        )}
                        {m.num && n != null && max ? (
                          <span className="mt-1 block h-1 w-full max-w-28 overflow-hidden rounded-full bg-[var(--border-soft)]" aria-hidden>
                            <span
                              className="block h-full rounded-full"
                              style={{ width: `${(n / max) * 100}%`, background: `var(--cmp-${i + 1})` }}
                            />
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CompareTypeChart labels={labels} data={typeShareSeries(entries)} />
      <p className="text-xs text-muted">
        互動＝讚＋留言＋轉發＋引用；互動率以爬取當下粉絲數計算。
      </p>
    </div>
  );
}
