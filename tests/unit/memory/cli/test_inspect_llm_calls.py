"""Unit tests for `python -m memory inspect llm-calls`."""

import pytest

from memory.client import MemoryClient
from memory.config import default_db_path_for_home

pytestmark = pytest.mark.unit


def _seed_db(tmp_path) -> tuple[MemoryClient, str]:
    """Create a temp DB with three llm_calls rows; return (client, mirror_home)."""
    mirror_home = tmp_path / ".mirror" / "testuser"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)

    # Insert a conversation so the FK is valid for the extraction rows.
    mem.store.conn.execute(
        "INSERT INTO conversations (id, started_at, interface) VALUES (?, ?, ?)",
        ("conv-abc123", "2026-01-01T10:00:00Z", "pi"),
    )
    mem.store.conn.commit()

    mem.store.log_llm_call(
        role="extraction",
        model="google/gemini-2.5-flash-lite",
        prompt="extract from this conversation",
        response_text='[{"title":"Test","content":"C","memory_type":"insight","layer":"ego","tags":[]}]',
        prompt_tokens=150,
        completion_tokens=40,
        latency_ms=820,
        conversation_id="conv-abc123",
    )
    mem.store.log_llm_call(
        role="task_extraction",
        model="google/gemini-2.5-flash-lite",
        prompt="extract tasks from transcript",
        response_text="[]",
        prompt_tokens=80,
        completion_tokens=5,
        latency_ms=310,
        conversation_id="conv-abc123",
    )
    mem.store.log_llm_call(
        role="journal_classification",
        model="google/gemini-2.5-flash-lite",
        prompt="classify this journal entry",
        response_text='{"title":"J","layer":"ego","tags":[]}',
        prompt_tokens=60,
        completion_tokens=15,
        latency_ms=440,
    )
    return mem, str(mirror_home)


class TestInspectLlmCallsOutput:
    def test_shows_header_with_row_count(self, tmp_path, capsys):
        _, mirror_home = _seed_db(tmp_path)
        from memory.cli.inspect import cmd_inspect_llm_calls

        cmd_inspect_llm_calls(["--mirror-home", mirror_home])
        out = capsys.readouterr().out
        assert "llm_calls" in out
        assert "3" in out

    def test_shows_role_in_output(self, tmp_path, capsys):
        _, mirror_home = _seed_db(tmp_path)
        from memory.cli.inspect import cmd_inspect_llm_calls

        cmd_inspect_llm_calls(["--mirror-home", mirror_home])
        out = capsys.readouterr().out
        assert "extraction" in out

    def test_shows_model_in_output(self, tmp_path, capsys):
        _, mirror_home = _seed_db(tmp_path)
        from memory.cli.inspect import cmd_inspect_llm_calls

        cmd_inspect_llm_calls(["--mirror-home", mirror_home])
        out = capsys.readouterr().out
        assert "gemini" in out

    def test_shows_token_counts(self, tmp_path, capsys):
        _, mirror_home = _seed_db(tmp_path)
        from memory.cli.inspect import cmd_inspect_llm_calls

        cmd_inspect_llm_calls(["--mirror-home", mirror_home])
        out = capsys.readouterr().out
        assert "150" in out

    def test_shows_latency(self, tmp_path, capsys):
        _, mirror_home = _seed_db(tmp_path)
        from memory.cli.inspect import cmd_inspect_llm_calls

        cmd_inspect_llm_calls(["--mirror-home", mirror_home])
        out = capsys.readouterr().out
        assert "820ms" in out

    def test_shows_prompt_snippet(self, tmp_path, capsys):
        _, mirror_home = _seed_db(tmp_path)
        from memory.cli.inspect import cmd_inspect_llm_calls

        cmd_inspect_llm_calls(["--mirror-home", mirror_home])
        out = capsys.readouterr().out
        assert "extract from this conversation" in out

    def test_shows_response_snippet(self, tmp_path, capsys):
        _, mirror_home = _seed_db(tmp_path)
        from memory.cli.inspect import cmd_inspect_llm_calls

        cmd_inspect_llm_calls(["--mirror-home", mirror_home])
        out = capsys.readouterr().out
        assert "insight" in out

    def test_empty_result_prints_no_rows_message(self, tmp_path, capsys):
        _, mirror_home = _seed_db(tmp_path)
        from memory.cli.inspect import cmd_inspect_llm_calls

        cmd_inspect_llm_calls(["--mirror-home", mirror_home, "--role", "nonexistent"])
        out = capsys.readouterr().out
        assert "no llm_calls rows" in out

    def test_singular_row_label(self, tmp_path, capsys):
        _, mirror_home = _seed_db(tmp_path)
        from memory.cli.inspect import cmd_inspect_llm_calls

        cmd_inspect_llm_calls(["--mirror-home", mirror_home, "--limit", "1"])
        out = capsys.readouterr().out
        assert "1 row)" in out

    def test_plural_rows_label(self, tmp_path, capsys):
        _, mirror_home = _seed_db(tmp_path)
        from memory.cli.inspect import cmd_inspect_llm_calls

        cmd_inspect_llm_calls(["--mirror-home", mirror_home])
        out = capsys.readouterr().out
        assert "rows)" in out


