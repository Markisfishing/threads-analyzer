"""離線報告：讀取貼文 JSON → Markdown／CSV／JSON。"""
from __future__ import annotations

import csv
import io
import json

import pytest

from tests.worker.sample import raw_posts
from worker.__main__ import main
from worker.offline import analyze_file, load_input, posts_csv


def _write(tmp_path, posts, account=None):
    p = tmp_path / "in.json"
    p.write_text(json.dumps({"account": account or {"username": "sample", "follower_count": 10000},
                             "posts": posts}, ensure_ascii=False), encoding="utf-8")
    return p


def test_report_command_writes_three_files(tmp_path, capsys):
    src = _write(tmp_path, raw_posts(30) + [raw_posts(1)[0]])  # 含一篇重複
    out = tmp_path / "out"
    assert main(["report", "--input", str(src), "--out", str(out)]) == 0
    md = (out / "report.md").read_text(encoding="utf-8")
    for heading in ("## 總覽指標", "## Top 5 貼文", "```mermaid", "## 三群組成敗分析", "## 內容策略觀察與建議", "## 資料限制"):
        assert heading in md
    assert md.count("### ") >= 3  # 至少 3 點建議
    rows = list(csv.DictReader(io.StringIO((out / "posts.csv").read_text(encoding="utf-8-sig"))))
    assert len(rows) == 30  # 重複已移除
    data = json.loads((out / "analysis.json").read_text(encoding="utf-8"))
    assert data["generator"] == "rule_based_v1" and len(data["posts"]) == 30
    assert "raw_json" not in data["posts"][0]


def test_missing_fields_and_bad_input(tmp_path):
    posts = raw_posts(30)
    posts[0]["likes"] = None
    result = analyze_file(_write(tmp_path, posts))
    assert any("欄位缺失" in x for x in result["summary"]["limitations"])
    with pytest.raises(ValueError):
        load_input(_write(tmp_path, [], {"username": "x"}))
    assert main(["report", "--input", str(tmp_path / "nope.json"), "--out", str(tmp_path)]) == 1


def test_csv_guards_formula_injection():
    text = posts_csv([{"post_id": "1", "text": "=HYPERLINK(1)", "post_types": ["純文字", "含連結"]}])
    assert text.startswith("﻿")
    row = next(csv.DictReader(io.StringIO(text[1:])))
    assert row["text"] == "'=HYPERLINK(1)" and row["post_types"] == "純文字|含連結"
