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

export type JobActionResult = { error?: string };

/** 取消進行中任務（F8、AC8.4）。RLS 只允許把自己進行中的任務改為 cancelled。 */
export async function cancelJob(jobId: string): Promise<JobActionResult> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("analysis_jobs")
    .update({ status: "cancelled" })
    .eq("id", jobId)
    .in("status", ACTIVE_STATUSES)
    .select("id");
  if (error || !data?.length) return { error: "無法取消，任務可能已結束" };
  revalidatePath(`/dashboard/jobs/${jobId}`);
  revalidatePath("/dashboard");
  return {};
}

/** 刪除已結束任務，連帶刪除貼文、結果、日誌（F8、AC8.3）。 */
export async function deleteJob(jobId: string): Promise<JobActionResult> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("analysis_jobs").delete().eq("id", jobId).select("id");
  if (error || !data?.length) return { error: "無法刪除，進行中的任務請先取消" };
  revalidatePath("/dashboard");
  redirect("/dashboard?notice=deleted");
}

/** 重跑：建立新任務並指向原任務，保留舊結果（F8、AC8.2）。 */
export async function rerunJob(jobId: string): Promise<JobActionResult> {
  const { supabase } = await requireUser();
  const { data: src } = await supabase
    .from("analysis_jobs")
    .select("id,target_username,max_posts")
    .eq("id", jobId)
    .maybeSingle();
  if (!src) return { error: "找不到原任務" };

  const { data: active } = await supabase
    .from("analysis_jobs")
    .select("id")
    .eq("target_username", src.target_username)
    .in("status", ACTIVE_STATUSES)
    .limit(1)
    .maybeSingle();
  if (active) redirect(`/dashboard/jobs/${active.id}?notice=duplicate`);

  const { data, error } = await supabase
    .from("analysis_jobs")
    .insert({ target_username: src.target_username, max_posts: src.max_posts, parent_job_id: src.id })
    .select("id")
    .single();
  if (error || !data) return { error: "重跑失敗，請稍後再試" };

  await triggerWorker(data.id);
  revalidatePath("/dashboard");
  redirect(`/dashboard/jobs/${data.id}`);
}
