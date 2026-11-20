"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { selectionHint } from "@/lib/compare";
import type { Job } from "@/lib/jobs";
import { StatusBadge } from "./StatusBadge";

const COMPARABLE = new Set(["completed", "partial"]);

/** 時間字串由伺服器端格式化後傳入，避免 Node 與瀏覽器 Intl 輸出差異造成 hydration mismatch。 */
export type JobRow = Job & { createdLabel: string };

/** 任務清單＋多帳號比較勾選（PRD F9、AC9.1）。 */
export function JobTable({ jobs }: { jobs: JobRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const hint = selectionHint(selected.length);
  const anyComparable = jobs.some((j) => COMPARABLE.has(j.status) && j.scraped_count > 0);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="flex flex-col gap-3">
      {anyComparable && (
        <div className="flex flex-wrap items-center gap-3" data-testid="compare-bar">
          <button
            type="button"
            disabled={hint !== null}
            onClick={() => router.push(`/dashboard/compare?ids=${selected.join(",")}`)}
            className="rounded-full bg-foreground px-4 py-1.5 text-sm text-background disabled:opacity-40"
            aria-describedby="compare-hint"
          >
            比較所選帳號
          </button>
          <span id="compare-hint" className="text-sm opacity-70" aria-live="polite">
            {hint ?? `已選 ${selected.length} 個`}
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" data-testid="job-list">
          <thead className="border-b border-foreground/10 opacity-70">
            <tr>
              <th className="w-8 py-2 pr-2 font-medium">
                <span className="sr-only">比較</span>
              </th>
              <th className="py-2 pr-4 font-medium">帳號</th>
              <th className="py-2 pr-4 font-medium">狀態</th>
              <th className="py-2 pr-4 font-medium">貼文數</th>
              <th className="py-2 font-medium">建立時間</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const comparable = COMPARABLE.has(job.status) && job.scraped_count > 0;
              return (
                <tr key={job.id} className="border-b border-foreground/5">
                  <td className="py-2 pr-2">
                    {comparable && (
                      <input
                        type="checkbox"
                        checked={selected.includes(job.id)}
                        onChange={() => toggle(job.id)}
                        aria-label={`加入比較 @${job.target_username}`}
                        className="size-4 accent-[var(--series-1)]"
                      />
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <Link href={`/dashboard/jobs/${job.id}`} className="font-medium underline-offset-2 hover:underline">
                      @{job.target_username}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{job.scraped_count}</td>
                  <td className="py-2 tabular-nums opacity-70">{job.createdLabel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
