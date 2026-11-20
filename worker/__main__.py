"""Worker CLI 入口。

  python -m worker run --job-id <uuid>   執行單一任務（GitHub Actions 使用）
  python -m worker poll                  輪詢 queued 任務（本機開發／備援）
  python -m worker check-config          檢查環境變數
"""
from __future__ import annotations

import argparse
import sys

from worker import __version__
from worker.config import load_settings


def cmd_check_config(_: argparse.Namespace) -> int:
    s = load_settings()
    missing = s.missing_required()
    print(f"SUPABASE_URL           {'✔' if s.supabase_url else '✘'}")
    print(f"SERVICE_ROLE_KEY       {'✔' if s.supabase_service_role_key else '✘'}")
    print(f"GROQ_API_KEY           {'✔' if s.groq_api_key else '✘（將使用規則模板）'}")
    print(f"THREADS_STORAGE_STATE  {'✔' if s.threads_storage_state else '✘（僅未登入模式）'}")
    print(f"SCRAPE_MAX_POSTS       {s.scrape_max_posts}")
    if missing:
        print(f"缺少必填變數：{', '.join(missing)}", file=sys.stderr)
        return 1
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    print(f"[run] job {args.job_id}：尚未實作（T6）", file=sys.stderr)
    return 2


def cmd_poll(_: argparse.Namespace) -> int:
    print("[poll] 尚未實作（T6）", file=sys.stderr)
    return 2


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m worker", description="Threads Analyzer Worker")
    p.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    sub = p.add_subparsers(dest="command", required=True)

    r = sub.add_parser("run", help="執行單一分析任務")
    r.add_argument("--job-id", required=True, help="analysis_jobs.id")
    r.set_defaults(func=cmd_run)

    sub.add_parser("poll", help="輪詢並執行 queued 任務").set_defaults(func=cmd_poll)
    sub.add_parser("check-config", help="檢查環境變數").set_defaults(func=cmd_check_config)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
