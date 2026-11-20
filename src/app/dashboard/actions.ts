"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ACTIVE_STATUSES, clampMaxPosts, normalizeUsername } from "@/lib/jobs";
import { triggerWorker } from "@/lib/worker-trigger";

export type CreateJobState = { error?: string; target?: string };

/** 建立分析任務（PRD F2、AC2.1–2.3）。 */
export async function createJob(_: CreateJobState, formData: FormData): Promise<CreateJobState> {
  const rawTarget = String(formData.get("target") ?? "");
  const username = normalizeUsername(rawTarget);
  if (!username) return { error: "請輸入有效的 username 或 Threads 網址", target: rawTarget };

  const maxPosts = clampMaxPosts(formData.get("max_posts") ?? 30);
  if (maxPosts === null) return { error: "目標篇數需為 30–100 的整數", target: rawTarget };

  const { supabase } = await requireUser();

  // 重複任務：同帳號已有進行中任務 → 直接導向（E7）
  const { data: existing } = await supabase
    .from("analysis_jobs")
    .select("id")
    .eq("target_username", username)
    .in("status", ACTIVE_STATUSES)
    .limit(1)
    .maybeSingle();
  if (existing) redirect(`/dashboard/jobs/${existing.id}?notice=duplicate`);

  const { data, error } = await supabase
    .from("analysis_jobs")
    .insert({ target_username: username, max_posts: maxPosts })
    .select("id")
    .single();

  if (error) {
    // 併發建立時被唯一索引擋下
    if (error.code === "23505") {
      const { data: dup } = await supabase
        .from("analysis_jobs")
        .select("id")
        .eq("target_username", username)
        .in("status", ACTIVE_STATUSES)
        .limit(1)
        .maybeSingle();
      if (dup) redirect(`/dashboard/jobs/${dup.id}?notice=duplicate`);
    }
    return { error: "建立任務失敗，請稍後再試", target: rawTarget };
  }

  await triggerWorker(data.id);
  revalidatePath("/dashboard");
  redirect(`/dashboard/jobs/${data.id}`);
}

/** 重新觸發 Worker（E9：任務排隊過久）。 */
export async function retriggerJob(jobId: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("analysis_jobs").select("id,status").eq("id", jobId).maybeSingle();
  if (!data || data.status !== "queued") return { ok: false };
  const r = await triggerWorker(jobId);
  return { ok: r.triggered };
}
