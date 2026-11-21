"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { cancelJob, deleteJob, rerunJob, type JobActionResult } from "../../actions";

/** 任務操作：進行中 → 取消；已結束 → 重跑，刪除收在「⋯」選單裡並需二次確認。 */
export function JobActions({ jobId, active }: { jobId: string; active: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [menuOpen, setMenuOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen]);

  const run = (fn: () => Promise<JobActionResult>) =>
    start(async () => {
      setError(undefined);
      const r = await fn();
      if (r?.error) setError(r.error);
    });

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="job-actions">
      {active ? (
        <button type="button" disabled={pending} onClick={() => run(() => cancelJob(jobId))} className="btn-secondary">
          {pending && <span className="spinner" aria-hidden />}
          {pending ? "取消中…" : "取消任務"}
        </button>
      ) : (
        <>
          <button type="button" disabled={pending} onClick={() => run(() => rerunJob(jobId))} className="btn-secondary">
            {pending && <span className="spinner" aria-hidden />}
            重跑
          </button>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label="更多操作"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="btn-secondary w-11 px-0 text-lg leading-none"
            >
              ⋯
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-12 z-20 w-40 animate-fade-up rounded-xl border border-[var(--border-soft)] bg-background p-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    dialogRef.current?.showModal();
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-[var(--border-soft)]"
                >
                  刪除分析
                </button>
              </div>
            )}
          </div>
        </>
      )}
      {error && (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      )}

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-[var(--border-soft)] bg-background p-5 text-foreground backdrop:bg-black/40"
        aria-labelledby="delete-title"
      >
        <h2 id="delete-title" className="font-semibold">
          確定刪除這個分析？
        </h2>
        <p className="mt-2 text-sm text-[var(--ink-2)]">任務、貼文資料與分析結果都會永久刪除，無法復原。</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => dialogRef.current?.close()} className="btn-secondary">
            保留
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              dialogRef.current?.close();
              run(() => deleteJob(jobId));
            }}
            className="inline-flex min-h-11 items-center rounded-full bg-[var(--danger)] px-5 text-sm font-medium text-background"
          >
            確定刪除
          </button>
        </div>
      </dialog>
    </div>
  );
}
