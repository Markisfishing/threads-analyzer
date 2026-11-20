import { NextResponse } from "next/server";
import { EXPORT_POST_COLUMNS, exportFilename, postsToCsv } from "@/lib/export";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/jobs/:id/export?format=csv|json（PRD F10）
 * 以使用者 session 查詢，RLS 擋住他人任務 → 404（AC10.3）。
 */
export async function GET(request: Request, ctx: RouteContext<"/api/jobs/[id]/export">) {
  const { id } = await ctx.params;
  const format = new URL(request.url).searchParams.get("format") ?? "csv";
  if (format !== "csv" && format !== "json") {
    return NextResponse.json({ error: "format 需為 csv 或 json" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "找不到任務" }, { status: 404 });

  const { data: job } = await supabase
    .from("analysis_jobs")
    .select("id,target_username,status,max_posts,scraped_count,scrape_mode,account_meta,created_at,finished_at")
    .eq("id", id)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: "找不到任務" }, { status: 404 });

  const { data: posts, error } = await supabase
    .from("posts")
    .select(EXPORT_POST_COLUMNS.join(","))
    .eq("job_id", id)
    .order("published_at", { ascending: false });
  if (error) return NextResponse.json({ error: "讀取貼文失敗" }, { status: 500 });

  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };

  if (format === "csv") {
    return new Response(postsToCsv((posts ?? []) as never[]), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(job.target_username, id, "csv")}"`,
      },
    });
  }

  const { data: result } = await supabase
    .from("analysis_results")
    .select("summary,top_posts,groups,insights,generator,created_at")
    .eq("job_id", id)
    .maybeSingle();

  const body = {
    job,
    posts: posts ?? [],
    summary: result?.summary ?? null,
    top_posts: result?.top_posts ?? null,
    groups: result?.groups ?? null,
    insights: result?.insights ?? null,
    generator: result?.generator ?? null,
    exported_at: new Date().toISOString(),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(job.target_username, id, "json")}"`,
    },
  });
}
