"""測試共用：讀取 Supabase 設定、以 admin API 建立／刪除測試使用者。"""
from __future__ import annotations

import os
import secrets
import uuid
from dataclasses import dataclass
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]


def read_env(path: Path) -> dict[str, str]:
    """讀單一 .env 檔（不寫入 os.environ，避免 .env 與 .env.local 的佔位值互相覆蓋）。"""
    out: dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out


_worker_env = read_env(ROOT / ".env")
_web_env = read_env(ROOT / ".env.local")

URL = (os.environ.get("SUPABASE_URL") or _worker_env.get("SUPABASE_URL", "")).rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or _worker_env.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANON_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or _web_env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
REST = f"{URL}/rest/v1"

CONFIGURED = bool(URL and SERVICE_KEY and ANON_KEY) and "your-" not in ANON_KEY


def admin_headers() -> dict:
    if SERVICE_KEY.startswith("eyJ"):  # 舊版 JWT service_role key
        return {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
    return {"apikey": SERVICE_KEY}


def user_headers(token: str | None) -> dict:
    h = {"apikey": ANON_KEY}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


@dataclass
class SbUser:
    id: str
    email: str
    password: str
    token: str

    @property
    def h(self) -> dict:
        return user_headers(self.token)


def create_user(client: httpx.Client, prefix: str = "test") -> SbUser:
    email = f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"
    password = secrets.token_urlsafe(24)
    r = client.post(f"{URL}/auth/v1/admin/users", headers=admin_headers(),
                    json={"email": email, "password": password, "email_confirm": True})
    r.raise_for_status()
    uid = r.json()["id"]
    r = client.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": ANON_KEY},
                    json={"email": email, "password": password})
    r.raise_for_status()
    return SbUser(uid, email, password, r.json()["access_token"])


def delete_user(client: httpx.Client, user_id: str) -> None:
    client.delete(f"{URL}/auth/v1/admin/users/{user_id}", headers=admin_headers())
