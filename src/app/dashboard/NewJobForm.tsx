"use client";

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
          defaultValue={30}
          className="rounded-md border border-foreground/20 bg-transparent px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-full bg-foreground px-5 text-background disabled:opacity-60"
      >
        {pending ? "建立中…" : "新增分析"}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-red-600 sm:basis-full dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
