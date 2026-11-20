import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** 取得目前登入使用者；未登入則導向登入頁（資料存取層的唯一入口）。 */
export async function requireUser(nextPath = "/dashboard") {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return { supabase, user: data.user };
}

/** 只允許站內相對路徑，避免 open redirect。 */
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
