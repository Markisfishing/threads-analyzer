import { describe, expect, it } from "vitest";
import { LOGIN_ERRORS, enabledProviders, isOAuthProvider, oauthErrorCode } from "./oauth";

describe("enabledProviders", () => {
  it("returns supported providers that are enabled, in fixed order", () => {
    const settings = { external: { email: true, facebook: true, github: true, google: true, apple: false } };
    expect(enabledProviders(settings)).toEqual(["google", "facebook"]);
  });
  it("ignores disabled or missing", () => {
    expect(enabledProviders({ external: { email: true, google: false } })).toEqual([]);
    expect(enabledProviders({})).toEqual([]);
    expect(enabledProviders(null)).toEqual([]);
  });
});

describe("isOAuthProvider / oauthErrorCode", () => {
  it("only accepts known providers", () => {
    expect(isOAuthProvider("google")).toBe(true);
    expect(isOAuthProvider("facebook")).toBe(true);
    expect(isOAuthProvider("github")).toBe(false);
    expect(isOAuthProvider(null)).toBe(false);
  });
  it("maps cancel vs failure, both have messages", () => {
    expect(oauthErrorCode("access_denied")).toBe("oauth_cancelled");
    expect(oauthErrorCode("server_error")).toBe("oauth_failed");
    expect(LOGIN_ERRORS[oauthErrorCode("access_denied")]).toBeTruthy();
    expect(LOGIN_ERRORS[oauthErrorCode("x")]).toBeTruthy();
  });
});
