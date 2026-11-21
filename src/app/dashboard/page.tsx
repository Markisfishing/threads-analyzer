import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { sparkline, type ListStats } from "@/lib/job-list";
import { JOB_COLUMNS, formatTaipei, type Job } from "@/lib/jobs";
import type { Overview } from "@/lib/report";
import { JobTable } from "./JobTable";
import { NewJobForm } from "./NewJobForm";
import { JobListSkeleton } from "./Skeletons";

export const metadata = { title: "我的分析｜Threads Analyzer" };

/** 迷你趨勢線只替最近的幾個已完成任務抓貼文，避免一次讀太多列。 */
const SPARK_JOBS = 30;

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
  return (
    <div className="flex animate-fade-up flex-col gap-6">
      <h1 className="text-2xl font-semibold">我的分析</h1>
      <NewJobForm />
      {sp.notice === "deleted" && (
        <p role="status" className="animate-fade-up rounded-lg border border-[var(--border)] p-3 text-sm">
          已刪除分析。
        </p>
      )}
      <Suspense fallback={<JobListSkeleton />}>
        <JobList />
      </Suspense>
    </div>
  );
}

async function JobList() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("analysis_jobs")
    .select(JOB_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100);
  const jobs = (data ?? []) as Job[];

  if (error) return <p role="alert" className="text-sm text-danger">讀取任務失敗，請重新整理</p>;
  if (jobs.length === 0) return <EmptyState />;

  const done = jobs.filter((j) => (j.status === "completed" || j.status === "partial") && j.scraped_count > 0);
  // Supabase 單次最多回 1000 列：依篇數把任務分批並行查詢
  const batches: string[][] = [];
  let rows = Infinity;
  for (const j of done.slice(0, SPARK_JOBS)) {
    if (rows + j.scraped_count > 1000) {
      batches.push([]);
      rows = 0;
    }
    batches[batches.length - 1].push(j.id);
    rows += j.scraped_count;
  }
  const [{ data: results }, ...postBatches] = await Promise.all([
    done.length
      ? supabase.from("analysis_results").select("job_id, overview:summary->overview").in("job_id", done.map((j) => j.id))
      : Promise.resolve({ data: [] }),
    ...batches.map((ids) => supabase.from("posts").select("job_id, published_at, engagement").in("job_id", ids)),
  ]);
  const posts = postBatches.flatMap((b) => b.data ?? []);

  const overviewByJob = new Map(
    ((results ?? []) as unknown as { job_id: string; overview: Overview | null }[]).map((r) => [r.job_id, r.overview]),
  );
  const postsByJob = new Map<string, { published_at: string | null; engagement: number | null }[]>();
  for (const p of posts as { job_id: string; published_at: string | null; engagement: number | null }[]) {
    postsByJob.set(p.job_id, [...(postsByJob.get(p.job_id) ?? []), p]);
  }

  return (
    <JobTable
      jobs={jobs.map((j) => {
        const o = overviewByJob.get(j.id);
        const stats: ListStats | undefined = o
          ? {
              followers: o.follower_count ?? j.account_meta?.follower_count ?? null,
              avgEngagement: o.engagement?.mean ?? null,
              ratePct: o.engagement_rate_pct?.mean ?? null,
              spark: sparkline(postsByJob.get(j.id) ?? []),
            }
          : undefined;
        return {
          ...j,
          createdLabel: formatTaipei(j.created_at),
          display_name: o?.display_name ?? j.account_meta?.display_name ?? null,
          stats,
        };
      })}
    />
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--border)] px-6 py-12 text-center"
      data-testid="job-list-empty"
    >
      <svg viewBox="0 0 64 64" className="size-14 text-accent" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="8" y="10" width="48" height="44" rx="8" opacity="0.35" />
        <path d="M18 42V34M28 42V26M38 42V30M48 42V20" strokeLinecap="round" />
      </svg>
      <p className="font-medium">還沒有任何分析</p>
      <p className="max-w-[32ch] text-sm text-muted">在上方輸入一個 Threads 帳號（例如 @zuck），約 1–3 分鐘就會產生第一份報告。</p>
    </div>
  );
}
