/** 匯出工具（PRD F10、AC10.1–10.2）。純函式，方便單元測試。 */

export const EXPORT_POST_COLUMNS = [
  "post_id",
  "post_url",
  "published_at",
  "text",
  "likes",
  "replies",
  "reposts",
  "quotes",
  "views",
  "engagement",
  "engagement_rate",
  "score",
  "group_label",
  "is_outlier",
  "char_count",
  "hashtag_count",
  "mention_count",
  "url_count",
  "emoji_count",
  "post_types",
  "hashtags",
  "mentions",
  "missing_fields",
] as const;

export type ExportPost = Partial<Record<(typeof EXPORT_POST_COLUMNS)[number], unknown>>;

/** UTF-8 BOM：讓 Excel 正確辨識中文。 */
export const BOM = "﻿";

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("|") : typeof v === "object" ? JSON.stringify(v) : String(v);
  // 試算表公式注入防護：以 = + - @ 開頭的文字加單引號前綴（數字不處理）
  const safe = typeof v === "string" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** 轉為 CSV（含 BOM、CRLF 換行，符合 RFC 4180）。 */
export function postsToCsv(posts: ExportPost[]): string {
  const lines = [EXPORT_POST_COLUMNS.join(",")];
  for (const p of posts) lines.push(EXPORT_POST_COLUMNS.map((c) => cell(p[c])).join(","));
  return BOM + lines.join("\r\n") + "\r\n";
}

/** 下載檔名：只保留安全字元。 */
export function exportFilename(username: string, jobId: string, ext: "csv" | "json"): string {
  const safe = username.replace(/[^a-zA-Z0-9._-]/g, "_") || "threads";
  return `threads-${safe}-${jobId.slice(0, 8)}.${ext}`;
}
