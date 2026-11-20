import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNext } from "@/lib/auth";
import { oauthErrorCode } from "@/lib/oauth";
import { createClient } from "@/lib/supabase/server";

/** 回呼：信箱驗證連結（PKCE code／token_hash）與第三方登入（PKCE code）。 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  // 第三方登入被取消或失敗時，Supabase 帶 error 參數回來
  const oauthError = searchParams.get("error");
  if (oauthError) return NextResponse.redirect(`${origin}/login?error=${oauthErrorCode(oauthError)}`);

  const supabase = await createClient();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  if (ok) return NextResponse.redirect(`${origin}${next}`);
  return NextResponse.redirect(`${origin}/login?error=verify_failed`);
}
