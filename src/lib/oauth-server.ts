import "server-only";
import { enabledProviders, type OAuthProvider } from "./oauth";

/**
 * 讀取 Supabase 已啟用的第三方登入。只顯示後台已設定好的按鈕，避免使用者點到未啟用的登入方式。
 * 結果快取 5 分鐘；查詢失敗時不顯示任何第三方按鈕（Email 登入不受影響）。
 */
export async function getEnabledProviders(): Promise<OAuthProvider[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    return enabledProviders(await res.json());
  } catch {
    return [];
  }
}
