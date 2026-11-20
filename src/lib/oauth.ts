/** 第三方登入（PRD F1、AC1.6–1.9）。純函式，可單元測試。 */

export const OAUTH_PROVIDERS = [
  { id: "google", label: "使用 Google 繼續" },
  { id: "facebook", label: "使用 Facebook 繼續" },
] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]["id"];

export function isOAuthProvider(v: unknown): v is OAuthProvider {
  return OAUTH_PROVIDERS.some((p) => p.id === v);
}

/** 從 Supabase `/auth/v1/settings` 回應取出已啟用、且本站支援的登入方式（維持固定順序）。 */
export function enabledProviders(settings: unknown): OAuthProvider[] {
  const external = (settings as { external?: Record<string, unknown> } | null)?.external ?? {};
  return OAUTH_PROVIDERS.filter((p) => external[p.id] === true).map((p) => p.id);
}

/** callback 收到的錯誤 → 登入頁錯誤代碼。使用者在授權頁按取消為 access_denied。 */
export function oauthErrorCode(error: string | null): "oauth_cancelled" | "oauth_failed" {
  return error === "access_denied" ? "oauth_cancelled" : "oauth_failed";
}

export const LOGIN_ERRORS: Record<string, string> = {
  verify_failed: "驗證連結無效或已過期，請重新登入或註冊",
  oauth_cancelled: "已取消第三方登入",
  oauth_failed: "第三方登入失敗，請稍後再試或改用 Email 登入",
  oauth_unavailable: "此登入方式目前未開放",
  account_deleted: "帳號與所有資料已刪除",
};
