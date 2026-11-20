import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { isOAuthProvider } from "@/lib/oauth";
import { getEnabledProviders } from "@/lib/oauth-server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/oauth?provider=google&next=/dashboard
 * 產生 PKCE 驗證碼（存在 cookie）並導向 Supabase → Google／Facebook 授權頁。
 * 授權完成後回到 /auth/callback 交換 session。
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const provider = searchParams.get("provider");
  const next = safeNext(searchParams.get("next"));

  if (!isOAuthProvider(provider) || !(await getEnabledProviders()).includes(provider)) {
    return NextResponse.redirect(`${origin}/login?error=oauth_unavailable`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  return NextResponse.redirect(data.url);
}
