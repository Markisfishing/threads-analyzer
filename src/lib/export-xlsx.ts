/**
 * 排版好的 Excel 匯出（PRD F10）：給人直接閱讀，CSV／JSON 則保留給程式處理。
 *
 * 工作表：總覽（帳號資訊、指標、Top 5、資料限制）、貼文（中文欄名、凍結標題、篩選、
 * 數字與百分比格式、可點連結）、策略建議（觀察／推測／建議／驗證分欄）。
 */
import ExcelJS from "exceljs";
import type { AnalysisResult, Insight, Stat } from "./report";

export type XlsxJob = {
  id: string;
  target_username: string;
  status: string;
  scraped_count: number;
  scrape_mode: string | null;
  created_at: string;
  finished_at: string | null;
};

export type XlsxPost = {
  post_url?: string | null;
  published_at?: string | null;
  text?: string | null;
  likes?: number | null;
  replies?: number | null;
  reposts?: number | null;
  quotes?: number | null;
  engagement?: number | null;
  engagement_rate?: number | null;
  group_label?: string | null;
  is_outlier?: boolean | null;
  char_count?: number | null;
  post_types?: string[] | null;
  hashtags?: string[] | null;
  mentions?: string[] | null;
};

export type XlsxResult = Pick<AnalysisResult, "summary" | "top_posts" | "insights" | "generator">;

const FONT = "Microsoft JhengHei";
const INK = "FF1F2328";
const MUTED = "FF6B6B66";
const HEADER_FILL = "FF2A78D6"; // 與圖表 --series-1 同色
const BAND_FILL = "FFF4F7FB";
const BORDER = "FFD9DEE5";
const GROUP_LABEL: Record<string, { text: string; color: string }> = {
  high: { text: "高互動", color: "FF1B7F4B" },
  mid: { text: "中互動", color: "FF8A6100" },
  low: { text: "低互動", color: "FFB3261E" },
};
const PRIORITY_FILL: Record<string, string> = { P1: "FFFDE2DD", P2: "FFFFF1D6", P3: "FFEDEFF2" };
const NUM = "#,##0";
const DEC = "#,##0.0";
const PCT = "0.00%";
const DATETIME = "yyyy-mm-dd hh:mm";

/** Excel 沒有時區：把 UTC 時間平移 8 小時，讓儲存格直接顯示台北時間。 */
export function toTaipeiDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : new Date(t + 8 * 3600 * 1000);
}

const thin = { style: "thin" as const, color: { argb: BORDER } };
const BOX = { top: thin, left: thin, bottom: thin, right: thin };

