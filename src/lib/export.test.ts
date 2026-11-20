import { describe, expect, it } from "vitest";
import { BOM, EXPORT_POST_COLUMNS, exportFilename, postsToCsv } from "./export";

describe("postsToCsv", () => {
  it("starts with BOM and header, one row per post", () => {
    const csv = postsToCsv([{ post_id: "a" }, { post_id: "b" }]);
    expect(csv.startsWith(BOM)).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe(EXPORT_POST_COLUMNS.join(","));
    expect(lines).toHaveLength(3);
  });

  it("quotes commas, quotes and newlines; keeps Chinese", () => {
    const csv = postsToCsv([{ post_id: "x", text: '你好, "世界"\n第二行' }]);
    expect(csv).toContain('"你好, ""世界""\n第二行"');
  });

  it("joins arrays with | and renders null as empty", () => {
    const csv = postsToCsv([{ post_id: "x", hashtags: ["a", "b"], views: null }]);
    const row = csv.slice(1).split("\r\n")[1].split(",");
    expect(row[EXPORT_POST_COLUMNS.indexOf("hashtags")]).toBe("a|b");
    expect(row[EXPORT_POST_COLUMNS.indexOf("views")]).toBe("");
  });

  it("neutralises spreadsheet formulas in text but not negative numbers", () => {
    const csv = postsToCsv([{ post_id: "x", text: "=HYPERLINK(1)", score: -1 }]);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain(",-1,");
  });
});

describe("exportFilename", () => {
  it("sanitises username", () => {
    expect(exportFilename("a/b c", "12345678-aaaa", "csv")).toBe("threads-a_b_c-12345678.csv");
  });
});
