"""Unit tests for evals.persistence (CV9.E2.S19 / AI-11)."""

import json

import pytest
from evals.persistence import EvalRunRecord, append_run, history_path, read_history

pytestmark = pytest.mark.unit


def _record(eval_name: str = "x", **overrides) -> EvalRunRecord:
    base = {
        "eval_name": eval_name,
        "started_at": "2026-07-17T00:00:00+00:00",
        "ended_at": "2026-07-17T00:00:01+00:00",
        "model": "some/model",
        "prompt_hash": "abc123",
        "score": 1.0,
        "threshold": 0.8,
        "passed": True,
        "probes": [{"id": "p1", "passed": True, "notes": "ok"}],
    }
    base.update(overrides)
    return EvalRunRecord(**base)


class TestHistoryPath:
    def test_uses_mirror_home_when_resolvable(self, mocker, tmp_path):
        mocker.patch("evals.persistence.resolve_mirror_home", return_value=tmp_path)
        path = history_path("myeval")
        assert path == tmp_path / "eval-history" / "myeval.jsonl"

    def test_falls_back_when_no_mirror_home(self, mocker):
        mocker.patch(
            "evals.persistence.resolve_mirror_home", side_effect=ValueError("not configured")
        )
        path = history_path("myeval")
        assert path.name == "myeval.jsonl"
        assert ".history" in path.parts


class TestAppendRun:
    def test_appends_one_json_line(self, mocker, tmp_path):
        mocker.patch("evals.persistence.resolve_mirror_home", return_value=tmp_path)
        append_run(_record())
        lines = (tmp_path / "eval-history" / "x.jsonl").read_text().splitlines()
        assert len(lines) == 1
        assert json.loads(lines[0])["eval_name"] == "x"

    def test_two_calls_produce_two_lines_first_unmodified(self, mocker, tmp_path):
        mocker.patch("evals.persistence.resolve_mirror_home", return_value=tmp_path)
        append_run(_record(score=0.5))
        append_run(_record(score=0.9))
        lines = (tmp_path / "eval-history" / "x.jsonl").read_text().splitlines()
        assert len(lines) == 2
        assert json.loads(lines[0])["score"] == 0.5
        assert json.loads(lines[1])["score"] == 0.9

    def test_write_failure_does_not_raise(self, mocker, tmp_path):
        mocker.patch("evals.persistence.resolve_mirror_home", return_value=tmp_path)
        mocker.patch("pathlib.Path.open", side_effect=OSError("disk full"))
        append_run(_record())  # must not raise

    def test_schema_version_defaults_to_one(self, mocker, tmp_path):
        mocker.patch("evals.persistence.resolve_mirror_home", return_value=tmp_path)
        append_run(_record())
        line = (tmp_path / "eval-history" / "x.jsonl").read_text().splitlines()[0]
        assert json.loads(line)["schema_version"] == 1


class TestReadHistory:
    def test_missing_file_returns_empty_list(self, mocker, tmp_path):
        mocker.patch("evals.persistence.resolve_mirror_home", return_value=tmp_path)
        assert read_history("nope") == []

    def test_reads_back_appended_records_newest_first(self, mocker, tmp_path):
        mocker.patch("evals.persistence.resolve_mirror_home", return_value=tmp_path)
        append_run(_record(score=0.5))
        append_run(_record(score=0.9))
        records = read_history("x")
        assert [r.score for r in records] == [0.9, 0.5]

    def test_tolerates_malformed_trailing_line(self, mocker, tmp_path):
        mocker.patch("evals.persistence.resolve_mirror_home", return_value=tmp_path)
        append_run(_record(score=0.5))
        path = tmp_path / "eval-history" / "x.jsonl"
        with path.open("a") as f:
            f.write("{not valid json\n")
        records = read_history("x")
        assert len(records) == 1
        assert records[0].score == 0.5

    def test_limit_returns_only_most_recent(self, mocker, tmp_path):
        mocker.patch("evals.persistence.resolve_mirror_home", return_value=tmp_path)
        for s in (0.1, 0.2, 0.3, 0.4, 0.5):
            append_run(_record(score=s))
        records = read_history("x", limit=2)
        assert [r.score for r in records] == [0.5, 0.4]

    def test_prompt_free_record_round_trips_none_hash(self, mocker, tmp_path):
        mocker.patch("evals.persistence.resolve_mirror_home", return_value=tmp_path)
        append_run(_record(model=None, prompt_hash=None))
        records = read_history("x")
        assert records[0].model is None
        assert records[0].prompt_hash is None
