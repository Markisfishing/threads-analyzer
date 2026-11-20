"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string; email?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readForm(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    next: String(formData.get("next") ?? ""),
  };
}

/** 將 Supabase 錯誤轉為使用者可讀訊息；不洩漏帳號是否存在（PRD E1）。 */
function loginErrorMessage(code?: string, message?: string) {
  if (code === "email_not_confirmed") return "請先到信箱完成驗證後再登入（找不到信請檢查垃圾郵件匣）";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit")
    return "嘗試次數過多，請稍後再試";
  if (code === "invalid_credentials" || /invalid login/i.test(message ?? "")) return "Email 或密碼錯誤";
  return "登入失敗，請稍後再試";
}

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password, next } = readForm(formData);
  if (!EMAIL_RE.test(email) || !password) return { error: "請輸入 Email 與密碼", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: loginErrorMessage(error.code, error.message), email };

  redirect(safeNext(next));
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password } = readForm(formData);
  if (!EMAIL_RE.test(email)) return { error: "請輸入有效的 Email", email };
  if (password.length < 8) return { error: "密碼至少 8 個字元", email };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) {
    if (error.code === "weak_password") return { error: "密碼強度不足，請使用更長或更複雜的密碼", email };
    if (error.code === "over_email_send_rate_limit") return { error: "驗證信寄送太頻繁，請稍後再試", email };
    return { error: "註冊失敗，請稍後再試", email };
  }
  // 不論 Email 是否已註冊都顯示相同訊息，避免洩漏帳號是否存在
  return { message: "已寄出驗證信，請到信箱點擊連結完成註冊。若幾分鐘內沒收到，請檢查垃圾郵件匣。", email };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
