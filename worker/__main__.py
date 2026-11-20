"""Worker CLI 入口。

  python -m worker run --job-id <uuid>   執行單一任務（GitHub Actions 使用）
  python -m worker poll [--once]         輪詢 queued 任務（本機開發／備援）
  python -m worker mark-crashed --job-id <uuid>  執行失敗時標記任務（GitHub Actions if: failure()）
  python -m worker check-config          檢查環境變數
"""
from __future__ import annotations

import argparse
import logging
import sys
import time

from worker import __version__
from worker.config import Settings, load_settings


def _setup_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)


def _store(s: Settings):
    from worker.db import SupabaseStore

    return SupabaseStore(s.supabase_url, s.supabase_service_role_key)


def _require(s: Settings) -> bool:
    missing = s.missing_required()
    if missing:
        print(f"缺少必填變數：{', '.join(missing)}", file=sys.stderr)
        return False
    return True


def cmd_check_config(_: argparse.Namespace) -> int:
    s = load_settings()
    print(f"SUPABASE_URL           {'✔' if s.supabase_url else '✘'}")
    print(f"SERVICE_ROLE_KEY       {'✔' if s.supabase_service_role_key else '✘'}")
    print(f"GROQ_API_KEY           {'✔' if s.groq_api_key else '✘（將使用規則模板）'}")
    print(f"THREADS_STORAGE_STATE  {'✔' if s.threads_storage_state else '✘（僅未登入模式）'}")
    print(f"SCRAPE_MAX_POSTS       {s.scrape_max_posts}")
    return 0 if _require(s) else 1


def cmd_run(args: argparse.Namespace) -> int:
    from worker.pipeline import run_job
    from worker.stages import default_stages

    _setup_logging()
    s = load_settings()
    if not _require(s):
        return 1
    store = _store(s)
    job = store.claim_job(args.job_id)
    if job is None:
        logging.warning("任務 %s 不存在或已被領取，略過", args.job_id)
        return 0
    if args.run_url:
        store.update_job(job["id"], run_url=args.run_url)
    scrape, clean, analyze = default_stages(s)
    final = run_job(store, job, scrape=scrape, clean=clean, analyze=analyze)
    return 0 if final in ("completed", "partial", "cancelled") else 3


def cmd_mark_crashed(args: argparse.Namespace) -> int:
    _setup_logging()
    s = load_settings()
    if not _require(s):
        return 1
    changed = _store(s).mark_crashed(args.job_id, args.run_url)
    logging.info("任務 %s %s", args.job_id, "已標記為 WORKER_CRASHED" if changed else "已是終態，未變更")
    return 0


def cmd_poll(args: argparse.Namespace) -> int:
    from worker.pipeline import run_job
    from worker.stages import default_stages

    _setup_logging()
    s = load_settings()
    if not _require(s):
        return 1
    store = _store(s)
    scrape, clean, analyze = default_stages(s)
    logging.info("輪詢模式啟動，每 %s 秒檢查一次（Ctrl+C 結束）", s.worker_poll_interval_sec)
    loops = 0
    try:
        while True:
            if loops % 12 == 0:
                n = store.reset_zombies()
                if n:
                    logging.warning("已重設 %d 個中斷任務", n)
            loops += 1
            job = store.claim_next()
            if job:
                run_job(store, job, scrape=scrape, clean=clean, analyze=analyze)
                continue
            if args.once:
                return 0
            time.sleep(s.worker_poll_interval_sec)
    except KeyboardInterrupt:
        logging.info("輪詢結束")
        return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m worker", description="Threads Analyzer Worker")
    p.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    sub = p.add_subparsers(dest="command", required=True)

    r = sub.add_parser("run", help="執行單一分析任務")
    r.add_argument("--job-id", required=True, help="analysis_jobs.id")
    r.add_argument("--run-url", default="", help="GitHub Actions 執行頁網址（選填）")
    r.set_defaults(func=cmd_run)

    pl = sub.add_parser("poll", help="輪詢並執行 queued 任務")
    pl.add_argument("--once", action="store_true", help="處理完目前排隊的任務就結束")
    pl.set_defaults(func=cmd_poll)

    mc = sub.add_parser("mark-crashed", help="Worker 執行失敗時把未結束的任務標記為失敗")
    mc.add_argument("--job-id", required=True)
    mc.add_argument("--run-url", default="")
    mc.set_defaults(func=cmd_mark_crashed)

    sub.add_parser("check-config", help="檢查環境變數").set_defaults(func=cmd_check_config)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