function styleHeader(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell((c) => {
    c.font = { name: FONT, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = BOX;
  });
}

function styleBody(row: ExcelJS.Row, banded: boolean) {
  row.eachCell({ includeEmpty: true }, (c) => {
    c.font = { name: FONT, color: { argb: INK }, ...(c.font ?? {}) };
    c.border = BOX;
    c.alignment = { vertical: "top", ...(c.alignment ?? {}) };
    if (banded) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
  });
}

function title(ws: ExcelJS.Worksheet, text: string, sub?: string) {
  const t = ws.addRow([text]);
  t.font = { name: FONT, size: 16, bold: true, color: { argb: INK } };
  t.height = 26;
  if (sub) ws.addRow([sub]).font = { name: FONT, color: { argb: MUTED } };
  ws.addRow([]);
}

function section(ws: ExcelJS.Worksheet, text: string) {
  ws.addRow([]);
  ws.addRow([text]).font = { name: FONT, size: 12, bold: true, color: { argb: INK } };
}

const statRow = (label: string, s: Stat | undefined, fmt: string, scale = 1) => ({
  label,
  mean: s?.mean != null ? s.mean * scale : null,
  median: s?.median != null ? s.median * scale : null,
  fmt,
});

function overviewSheet(wb: ExcelJS.Workbook, job: XlsxJob, result: XlsxResult | null) {
  const ws = wb.addWorksheet("總覽", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 32 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 16 }];
  const ov = result?.summary.overview;
  const exported = toTaipeiDate(new Date().toISOString());
  title(ws, `@${job.target_username} 貼文互動分析`, "時間皆為台北時間（UTC+8）");

  const info: [string, ExcelJS.CellValue, string?][] = [
    ["顯示名稱", ov?.display_name ?? "—"],
    ["粉絲數", ov?.follower_count ?? "無法取得", NUM],
    ["分析篇數", job.scraped_count, NUM],
    ["貼文期間", ov?.first_post_at && ov?.last_post_at
      ? `${toTaipeiDate(ov.first_post_at)!.toISOString().slice(0, 10)} ～ ${toTaipeiDate(ov.last_post_at)!.toISOString().slice(0, 10)}`
      : "—"],
    ["每週發文", ov?.posts_per_week ?? "—", DEC],
    ["爬取模式", job.scrape_mode === "authenticated" ? "登入模式" : job.scrape_mode === "anonymous" ? "未登入" : "—"],
    ["建議來源", result ? (result.generator.startsWith("rule") ? "規則模板" : `LLM（${result.generator}）`) : "—"],
    ["匯出時間", exported, DATETIME],
  ];
  for (const [k, v, fmt] of info) {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { name: FONT, color: { argb: MUTED } };
    r.getCell(2).font = { name: FONT, bold: true, color: { argb: INK } };
    r.getCell(2).alignment = { horizontal: "left" };
    if (fmt) r.getCell(2).numFmt = fmt;
  }
  if (!ov || !result) return ws;

  section(ws, "互動指標");
  styleHeader(ws.addRow(["指標", "平均", "中位數"]));
  const stats = [
    statRow("按讚", ov.likes, DEC),
    statRow("留言", ov.replies, DEC),
    statRow("轉發", ov.reposts, DEC),
    statRow("引用", ov.quotes, DEC),
    statRow("總互動", ov.engagement, DEC),
    statRow("總互動（排除異常值）", ov.engagement_excl_outliers, DEC),
    statRow("粉絲基準互動率（÷ 爬取時粉絲數）", ov.engagement_rate_pct, PCT, 0.01),
  ];
  stats.forEach((s, i) => {
    const r = ws.addRow([s.label, s.mean ?? "—", s.median ?? "—"]);
    r.getCell(2).numFmt = s.fmt;
    r.getCell(3).numFmt = s.fmt;
    styleBody(r, i % 2 === 1);
  });

  section(ws, `Top ${result.top_posts.items.length} 貼文（${result.top_posts.sort_by === "engagement_rate" ? "依粉絲基準互動率" : "依總互動"}）`);
  styleHeader(ws.addRow(["內容", "發文時間", "按讚", "留言", "總互動", "粉絲基準互動率"]));
  result.top_posts.items.forEach((p, i) => {
    const r = ws.addRow([
      p.post_url ? { text: oneLine(p.text, 40), hyperlink: p.post_url } : oneLine(p.text, 40),
      toTaipeiDate(p.published_at),
      p.likes,
      p.replies,
      p.engagement,
      p.engagement_rate_pct != null ? p.engagement_rate_pct / 100 : null,
    ]);
    r.getCell(1).font = { name: FONT, color: { argb: HEADER_FILL }, underline: true };
    r.getCell(2).numFmt = DATETIME;
    [3, 4, 5].forEach((c) => (r.getCell(c).numFmt = NUM));
    r.getCell(6).numFmt = PCT;
    styleBody(r, i % 2 === 1);
  });

  const lim = result.summary.limitations ?? [];
  if (lim.length) {
    section(ws, "資料限制");
    lim.forEach((l) => {
      const r = ws.addRow([`• ${l}`]);
      ws.mergeCells(r.number, 1, r.number, 6);
      r.getCell(1).alignment = { wrapText: true, vertical: "top" };
      r.getCell(1).font = { name: FONT, color: { argb: MUTED } };
      r.height = 30;
    });
  }
  return ws;
}

function oneLine(text: string | null | undefined, max: number): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t || "（無文字）";
}

const POST_COLUMNS: { header: string; width: number }[] = [
  { header: "發文時間", width: 17 },
  { header: "內容", width: 60 },
  { header: "按讚", width: 9 },
  { header: "留言", width: 9 },
  { header: "轉發", width: 9 },
  { header: "引用", width: 9 },
  { header: "總互動", width: 10 },
  { header: "粉絲基準\n互動率", width: 12 },
  { header: "互動分組", width: 10 },
  { header: "貼文類型", width: 16 },
  { header: "字數", width: 7 },
  { header: "Hashtag", width: 18 },
  { header: "提及帳號", width: 16 },
  { header: "異常值", width: 8 },
  { header: "貼文連結", width: 12 },
];

