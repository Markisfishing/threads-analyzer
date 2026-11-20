import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { JOB_COLUMNS, formatTaipei, isActive, type Job } from "@/lib/jobs";
import type { AnalysisResult } from "@/lib/report";
import { StatusBadge } from "../../StatusBadge";
import { JobActions } from "./JobActions";
import { JobProgress } from "./JobProgress";
import { Report } from "./report/Report";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/dashboard/jobs/[id]">) {
  const { id } = await params;
  return { title: `分析報告 ${id.slice(0, 8)}｜Threads Analyzer` };
}

export default async function JobPage({ params, searchParams }: PageProps<"/dashboard/jobs/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(id)) notFound();

  const { supabase } = await requireUser(`/dashboard/jobs/${id}`);
  const { data } = await supabase.from("analysis_jobs").select(JOB_COLUMNS).eq("id", id).maybeSingle();
  // RLS：別人的任務查不到，一律 404（AC1.4）
  if (!data) notFound();
  const job = data as Job;

  let result: AnalysisResult | null = null;
  if (!isActive(job.status)) {
    const { data: r } = await supabase.from("analysis_results").select("*").eq("job_id", id).maybeSingle();
    result = (r as AnalysisResult | null) ?? null;
  }
  const displayName = result?.summary.overview.display_name ?? job.account_meta?.display_name;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard" className="text-sm opacity-70 hover:underline">
          ← 我的分析
        </Link>
      </div>

      {sp.notice === "duplicate" && (
        <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          @{job.target_username} 已在分析中，以下是進行中的任務。
        </p>
      )}

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">@{job.target_username}</h1>
        {displayName && <span className="text-[var(--chart-ink-2)]">{displayName}</span>}
        <StatusBadge status={job.status} />
        <span className="text-sm opacity-70">建立於 {formatTaipei(job.created_at)}</span>
        <div className="ml-auto">
          <JobActions jobId={job.id} active={isActive(job.status)} />
        </div>
      </header>
      {job.parent_job_id && (
        <p className="text-sm opacity-70">
          此任務重跑自{" "}
          <Link href={`/dashboard/jobs/${job.parent_job_id}`} className="underline">
            先前的分析
          </Link>
        </p>
      )}

      {isActive(job.status) ? (
        <JobProgress initial={job} />
      ) : (
        <>
          <section className="flex flex-col gap-2 text-sm" data-testid="job-finished">
            <p>
              已取得 <strong className="tabular-nums">{job.scraped_count}</strong> 篇貼文
              {job.scrape_mode === "authenticated" && "（使用登入模式）"}
              {job.finished_at && `，完成於 ${formatTaipei(job.finished_at)}`}。
            </p>
            {job.error_message && (
              <p
                role="alert"
                className={job.status === "partial" ? "text-amber-700 dark:text-amber-300" : "text-red-600 dark:text-red-400"}
              >
                {job.error_message}
              </p>
            )}
          </section>
          {result && <Report result={result} />}
        </>
      )}
    </div>
  );
}
