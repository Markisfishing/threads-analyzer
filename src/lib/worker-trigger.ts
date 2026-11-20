import "server-only";

/**
 * 觸發 GitHub Actions Worker（PRD D5、F2 步驟 4）。
 * 未設定 GITHUB_DISPATCH_TOKEN 時不觸發，任務維持 queued，由本機 `python -m worker poll` 處理（E9）。
 */
export async function triggerWorker(jobId: string): Promise<{ triggered: boolean; error?: string }> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const workflow = process.env.GITHUB_WORKFLOW_FILE || "worker.yml";
  const ref = process.env.GITHUB_WORKFLOW_REF || "main";
  if (!token || !repo) return { triggered: false, error: "not_configured" };

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref, inputs: { job_id: jobId } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 204 || res.ok) return { triggered: true };
    return { triggered: false, error: `github_${res.status}` };
  } catch {
    return { triggered: false, error: "network" };
  }
}
