"""從環境變數讀取 Worker 設定。變數說明見 .env.example 與 PRD §7。"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _load_dotenv(path: Path) -> None:
    """簡易 .env 載入：不覆蓋已存在的環境變數。"""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    return int(raw) if raw else default


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_service_role_key: str
    groq_api_key: str
    groq_model: str
    llm_timeout_sec: int
    threads_storage_state: str  # base64 編碼的 storageState JSON，可為空
    scrape_max_posts: int
    scrape_delay_ms_min: int
    scrape_delay_ms_max: int
    scrape_timeout_sec: int
    scrape_max_retries: int
    worker_poll_interval_sec: int
    headless: bool

    def missing_required(self) -> list[str]:
        """回傳執行任務必填但未設定的變數名稱。"""
        required = {
            "SUPABASE_URL": self.supabase_url,
            "SUPABASE_SERVICE_ROLE_KEY": self.supabase_service_role_key,
        }
        return [k for k, v in required.items() if not v]


def load_settings(env_file: Path | None = Path(".env")) -> Settings:
    if env_file is not None:
        _load_dotenv(env_file)
    e = os.environ.get
    return Settings(
        supabase_url=e("SUPABASE_URL", ""),
        supabase_service_role_key=e("SUPABASE_SERVICE_ROLE_KEY", ""),
        groq_api_key=e("GROQ_API_KEY", ""),
        groq_model=e("GROQ_MODEL", ""),
        llm_timeout_sec=_int("LLM_TIMEOUT_SEC", 20),
        threads_storage_state=e("THREADS_STORAGE_STATE", ""),
        scrape_max_posts=_int("SCRAPE_MAX_POSTS", 30),
        scrape_delay_ms_min=_int("SCRAPE_DELAY_MS_MIN", 1500),
        scrape_delay_ms_max=_int("SCRAPE_DELAY_MS_MAX", 3000),
        scrape_timeout_sec=_int("SCRAPE_TIMEOUT_SEC", 600),
        scrape_max_retries=_int("SCRAPE_MAX_RETRIES", 3),
        worker_poll_interval_sec=_int("WORKER_POLL_INTERVAL_SEC", 5),
        headless=e("HEADLESS", "true").lower() != "false",
    )
