import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { JOB_COLUMNS, formatTaipei, type Job } from "@/lib/jobs";
import { NewJobForm } from "./NewJobForm";
import { StatusBadge } from "./StatusBadge";

export const metadata = { title: "我的分析｜Threads Analyzer" };

export default async function DashboardPage() {
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

      {error && <p role="alert" className="text-sm text-red-600">讀取任務失敗，請重新整理</p>}

      {jobs.length === 0 ? (
        <p className="opacity-70">還沒有任何分析，輸入一個 Threads 帳號開始吧。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="job-list">
            <thead className="border-b border-foreground/10 opacity-70">
              <tr>
                <th className="py-2 pr-4 font-medium">帳號</th>
                <th className="py-2 pr-4 font-medium">狀態</th>
                <th className="py-2 pr-4 font-medium">貼文數</th>
                <th className="py-2 font-medium">建立時間</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-foreground/5">
                  <td className="py-2 pr-4">
                    <Link href={`/dashboard/jobs/${job.id}`} className="font-medium underline-offset-2 hover:underline">
                      @{job.target_username}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{job.scraped_count}</td>
                  <td className="py-2 tabular-nums opacity-70">{formatTaipei(job.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
