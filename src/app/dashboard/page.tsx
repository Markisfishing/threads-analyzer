import { requireUser } from "@/lib/auth";
import { JOB_COLUMNS, formatTaipei, type Job } from "@/lib/jobs";
import { JobTable } from "./JobTable";
import { NewJobForm } from "./NewJobForm";

export const metadata = { title: "我的分析｜Threads Analyzer" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("analysis_jobs")
    .select(JOB_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100);
  const jobs = (data ?? []) as Job[];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">我的分析</h1>
      <NewJobForm />
      {sp.notice === "deleted" && (
        <p role="status" className="rounded-lg border border-foreground/20 p-3 text-sm">
          已刪除分析。
        </p>
      )}

      {error && <p role="alert" className="text-sm text-red-600">讀取任務失敗，請重新整理</p>}

      {jobs.length === 0 ? (
        <p className="opacity-70">還沒有任何分析，輸入一個 Threads 帳號開始吧。</p>
      ) : (
        <JobTable jobs={jobs.map((j) => ({ ...j, createdLabel: formatTaipei(j.created_at) }))} />
      )}
    </div>
  );
}
