"use client";

import { useRef, useState, useTransition } from "react";
import { cancelJob, deleteJob, rerunJob, type JobActionResult } from "../../actions";

/** 任務操作：進行中 → 取消；已結束 → 重跑、刪除（需二次確認）。 */
export function JobActions({ jobId, active }: { jobId: string; active: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const run = (fn: () => Promise<JobActionResult>) =>
    start(async () => {
      setError(undefined);
      const r = await fn();
      if (r?.error) setError(r.error);
    });

  const btn = "rounded-full border px-3 py-1 text-sm disabled:opacity-60";

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="job-actions">
      {active ? (
        <button type="button" disabled={pending} onClick={() => run(() => cancelJob(jobId))} className={`${btn} border-foreground/30`}>
          {pending ? "取消中…" : "取消任務"}
        </button>
      ) : (
        <>
          <button type="button" disabled={pending} onClick={() => run(() => rerunJob(jobId))} className={`${btn} border-foreground/30`}>
            重跑
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => dialogRef.current?.showModal()}
            className={`${btn} border-red-500/50 text-red-600 dark:text-red-400`}
          >
            刪除
          </button>
        </>
      )}
      {error && (
        <span role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </span>
      )}

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-foreground/10 bg-background p-5 text-foreground backdrop:bg-black/40"
        aria-labelledby="delete-title"
      >
        <h2 id="delete-title" className="font-semibold">
          確定刪除這個分析？
        </h2>
        <p className="mt-2 text-sm opacity-80">任務、貼文資料與分析結果都會永久刪除，無法復原。</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => dialogRef.current?.close()} className={`${btn} border-foreground/30`}>
            保留
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              dialogRef.current?.close();
              run(() => deleteJob(jobId));
            }}
            className={`${btn} border-red-600 bg-red-600 text-white`}
          >
            確定刪除
          </button>
        </div>
      </dialog>
    </div>
  );
}
