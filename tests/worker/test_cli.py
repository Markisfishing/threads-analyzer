import pytest

from worker.__main__ import build_parser, main
from worker.config import load_settings


def test_help_lists_commands(capsys):
    with pytest.raises(SystemExit) as e:
        main(["--help"])
    assert e.value.code == 0
    out = capsys.readouterr().out
    for cmd in ("run", "poll", "check-config"):
        assert cmd in out


def test_run_requires_job_id():
    with pytest.raises(SystemExit):
        build_parser().parse_args(["run"])


def test_settings_defaults(monkeypatch):
    for k in ("SCRAPE_MAX_POSTS", "HEADLESS", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        monkeypatch.delenv(k, raising=False)
    s = load_settings(env_file=None)
    assert s.scrape_max_posts == 30
    assert s.headless is True
    assert s.missing_required() == ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]


def test_settings_from_env(monkeypatch):
    monkeypatch.setenv("SCRAPE_MAX_POSTS", "50")
    monkeypatch.setenv("HEADLESS", "false")
    s = load_settings(env_file=None)
    assert s.scrape_max_posts == 50
    assert s.headless is False
