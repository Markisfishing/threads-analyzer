import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildWorkbook, toTaipeiDate, type XlsxJob, type XlsxResult } from "./export-xlsx";

const job: XlsxJob = {
  id: "11111111-2222-3333-4444-555555555555",
  target_username: "sample",
  status: "completed",
  scraped_count: 2,
  scrape_mode: "authenticated",
  created_at: "2026-11-20T00:00:00Z",
  finished_at: "2026-11-20T00:01:00Z",
};
const stat = (mean: number) => ({ mean, median: mean, n: 2 });
const result = {
  generator: "rule_based_v1",
  summary: {
    overview: {
      post_count: 2, follower_count: 1000, display_name: "Sample", first_post_at: "2026-11-01T01:00:00Z",
      last_post_at: "2026-11-02T01:00:00Z", posts_per_week: 7, outlier_count: 0, missing_count: 0,
      likes: stat(10), replies: stat(2), reposts: stat(1), quotes: stat(0), engagement: stat(13),
      engagement_rate_pct: stat(1.3), engagement_excl_outliers: stat(13),
    },
    limitations: ["曝光數無法取得"],
  },
  top_posts: { sort_by: "engagement_rate", items: [] },
  insights: [{ title: "多用提問", observation: "提問貼文平均留言 5", hypothesis: "降低回覆門檻", action: "每週 3 篇提問",
    validation: "比較 3 週", priority: "P1", timeline: "3 週", source: "rule" }],
} as unknown as XlsxResult;

async function load(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe("buildWorkbook", () => {
  it("產生總覽、貼文、策略建議三個工作表，欄名為中文且格式正確", async () => {
    const wb = await load(await buildWorkbook(job, [
      { post_url: "https://www.threads.com/@sample/post/A", published_at: "2026-11-01T13:30:00Z", text: "=HYPERLINK(1)",
        likes: 1234, replies: 5, reposts: 1, quotes: 0, engagement: 1240, engagement_rate: 0.0124, group_label: "high",
        post_types: ["純文字", "含連結"], hashtags: ["AI"], is_outlier: true },
    ], result));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["總覽", "貼文", "策略建議"]);

    const posts = wb.getWorksheet("貼文")!;
    expect(posts.getRow(1).getCell(1).value).toBe("發文時間");
    expect(posts.getRow(1).getCell(2).value).toBe("內容");
    const row = posts.getRow(2);
    // 台北時間 21:30，以 UTC 欄位存放
    expect((row.getCell(1).value as Date).toISOString()).toBe("2026-11-01T21:30:00.000Z");
    expect(row.getCell(1).numFmt).toBe("yyyy-mm-dd hh:mm");
    expect(row.getCell(2).value).toBe("=HYPERLINK(1)"); // 以文字存放，不會被當成公式
    expect(row.getCell(3).numFmt).toBe("#,##0");
    expect(row.getCell(8).numFmt).toBe("0.00%");
    expect(posts.getRow(1).getCell(8).value).toBe("粉絲基準互動率（互動 ÷ 爬取當下粉絲數）");
    expect(row.getCell(9).value).toBe("高互動");
    expect(row.getCell(10).value).toBe("純文字、含連結");
    expect(row.getCell(14).value).toBe("是");
    expect(row.getCell(15).value).toMatchObject({ hyperlink: "https://www.threads.com/@sample/post/A" });
    expect(posts.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });

    const ins = wb.getWorksheet("策略建議")!;
    expect(ins.getRow(2).getCell(2).value).toBe("P1");
    expect(ins.getRow(2).getCell(4).value).toBe("提問貼文平均留言 5");
  });

  it("分析未完成時只輸出總覽與貼文", async () => {
    const wb = await load(await buildWorkbook(job, [], null));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["總覽", "貼文"]);
  });

  it("總覽與檔案作者寫入分析者；沒有時顯示 —", async () => {
    const rows = (wb: ExcelJS.Workbook) =>
      wb.getWorksheet("總覽")!.getSheetValues().map((r) => (Array.isArray(r) ? r.slice(1, 3) : []));
    const named = await load(await buildWorkbook(job, [], null, "小明"));
    expect(rows(named)).toContainEqual(["分析者", "小明"]);
    expect(named.creator).toBe("小明");
    expect(rows(await load(await buildWorkbook(job, [], null)))).toContainEqual(["分析者", "—"]);
  });

  it("toTaipeiDate 處理空值與無效日期", () => {
    expect(toTaipeiDate(null)).toBeNull();
    expect(toTaipeiDate("not-a-date")).toBeNull();
  });
});
