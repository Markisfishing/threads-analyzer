import { describe, expect, it } from "vitest";
import { compactNumber, filterJobs, sortJobs, sparkline } from "./job-list";

const p = (d: string, e: number | null) => ({ published_at: `2026-11-${d}T00:00:00Z`, engagement: e });

describe("sparkline", () => {
  it("依時間排序並分段平均", () => {
    expect(sparkline([p("03", 30), p("01", 10), p("02", 20), p("04", 40)], 2)).toEqual([15, 35]);
  });
  it("少於 3 篇不畫、略過缺值", () => {
    expect(sparkline([p("01", 1), p("02", null), p("03", 2)])).toEqual([]);
  });
  it("篇數少於段數時一篇一點", () => {
    expect(sparkline([p("01", 1), p("02", 2), p("03", 3)], 12)).toEqual([1, 2, 3]);
  });
});

const job = (u: string, created: string, rate: number | null, name?: string) => ({
  target_username: u,
  created_at: created,
  display_name: name ?? null,
  stats: { followers: null, avgEngagement: null, ratePct: rate, spark: [] },
});

describe("sortJobs / filterJobs", () => {
  const jobs = [job("a", "2026-11-01", 1), job("b", "2026-11-03", null), job("c", "2026-11-02", 5, "小明")];
  it("建立時間新到舊", () => {
    expect(sortJobs(jobs, "created").map((j) => j.target_username)).toEqual(["b", "c", "a"]);
  });
  it("數值高到低，沒資料排最後", () => {
    expect(sortJobs(jobs, "rate").map((j) => j.target_username)).toEqual(["c", "a", "b"]);
  });
  it("搜尋帳號（可加 @）或顯示名稱", () => {
    expect(filterJobs(jobs, "@A").map((j) => j.target_username)).toEqual(["a"]);
    expect(filterJobs(jobs, "小明").map((j) => j.target_username)).toEqual(["c"]);
    expect(filterJobs(jobs, " ")).toHaveLength(3);
  });
});

describe("compactNumber", () => {
  it("萬為單位", () => {
    expect(compactNumber(1234)).toBe("1,234");
    expect(compactNumber(53100)).toBe("5.3萬");
    expect(compactNumber(1234567)).toBe("123萬");
    expect(compactNumber(null)).toBe("—");
  });
});
