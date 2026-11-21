"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createJob, type CreateJobState } from "./actions";

/** 新增分析：頁面最上方的醒目卡片，大輸入框＋強調色按鈕。 */
export function NewJobForm() {
  const [state, action, pending] = useActionState<CreateJobState, FormData>(createJob, {});
  const invalid = Boolean(state.error);

  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-2xl border border-accent/30 bg-[var(--accent-soft)] p-5 sm:p-6"
      aria-labelledby="new-job-heading"
    >
      <div className="flex flex-col gap-1">
        <h2 id="new-job-heading" className="text-lg font-semibold">
          分析一個新帳號
        </h2>
        <p className="text-sm text-[var(--ink-2)]">貼上 Threads 帳號或個人頁網址，約 1–3 分鐘完成。</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5 text-sm">
          <label htmlFor="new-job-target">Threads 帳號或網址</label>
          <input
            id="new-job-target"
            name="target"
            required
            placeholder="例如 @zuck 或 https://www.threads.com/@zuck"
            defaultValue={state.target}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? "new-job-error" : undefined}
            className="field min-h-12 text-base"
          />
        </div>
        <div className="flex flex-col gap-1.5 text-sm sm:w-28">
          <label htmlFor="new-job-max">目標篇數</label>
          <input
            id="new-job-max"
            name="max_posts"
            type="number"
            min={30}
            max={100}
            defaultValue={state.maxPosts ?? 30}
            className="field min-h-12 text-base"
          />
        </div>
        <button type="submit" disabled={pending} className="btn-primary min-h-12 px-6 text-base">
          {pending && <span className="spinner" aria-hidden />}
          {pending ? "建立中…" : "新增分析"}
        </button>
      </div>
      {state.cache && (
        <div
          role="status"
          data-testid="cache-choice"
          className="flex animate-fade-up flex-col gap-2 rounded-lg border border-accent/40 bg-background p-3 text-sm"
        >
          <p>
            @{state.cache.username} 在 {state.cache.finishedLabel} 已完成分析（24 小時內），要直接使用這份結果嗎？
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/jobs/${state.cache.jobId}`} className="btn-primary btn-sm">
              使用快取結果
            </Link>
            <button type="submit" name="force" value="1" disabled={pending} className="btn-secondary min-h-9 px-4">
              強制重新爬取
            </button>
          </div>
        </div>
      )}
      {state.error && (
        <p id="new-job-error" role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