function postsSheet(wb: ExcelJS.Workbook, posts: XlsxPost[]) {
  const ws = wb.addWorksheet("貼文", { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  ws.columns = POST_COLUMNS.map((c) => ({ width: c.width }));
  const header = ws.addRow(POST_COLUMNS.map((c) => c.header));
  styleHeader(header);
  header.height = 32;

  posts.forEach((p, i) => {
    const group = p.group_label ? GROUP_LABEL[p.group_label] : undefined;
    const r = ws.addRow([
      toTaipeiDate(p.published_at),
      p.text ?? "",
      p.likes ?? null,
      p.replies ?? null,
      p.reposts ?? null,
      p.quotes ?? null,
      p.engagement ?? null,
      p.engagement_rate ?? null,
      group?.text ?? "—",
      (p.post_types ?? []).join("、"),
      p.char_count ?? null,
      (p.hashtags ?? []).map((h) => `#${h}`).join(" "),
      (p.mentions ?? []).map((m) => `@${m}`).join(" "),
      p.is_outlier ? "是" : "",
      p.post_url ? { text: "開啟", hyperlink: p.post_url } : "",
    ]);
    r.getCell(1).numFmt = DATETIME;
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
    [3, 4, 5, 6, 7, 11].forEach((c) => (r.getCell(c).numFmt = NUM));
    r.getCell(8).numFmt = PCT;
    r.getCell(14).alignment = { horizontal: "center" };
    styleBody(r, i % 2 === 1);
    if (group) r.getCell(9).font = { name: FONT, bold: true, color: { argb: group.color } };
    if (p.is_outlier) r.getCell(14).font = { name: FONT, bold: true, color: { argb: "FFB3261E" } };
    if (p.post_url) r.getCell(15).font = { name: FONT, color: { argb: HEADER_FILL }, underline: true };
  });

  const last = posts.length + 1;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: POST_COLUMNS.length } };
  if (posts.length) {
    // 總互動加資料橫條，一眼看出高低
    ws.addConditionalFormatting({
      ref: `G2:G${last}`,
      rules: [{ type: "dataBar", priority: 1, cfvo: [{ type: "min" }, { type: "max" }], color: { argb: "FF9EC5F4" } } as never],
    });
  }
  return ws;
}

function insightsSheet(wb: ExcelJS.Workbook, insights: Insight[]) {
  const ws = wb.addWorksheet("策略建議", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { width: 5 }, { width: 8 }, { width: 26 }, { width: 40 }, { width: 34 }, { width: 34 }, { width: 34 }, { width: 9 },
  ];
  styleHeader(ws.addRow(["#", "優先級", "標題", "觀察（數據）", "推測（原因）", "建議行動", "驗證方法", "時程"]));
  insights.forEach((ins, i) => {
    const r = ws.addRow([i + 1, ins.priority, ins.title, ins.observation, ins.hypothesis, ins.action, ins.validation, ins.timeline]);
    styleBody(r, false);
    r.eachCell((c) => (c.alignment = { wrapText: true, vertical: "top" }));
    r.getCell(1).alignment = { horizontal: "center", vertical: "top" };
    r.getCell(2).alignment = { horizontal: "center", vertical: "top" };
    r.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PRIORITY_FILL[ins.priority] ?? PRIORITY_FILL.P3 } };
    r.getCell(2).font = { name: FONT, bold: true, color: { argb: INK } };
    r.getCell(3).font = { name: FONT, bold: true, color: { argb: INK } };
  });
  return ws;
}

/** 產生 .xlsx；result 為 null（分析未完成）時只輸出總覽與貼文。 */
export async function buildWorkbook(job: XlsxJob, posts: XlsxPost[], result: XlsxResult | null): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Threads Analyzer";
  wb.created = new Date();
  overviewSheet(wb, job, result);
  postsSheet(wb, posts);
  if (result?.insights?.length) insightsSheet(wb, result.insights);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
