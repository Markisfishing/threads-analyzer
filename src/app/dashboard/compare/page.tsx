import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { buildCompareRows, parseCompareIds, typeShareSeries, type CompareEntry } from "@/lib/compare";
import { fmt, type Summary } from "@/lib/report";
import { CompareTypeChart } from "./CompareChart";

export const metadata = { title: "多帳號比較｜Threads Analyzer" };

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/dashboard" className="text-sm opacity-70 hover:underline">
        ← 我的分析
      </Link>
      <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        {children}
      </p>
    </div>
  );
}

/** 多帳號比較（PRD F9、AC9.1）：只能比較自己已完成的任務（RLS）。 */
export default async function ComparePage({ searchParams }: PageProps<"/dashboard/compare">) {
  const sp = await searchParams;
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
  const metrics: { label: string; value: (r: (typeof rows)[number]) => string }[] = [
    { label: "分析貼文數", value: (r) => String(r.posts) },
    { label: "粉絲數", value: (r) => (r.followers === null ? "—" : r.followers.toLocaleString("zh-TW")) },
    { label: "平均互動", value: (r) => fmt(r.avgEngagement) },
    { label: "互動中位數", value: (r) => fmt(r.medianEngagement) },
    { label: "平均粉絲基準互動率", value: (r) => (r.avgRatePct === null ? "—" : `${fmt(r.avgRatePct, 2)}%`) },
    { label: "每週發文", value: (r) => (r.postsPerWeek === null ? "—" : `${fmt(r.postsPerWeek)} 篇`) },
    { label: "互動最佳時段", value: (r) => r.bestTime ?? "—" },
    { label: "最常見類型", value: (r) => r.topType ?? "—" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard" className="text-sm opacity-70 hover:underline">
        ← 我的分析
      </Link>
      <h1 className="text-xl font-semibold">多帳號比較</h1>
      {rows.some((r) => r.status === "partial") && (
        <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
          部分帳號為「部分完成」，樣本較少，比較時請留意。
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" data-testid="compare-table">
          <thead>
            <tr className="border-b border-foreground/10">
              <th className="py-2 pr-4 font-medium opacity-70">指標</th>
              {rows.map((r, i) => (
                <th key={r.jobId} scope="col" className="py-2 pr-4 font-medium">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="size-2.5 rounded-full" style={{ background: `var(--series-${i + 1})` }} />
                    <Link href={`/dashboard/jobs/${r.jobId}`} className="hover:underline">
                      {r.label}
                    </Link>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.label} className="border-b border-foreground/5">
                <th scope="row" className="py-2 pr-4 font-normal opacity-70">
                  {m.label}
                </th>
                {rows.map((r) => (
                  <td key={r.jobId} className="py-2 pr-4 tabular-nums">
                    {m.value(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CompareTypeChart labels={labels} data={typeShareSeries(entries)} />
      <p className="text-xs opacity-60">互動 = 讚 + 留言 + 轉發 + 引用；粉絲基準互動率 = 互動 ÷ 爬取當下粉絲數（曝光數無法取得，不是曝光互動率）。各帳號樣本為最近貼文，非完整歷史。</p>
    </div>
  );
}
