import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { JOB_COLUMNS, formatTaipei, isActive, type Job } from "@/lib/jobs";
import { StatusBadge } from "../../StatusBadge";
import { JobProgress } from "./JobProgress";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function JobPage({ params, searchParams }: PageProps<"/dashboard/jobs/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(id)) notFound();

  const { supabase } = await requireUser(`/dashboard/jobs/${id}`);
  const { data } = await supabase.from("analysis_jobs").select(JOB_COLUMNS).eq("id", id).maybeSingle();
  // RLS：別人的任務查不到，一律 404（AC1.4）
  if (!data) notFound();
  const job = data as Job;

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
        <StatusBadge status={job.status} />
        <span className="text-sm opacity-70">建立於 {formatTaipei(job.created_at)}</span>
      </header>

      {isActive(job.status) ? (
        <JobProgress initial={job} />
      ) : (
        <section className="flex flex-col gap-2 text-sm" data-testid="job-finished">
          <p>
            已取得 <strong className="tabular-nums">{job.scraped_count}</strong> 篇貼文
            {job.scrape_mode === "authenticated" && "（使用登入模式）"}。
          </p>
          {job.error_message && (
            <p role="alert" className="text-red-600 dark:text-red-400">
              {job.error_message}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
