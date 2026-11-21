"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export type DeleteAccountState = { error?: string };
export type FormState = { error?: string; message?: string };

const NAME_MAX = 50;

/** 修改顯示名稱（profiles.display_name；RLS 只允許本人更新這一欄）。 */
export async function updateDisplayName(_: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("display_name") ?? "").trim();
  if (!name) return { error: "名稱不能空白" };
  if ([...name].length > NAME_MAX) return { error: `名稱最多 ${NAME_MAX} 個字` };
  const { supabase, user } = await requireUser("/dashboard/account");
  const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", user.id);
  if (error) return { error: "儲存失敗，請稍後再試" };
  revalidatePath("/dashboard", "layout");
  return { message: "已更新名稱" };
}

/** 修改（或第一次設定）密碼。忘記密碼的重設連結登入後也走這裡。 */
export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  if (password.length < 8) return { error: "新密碼至少 8 個字元" };
  if (password !== confirm) return { error: "兩次輸入的新密碼不一致" };
  const { supabase } = await requireUser("/dashboard/account");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "新密碼不能與目前密碼相同" };
    if (error.code === "weak_password") return { error: "密碼強度不足，請使用更長或更複雜的密碼" };
    if (error.code === "reauthentication_needed") return { error: "為了安全，請重新登入後再修改密碼" };
    return { error: "修改失敗，請稍後再試" };
  }
  return { message: "密碼已更新，下次請用新密碼登入" };
}

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
