"""組裝正式環境使用的各階段函式。"""
from __future__ import annotations

from worker.config import Settings
from worker.pipeline import Analyzer, Cleaner, JobContext, JobError, ScrapeResult, Scraper


def default_stages(settings: Settings) -> tuple[Scraper, Cleaner, Analyzer]:
    try:
        from worker.scraper import make_scraper  # T7
    except ImportError:  # pragma: no cover
        def make_scraper(_s):
            def _scrape(job: dict, ctx: JobContext) -> ScrapeResult:
                raise JobError("NOT_READY", "爬蟲尚未實作", keep_partial=False)
            return _scrape

    try:
        from worker.cleaning import clean_posts  # T8
    except ImportError:  # pragma: no cover
        def clean_posts(job, posts):
            return posts

    try:
        from worker.analysis import make_analyzer  # T9–T10a
    except ImportError:  # pragma: no cover
        def make_analyzer(_s):
            def _analyze(job, posts, meta, ctx):
                raise JobError("NOT_READY", "分析尚未實作")
            return _analyze

    return make_scraper(settings), clean_posts, make_analyzer(settings)
