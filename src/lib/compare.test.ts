import { describe, expect, it } from "vitest";
import { buildCompareRows, compareLabels, parseCompareIds, selectionHint, typeShareSeries, type CompareEntry } from "./compare";
import type { Summary } from "./report";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const ids = (n: number) => Array.from({ length: n }, (_, i) => `${i}`.repeat(8) + "-0000-0000-0000-000000000000");

describe("selectionHint / parseCompareIds", () => {
  it("allows 2–4, rejects 1 and 5", () => {
    expect(selectionHint(1)).toMatch(/請勾選/);
    expect(selectionHint(2)).toBeNull();
    expect(selectionHint(4)).toBeNull();
    expect(selectionHint(5)).toMatch(/最多/);
  });
  it("dedupes, keeps order, validates uuid", () => {
    expect(parseCompareIds(`${B},${A},${B}`)).toEqual({ ids: [B, A], error: null });
    expect(parseCompareIds(A).error).toMatch(/請勾選/);
    expect(parseCompareIds(ids(5).join(",")).error).toMatch(/最多/);
    expect(parseCompareIds("x,y").error).toBe("比較網址格式錯誤");
    expect(parseCompareIds(undefined).ids).toEqual([]);
  });
});

function entry(jobId: string, username: string, types: Summary["types"], mean = 10): CompareEntry {
  const stat = { mean, median: mean, n: 30 };
  return {
    jobId,
    username,
    createdAt: "2026-11-20T04:00:00Z",
    status: "completed",
    summary: {
      overview: {
        post_count: 30, follower_count: 100, display_name: null, first_post_at: null, last_post_at: null,
        posts_per_week: 3.5, outlier_count: 0, missing_count: 0, likes: stat, replies: stat, reposts: stat,
        quotes: stat, engagement: stat, engagement_rate_pct: { mean: 1.2, median: 1, n: 30 }, engagement_excl_outliers: stat,
      },
      time: {
        timezone: "Asia/Taipei", weekday: [], hour: [], heatmap: [], most_posted_weekday: null, most_posted_hour: null,
        best_weekday: { label: "週三", count: 5, avg_engagement: 20 }, best_hour: { hour: 21, count: 4, avg_engagement: 30 },
      },
      length: { bins: [], spearman: null, points: [] },
      types,
      keywords: { keywords: [], hashtags: [] },
    },
  };
}

describe("buildCompareRows / typeShareSeries", () => {
  const e1 = entry(A, "foo", [{ type: "純文字", count: 20, share: 0.667, avg_engagement: 5 }, { type: "圖片", count: 10, share: 0.333, avg_engagement: 9 }]);
  const e2 = entry(B, "bar", [{ type: "圖片", count: 30, share: 1, avg_engagement: 3 }], 4);

  it("builds one row per entry with key metrics", () => {
    const [r1, r2] = buildCompareRows([e1, e2]);
    expect(r1).toMatchObject({ label: "@foo", avgEngagement: 10, avgRatePct: 1.2, postsPerWeek: 3.5, topType: "純文字", bestTime: "週三／21 時" });
    expect(r2.topType).toBe("圖片");
  });

  it("aligns type shares across accounts, missing type = 0", () => {
    expect(typeShareSeries([e1, e2])).toEqual([
      { type: "純文字", s0: 66.7, s1: 0 },
      { type: "圖片", s0: 33.3, s1: 100 },
    ]);
  });

  it("disambiguates same username with date", () => {
    expect(compareLabels([{ username: "foo", createdAt: "2026-11-20T04:00:00Z" }, { username: "foo", createdAt: "2026-11-18T04:00:00Z" }]))
      .toEqual(["@foo（11/20）", "@foo（11/18）"]);
  });
});
