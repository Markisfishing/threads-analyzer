"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { JOB_COLUMNS, STATUS_LABEL, isActive, type Job } from "@/lib/jobs";
import { retriggerJob } from "../../actions";

const POLL_MS = 5000;
const QUEUE_WARN_MS = 5 * 60 * 1000;

const STEPS = ["queued", "scraping", "cleaning", "analyzing"] as const;

/** 進行中任務的進度顯示，每 5 秒輪詢（PRD F2 使用者可見狀態）。 */
export function JobProgress({ initial }: { initial: Job }) {
  const router = useRouter();
  const [job, setJob] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [retriggerMsg, setRetriggerMsg] = useState<string>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let stopped = false;
    const timer = setInterval(async () => {
      setNow(Date.now());
      const { data } = await supabase.from("analysis_jobs").select(JOB_COLUMNS).eq("id", initial.id).maybeSingle();
      if (stopped || !data) return;
      const next = data as Job;
      setJob(next);
      if (!isActive(next.status)) {
        stopped = true;
        clearInterval(timer);
        router.refresh(); // 由伺服器重新渲染完成後的報告
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [initial.id, router]);

  const queuedTooLong = job.status === "queued" && now - new Date(job.created_at).getTime() > QUEUE_WARN_MS;
  const currentStep = STEPS.indexOf(job.status as (typeof STEPS)[number]);

  return (
    <section className="flex flex-col gap-4" data-testid="job-progress" aria-live="polite">
      <ol className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`rounded-full px-3 py-1 ${
              i < currentStep ? "bg-emerald-500/15" : i === currentStep ? "bg-sky-500/20 font-medium" : "bg-foreground/5 opacity-60"
            }`}
          >
            {STATUS_LABEL[s]}
          </li>
        ))}
      </ol>

      {job.status === "scraping" && (
        <p className="text-sm">
          已取得 <strong className="tabular-nums">{job.scraped_count}</strong> / 目標 {job.max_posts} 篇
        </p>
      )}

      {queuedTooLong && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <span>分析服務忙碌或離線，任務仍在排隊。</span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await retriggerJob(job.id);
                setRetriggerMsg(r.ok ? "已重新觸發分析服務" : "無法觸發分析服務，請稍後再試");
              })
            }
            className="rounded-full border border-foreground/30 px-3 py-1"
          >
            重新觸發
          </button>
          {retriggerMsg && <span>{retriggerMsg}</span>}
        </div>
      )}
    </section>
  );
}
