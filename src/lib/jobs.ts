/** 任務相關的共用定義（前後端皆可用）。 */

export type JobStatus =
  | "queued"
  | "scraping"
  | "cleaning"
  | "analyzing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export const ACTIVE_STATUSES: JobStatus[] = ["queued", "scraping", "cleaning", "analyzing"];
export const FINISHED_STATUSES: JobStatus[] = ["completed", "partial", "failed", "cancelled"];

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "排隊中",
  scraping: "爬取中",
  cleaning: "清理中",
  analyzing: "分析中",
  completed: "完成",
  partial: "部分完成",
  failed: "失敗",
  cancelled: "已取消",
};

export function isActive(status: string): boolean {
  return (ACTIVE_STATUSES as string[]).includes(status);
}

export type Job = {
  id: string;
  target_username: string;
  max_posts: number;
  status: JobStatus;
  scraped_count: number;
  error_code: string | null;
  error_message: string | null;
  scrape_mode: "anonymous" | "authenticated" | null;
  parent_job_id: string | null;
  account_meta: { display_name?: string; follower_count?: number } | null;
  run_url: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export const JOB_COLUMNS =
  "id,target_username,max_posts,status,scraped_count,error_code,error_message,scrape_mode,parent_job_id,account_meta,run_url,created_at,updated_at,started_at,finished_at";

export const USERNAME_RE = /^[a-z0-9._]{1,30}$/;

/**
 * 正規化使用者輸入的 Threads 帳號（PRD F2、AC2.1）。
 * 接受：zuck、@zuck、https://www.threads.com/@zuck、threads.net/@zuck/post/xxx
 * 回傳小寫 username；格式不符回傳 null。
 */
export function normalizeUsername(input: string): string | null {
  let s = input.trim();
  if (!s) return null;

  const urlMatch = s.match(/^(?:https?:\/\/)?(?:www\.)?threads\.(?:com|net)\/@([^/?#\s]+)/i);
  if (urlMatch) {
    s = urlMatch[1];
  } else if (/[/:]/.test(s)) {
    return null; // 其他網址或含路徑的字串
  }

  s = s.replace(/^@/, "").toLowerCase();
  return USERNAME_RE.test(s) ? s : null;
}

export function clampMaxPosts(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 30 || n > 100) return null;
  return n;
}

const TAIPEI = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatTaipei(iso: string | null | undefined): string {
  return iso ? TAIPEI.format(new Date(iso)) : "—";
}
