import { STATUS_LABEL, type JobStatus } from "@/lib/jobs";

const TONE: Record<JobStatus, string> = {
  queued: "bg-foreground/10",
  scraping: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  cleaning: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  analyzing: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  partial: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
  cancelled: "bg-foreground/10 opacity-70",
};

const ACTIVE = new Set<JobStatus>(["queued", "scraping", "cleaning", "analyzing"]);

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-500 ${TONE[status]}`}
      data-status={status}
    >
      {ACTIVE.has(status) && <span className="size-1.5 animate-pulse-dot rounded-full bg-current" aria-hidden />}
      {STATUS_LABEL[status]}
    </span>
  );
}
