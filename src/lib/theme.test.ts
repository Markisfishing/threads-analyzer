import { describe, expect, it } from "vitest";
import { parsePref, resolveTheme } from "./theme";

describe("parsePref", () => {
  it("只接受 light／dark，其餘一律跟隨系統", () => {
    expect(parsePref("light")).toBe("light");
    expect(parsePref("dark")).toBe("dark");
    for (const v of ["system", null, undefined, "", "DARK", "blue", 1]) expect(parsePref(v)).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("跟隨系統時依系統偏好", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
  it("手動選擇時忽略系統偏好", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
