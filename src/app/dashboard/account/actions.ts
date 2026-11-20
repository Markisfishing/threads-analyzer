"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export type DeleteAccountState = { error?: string };

/**
 * 刪除自己的帳號（隱私權政策「資料刪除」）。
 * 呼叫資料庫函式 public.delete_my_account()：只能刪除 auth.uid() 本人，
 * 連帶刪除 profiles、analysis_jobs、posts、analysis_results、job_logs（on delete cascade）。
 */
export async function deleteAccount(_: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  if (String(formData.get("confirm") ?? "").trim() !== "刪除") return { error: "請輸入「刪除」確認" };
  const { supabase } = await requireUser("/dashboard/account");
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return { error: "刪除失敗，請稍後再試" };
  // 使用者已不存在，清掉本機 session cookie
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?error=account_deleted");
}
