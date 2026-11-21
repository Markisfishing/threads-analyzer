"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createJob, type CreateJobState } from "./actions";

export function NewJobForm() {
  const [state, action, pending] = useActionState<CreateJobState, FormData>(createJob, {});

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-foreground/10 p-4 sm:flex-row sm:items-end">
      <label className="flex flex-1 flex-col gap-1 text-sm">
        Threads 帳號或網址
        <input
          name="target"
          required
          placeholder="例如 @zuck 或 https://www.threads.com/@zuck"
          defaultValue={state.target}
          className="rounded-md border border-foreground/20 bg-transparent px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:w-28">
        目標篇數
        <input
          name="max_posts"
          type="number"
          min={30}
          max={100}
          defaultValue={state.maxPosts ?? 30}
          className="rounded-md border border-foreground/20 bg-transparent px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="btn-primary h-10 px-5 disabled:opacity-60"
      >
        {pending && <span className="spinner" aria-hidden />}
        {pending ? "建立中…" : "新增分析"}
      </button>
      {state.cache && (
        <div
          role="status"
          data-testid="cache-choice"
          className="flex animate-fade-up flex-col gap-2 rounded-lg border border-accent/40 bg-[var(--accent-soft)] p-3 text-sm sm:basis-full"
        >
          <p>
            @{state.cache.username} 在 {state.cache.finishedLabel} 已完成分析（24 小時內），要直接使用這份結果嗎？
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/dashboard/jobs/${state.cache.jobId}`}
              className="rounded-full bg-foreground px-4 py-1.5 text-background"
            >
              使用快取結果
            </Link>
            <button
              type="submit"
              name="force"
              value="1"
              disabled={pending}
              className="rounded-full border border-foreground/30 px-4 py-1.5 disabled:opacity-60"
            >
              強制重新爬取
            </button>
          </div>
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-red-600 sm:basis-full dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