class TestInspectLlmCallsFilters:
    def test_role_filter_limits_to_matching_role(self, tmp_path, capsys):
        _, mirror_home = _seed_db(tmp_path)
        from memory.cli.inspect import cmd_inspect_llm_calls

        cmd_inspect_llm_calls(["--mirror-home", mirror_home, "--role", "task_extraction"])
        out = capsys.readouterr().out
        assert "task_extraction" in out
        assert "journal_classification" not in out

    def test_role_filter_journal_classification(self, tmp_path, capsys):
        _, mirror_home = _seed_db(tmp_path)
        from memory.cli.inspect import cmd_inspect_llm_calls

        cmd_inspect_llm_calls(["--mirror-home", mirror_home, "--role", "journal_classification"])
        out = capsys.readouterr().out
        assert "journal_classification" in out
        assert "task_extraction" not in out

    def test_limit_restricts_row_count(self, tmp_path, capsys):
        _, mirror_home = _seed_db(tmp_path)
        from memory.cli.inspect import cmd_inspect_llm_calls

        cmd_inspect_llm_calls(["--mirror-home", mirror_home, "--limit", "1"])
        out = capsys.readouterr().out
        assert "1 row)" in out

    def test_conversation_filter(self, tmp_path, capsys):
        _, mirror_home = _seed_db(tmp_path)
        from memory.cli.inspect import cmd_inspect_llm_calls

        cmd_inspect_llm_calls(["--mirror-home", mirror_home, "--conversation", "conv-abc123"])
        out = capsys.readouterr().out
        assert "conv-abc" in out

    def test_since_filter_excludes_older_rows(self, tmp_path, capsys):
        _, mirror_home = _seed_db(tmp_path)
        from memory.cli.inspect import cmd_inspect_llm_calls

        # All rows are from 2026-01-01; filtering from 2030 should exclude all.
        cmd_inspect_llm_calls(["--mirror-home", mirror_home, "--since", "2030-01-01"])
        out = capsys.readouterr().out
        assert "no llm_calls rows" in out


class TestInspectLlmCallsCost:
    def test_shows_estimated_cost_when_present(self, tmp_path, capsys):
        mem, mirror_home = _seed_db(tmp_path)
        mem.store.log_llm_call(
            role="extraction",
            model="google/gemini-2.5-flash-lite",
            prompt="",
            response_text="",
            prompt_tokens=1000,
            completion_tokens=1000,
            latency_ms=100,
            cost_usd=0.00050,
        )
        from memory.cli.inspect import cmd_inspect_llm_calls

        cmd_inspect_llm_calls(["--mirror-home", mirror_home])
        out = capsys.readouterr().out
        assert "0.0005" in out  # estimated cost is rendered

    def test_renders_dash_when_cost_missing(self, tmp_path, capsys):
        # The seeded rows carry NULL cost_usd.
        _, mirror_home = _seed_db(tmp_path)
        from memory.cli.inspect import cmd_inspect_llm_calls

        cmd_inspect_llm_calls(["--mirror-home", mirror_home])
        out = capsys.readouterr().out
        assert "$—" in out
