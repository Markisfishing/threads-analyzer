import { describe, expect, it } from "vitest";
import { clampMaxPosts, isActive, normalizeUsername } from "./jobs";

describe("normalizeUsername（AC2.1、AC2.2）", () => {
  it.each([
    ["zuck", "zuck"],
    ["@zuck", "zuck"],
    ["  @Zuck  ", "zuck"],
    ["https://www.threads.com/@zuck", "zuck"],
    ["https://threads.net/@zuck", "zuck"],
    ["threads.com/@mark.z_1/post/ABC123", "mark.z_1"],
    ["https://www.threads.com/@zuck?hl=zh-tw", "zuck"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeUsername(input)).toBe(expected);
  });

  it.each(["", "zu ck!", "https://instagram.com/zuck", "a".repeat(31), "@", "zuck/abc"])(
    "拒絕 %j",
    (input) => {
      expect(normalizeUsername(input)).toBeNull();
    },
  );
});

describe("clampMaxPosts", () => {
  it("接受 30–100 的整數", () => {
    expect(clampMaxPosts("30")).toBe(30);
    expect(clampMaxPosts(100)).toBe(100);
  });
  it("拒絕範圍外或非整數", () => {
    expect(clampMaxPosts(29)).toBeNull();
    expect(clampMaxPosts(101)).toBeNull();
    expect(clampMaxPosts("50.5")).toBeNull();
    expect(clampMaxPosts("abc")).toBeNull();
  });
});

describe("isActive", () => {
  it("進行中狀態", () => {
    expect(isActive("queued")).toBe(true);
    expect(isActive("analyzing")).toBe(true);
    expect(isActive("completed")).toBe(false);
  });
});
