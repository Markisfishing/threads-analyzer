"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { selectionHint } from "@/lib/compare";
import { SORT_LABEL, compactNumber, filterJobs, sortJobs, type ListStats, type SortKey } from "@/lib/job-list";
import { isActive, type Job } from "@/lib/jobs";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "./StatusBadge";

const COMPARABLE = new Set(["completed", "partial"]);
const POLL_MS = 5000;

/** 時間字串由伺服器端格式化後傳入，避免 Node 與瀏覽器 Intl 輸出差異造成 hydration mismatch。 */
export type JobRow = Job & { createdLabel: string; display_name: string | null; stats?: ListStats };

/** 任務清單：搜尋、排序、即時進度，以及多帳號比較勾選（PRD F9、AC9.1）。 */
export function JobTable({ jobs }: { jobs: JobRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("created");
  const [live, setLive] = useState<Record<string, Pick<Job, "status" | "scraped_count">>>({});
  const hint = selectionHint(selected.length);
  const anyComparable = jobs.some((j) => COMPARABLE.has(j.status) && j.scraped_count > 0);

  // 進行中的任務每 5 秒更新狀態與篇數；有任務結束就重新整理整頁拿到最新數字
  const activeIds = useMemo(() => jobs.filter((j) => isActive(j.status)).map((j) => j.id), [jobs]);
  useEffect(() => {
    if (!activeIds.length) return;
    const supabase = createClient();
    const timer = setInterval(async () => {
      const { data } = await supabase.from("analysis_jobs").select("id,status,scraped_count").in("id", activeIds);
      if (!data) return;
      setLive(Object.fromEntries(data.map((d) => [d.id, d])));
      if (data.some((d) => !isActive(d.status))) router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [activeIds, router]);

  const rows = useMemo(
    () => sortJobs(filterJobs(jobs.map((j) => ({ ...j, ...live[j.id] })), query), sort),
    [jobs, live, query, sort],
  );

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className={`flex flex-col gap-3 ${selected.length ? "pb-24" : ""}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">搜尋帳號</span>
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋帳號或名稱"
            className="field !pl-9"
          />
        </label>
        <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-muted">
          排序
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="field w-auto py-0">
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="stagger flex flex-col gap-2" data-testid="job-list">
        {rows.map((job, i) => {
          const comparable = COMPARABLE.has(job.status) && job.scraped_count > 0;
          const href = `/dashboard/jobs/${job.id}`;
          const checked = selected.includes(job.id);
          return (
            <li
              key={job.id}
              style={{ "--i": Math.min(i, 12) } as CSSProperties}
              onClick={() => router.push(href)}
              className={`group grid cursor-pointer grid-cols-[auto_auto_1fr_auto] items-center gap-3 rounded-xl border px-3 py-3 transition-colors hover:border-accent/50 hover:bg-[var(--accent-soft)] md:grid-cols-[auto_auto_minmax(0,1.4fr)_repeat(3,minmax(0,0.7fr))_96px_auto] ${
                checked ? "border-accent/60 bg-[var(--accent-soft)]" : "border-[var(--border-soft)]"
              }`}
            >
              <span className="flex w-5 justify-center" onClick={(e) => e.stopPropagation()}>
                {comparable && (
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(job.id)}
                    aria-label={`加入比較 @${job.target_username}`}
                    className="size-4 cursor-pointer accent-[var(--accent)]"
                  />
                )}
              </span>
              <span
                className="flex size-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-semibold text-accent"
                aria-hidden
              >
                {(job.display_name || job.target_username).charAt(0).toUpperCase()}
              </span>
              <div className="flex min-w-0 flex-col">
                <Link href={href} onClick={(e) => e.stopPropagation()} className="truncate font-medium hover:underline">
                  @{job.target_username}
                </Link>
                <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
                  {job.display_name && <span className="truncate">{job.display_name}</span>}
                  <span className="shrink-0 tabular-nums">{job.createdLabel}</span>
                </span>
              </div>
              <Metric label="粉絲" value={compactNumber(job.stats?.followers)} />
              <Metric label="平均互動" value={compactNumber(job.stats?.avgEngagement)} />
              <Metric
                label="互動率"
                value={job.stats?.ratePct != null ? `${job.stats.ratePct.toFixed(2)}%` : "—"}
              />
              <span className="hidden md:block">
                <Sparkline values={job.stats?.spark ?? []} />
              </span>
              <span className="flex flex-col items-end gap-1 text-xs">
                <StatusBadge status={job.status} />
                {isActive(job.status) && (
                  <span className="tabular-nums text-muted" data-testid="job-live-progress">
                    {job.status === "scraping" ? `抓取中 ${job.scraped_count}/${job.max_posts} 篇` : `${job.scraped_count} 篇`}
                  </span>
                )}
                {!isActive(job.status) && <span className="tabular-nums text-muted">{job.scraped_count} 篇</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-muted">
          找不到符合「{query}」的分析
        </p>
      )}

      {anyComparable && (
        <div
          data-testid="compare-bar"
          className={`fixed inset-x-0 bottom-4 z-20 mx-auto flex w-[min(92vw,36rem)] items-center justify-between gap-3 rounded-full border border-[var(--border-soft)] bg-background/95 py-2 pl-5 pr-2 shadow-lg backdrop-blur transition-[transform,opacity] duration-200 ease-out ${
            selected.length ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[150%] opacity-0"
          }`}
        >
          <span id="compare-hint" className="text-sm" aria-live="polite">
            {hint ?? `已選 ${selected.length} 個`}
          </span>
          <span className="flex items-center gap-1">
            {selected.length > 0 && (
              <button type="button" onClick={() => setSelected([])} className="rounded-full px-3 py-2 text-sm text-muted hover:text-foreground">
                清除
              </button>
            )}
            <button
              type="button"
              disabled={hint !== null}
              onClick={() => router.push(`/dashboard/compare?ids=${selected.join(",")}`)}
              className="btn-primary btn-sm"
              aria-describedby="compare-hint"
            >
              比較所選帳號
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="hidden flex-col md:flex">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

/** 迷你趨勢線：依發文時間的平均互動，最後一點用強調色標出。 */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-xs text-muted">—</span>;
  const w = 96;
  const h = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const y = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
  const x = (i: number) => (i / (values.length - 1)) * (w - 4) + 2;
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const trend = values[values.length - 1] >= values[0] ? "上升" : "下降";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`互動趨勢：整體${trend}`}>
      <polyline points={pts} fill="none" stroke="var(--chart-bar)" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.5" fill="var(--accent)" />
    </svg>
  );
}
