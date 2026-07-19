"""CV9.E2.S7 (AI-02) — per-conversation isolation in the maintenance loops.

A single poison-pill conversation must not crash the batch or block the
conversations queued behind it, and repeated failures must surface in the
session-maintenance report.
"""

import json
from unittest.mock import MagicMock

import numpy as np

from memory.models import Conversation, ExtractedMemory, Message


def _unit_vector():
    return np.ones(1536, dtype=np.float32) / np.sqrt(1536)


def _patch_pipeline(mocker):
    """Mock embeddings/tasks so extraction is deterministic and offline.

    extract_memories raises for any conversation whose transcript contains
    ``POISON`` and returns a single memory otherwise.
    """
    vec = _unit_vector()
    mocker.patch("memory.services.conversation.generate_embedding", return_value=vec)
    mocker.patch("memory.services.memory.generate_embedding", return_value=vec)
    mocker.patch("memory.intelligence.search.generate_embedding", return_value=vec)
    mocker.patch("memory.services.conversation.extract_tasks", return_value=[])

    def fake_extract(messages, **kwargs):
        if any("POISON" in m.content for m in messages):
            raise RuntimeError("provider down")
        return [ExtractedMemory(title="ok", content="c", memory_type="insight", layer="ego")]

    mocker.patch("memory.services.conversation.extract_memories", side_effect=fake_extract)


def _client(tmp_path):
    from memory import MemoryClient
    from memory.config import default_db_path_for_home

    home = tmp_path / "home"
    home.mkdir()
    return MemoryClient(db_path=default_db_path_for_home(home))


def _ended_conversation(mem, poison=False):
    conv = mem.conversations.start_conversation(interface="cli", journey="mirror")
    marker = "POISON" if poison else "clean"
    for i in range(4):
        mem.conversations.add_message(conv.id, role="user", content=f"{marker} {i}")
    mem.conversations.end_conversation(conv.id, extract=False)
    return conv.id


def _meta(mem, conv_id):
    return json.loads(mem.store.get_conversation(conv_id).metadata or "{}")


class TestExtractPendingIsolation:
    def test_middle_failure_does_not_block_the_rest(self, mocker, tmp_path):
        _patch_pipeline(mocker)
        mem = _client(tmp_path)
        first = _ended_conversation(mem)
        poison = _ended_conversation(mem, poison=True)
        last = _ended_conversation(mem)

        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mem)
        from memory.cli.conversation_logger import extract_pending

        extracted = extract_pending()

        assert extracted == 2
        assert _meta(mem, first).get("extracted") is True
        assert _meta(mem, last).get("extracted") is True
        assert _meta(mem, poison).get("extracted") is not True
        assert _meta(mem, poison).get("extraction_attempts") == 1

    def test_quarantined_conversation_is_skipped_on_the_next_run(self, mocker, tmp_path):
        mocker.patch("memory.services.conversation.EXTRACTION_MAX_ATTEMPTS", 1)
        _patch_pipeline(mocker)
        mem = _client(tmp_path)
        poison = _ended_conversation(mem, poison=True)

        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mem)
        from memory.cli.conversation_logger import extract_pending

        assert extract_pending() == 0  # first run: fails, quarantines
        assert _meta(mem, poison).get("extraction_quarantined") is True
        assert extract_pending() == 0  # second run: not retried
        assert _meta(mem, poison).get("extraction_attempts") == 1


class TestExtractPendingBudget:
    """CV9.E2.S26 (AI-05) — extract_pending caps worst-case startup spend."""

    def _ended_conversations_at(self, mem, n, start="2026-01-01T00:00:00Z"):
        """n eligible conversations with distinct, increasing ended_at timestamps."""
        from datetime import datetime, timedelta

        base = datetime.fromisoformat(start.replace("Z", "+00:00"))
        ids = []
        for i in range(n):
            conv = mem.conversations.start_conversation(interface="cli", journey="mirror")
            for j in range(4):
                mem.conversations.add_message(conv.id, role="user", content=f"clean {j}")
            mem.conversations.end_conversation(conv.id, extract=False)
            ended_at = (base + timedelta(minutes=i)).isoformat().replace("+00:00", "Z")
            mem.store.conn.execute(
                "UPDATE conversations SET ended_at = ? WHERE id = ?", (ended_at, conv.id)
            )
            ids.append(conv.id)
        mem.store.conn.commit()
        return ids

    def test_default_cap_processes_at_most_ten(self, mocker, tmp_path):
        _patch_pipeline(mocker)
        mem = _client(tmp_path)
        self._ended_conversations_at(mem, 15)
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mem)
        from memory.cli.conversation_logger import extract_pending

        extracted = extract_pending()

        assert extracted == 10
        assert mem.store.count_unextracted_conversations() == 5

    def test_second_run_drains_the_carried_over_remainder(self, mocker, tmp_path):
        _patch_pipeline(mocker)
        mem = _client(tmp_path)
        self._ended_conversations_at(mem, 15)
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mem)
        from memory.cli.conversation_logger import extract_pending

        extract_pending()  # first run: 10 processed, 5 carried over
        second = extract_pending()  # second run: drains the remainder

        assert second == 5
        assert mem.store.count_unextracted_conversations() == 0

    def test_processes_all_when_pending_is_exactly_the_cap(self, mocker, tmp_path):
        _patch_pipeline(mocker)
        mem = _client(tmp_path)
        self._ended_conversations_at(mem, 10)
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mem)
        from memory.cli.conversation_logger import extract_pending

        assert extract_pending() == 10
        assert mem.store.count_unextracted_conversations() == 0

    def test_processes_all_when_under_the_cap_regression(self, mocker, tmp_path):
        # Pre-S26 behavior preserved: a small backlog is fully processed in one run.
        _patch_pipeline(mocker)
        mem = _client(tmp_path)
        self._ended_conversations_at(mem, 3)
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mem)
        from memory.cli.conversation_logger import extract_pending

        assert extract_pending() == 3

    def test_explicit_limit_overrides_the_config_default(self, mocker, tmp_path):
        _patch_pipeline(mocker)
        mem = _client(tmp_path)
        self._ended_conversations_at(mem, 5)
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mem)
        from memory.cli.conversation_logger import extract_pending

        assert extract_pending(limit=2) == 2

    def test_config_override_changes_the_default_cap(self, mocker, tmp_path):
        mocker.patch("memory.cli.conversation_logger.MEMORY_MAINTENANCE_MAX_EXTRACTIONS", 3)
        _patch_pipeline(mocker)
        mem = _client(tmp_path)
        self._ended_conversations_at(mem, 5)
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mem)
        from memory.cli.conversation_logger import extract_pending

        assert extract_pending() == 3

    def test_oldest_ended_conversations_processed_first(self, mocker, tmp_path):
        _patch_pipeline(mocker)
        mem = _client(tmp_path)
        ids = self._ended_conversations_at(mem, 5)
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mem)
        from memory.cli.conversation_logger import extract_pending

        extract_pending(limit=2)

        # The two oldest (first created, per _ended_conversations_at's increasing
        # timestamps) are extracted; the rest remain pending.
        assert _meta(mem, ids[0]).get("extracted") is True
        assert _meta(mem, ids[1]).get("extracted") is True
        assert _meta(mem, ids[4]).get("extracted") is not True


class TestCloseStaleOrphansIsolation:
    def test_all_non_active_orphans_close_despite_a_failure(self, mocker, tmp_path):
        _patch_pipeline(mocker)
        mem = _client(tmp_path)

        # Three open, idle, journey-bound orphans; the middle one poisons.
        ids = []
        for poison in (False, True, False):
            conv = mem.conversations.start_conversation(interface="cli", journey="mirror")
            marker = "POISON" if poison else "clean"
            for i in range(4):
                mem.store.add_message(
                    Message(
                        conversation_id=conv.id,
                        role="user",
                        content=f"{marker} {i}",
                        created_at="2020-01-01T00:00:00+00:00",
                    )
                )
            ids.append(conv.id)

        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mem)
        from memory.cli.conversation_logger import close_stale_orphans

        count = close_stale_orphans(threshold_minutes=30)

        assert count == 3
        for conv_id in ids:
            assert mem.store.get_conversation(conv_id).ended_at is not None


class TestSessionMaintenanceReport:
    def test_reports_quarantine_count_when_present(self, mocker):
        for step in (
            "close_stale_orphans",
            "backfill_pi_sessions",
            "retitle_pending_conversations",
            "extract_pending",
        ):
            mocker.patch(f"memory.cli.conversation_logger.{step}", return_value=0)
        mock_mem = MagicMock()
        mock_mem.store.count_quarantined_conversations.return_value = 2
        mock_mem.store.count_conversations_with_extraction_status.return_value = 0
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mock_mem)

        from memory.cli.conversation_logger import session_maintenance

        report = session_maintenance()

        assert "2" in report
        assert "quarantined" in report.lower()

    def test_count_helper_holds_a_live_connection(self, mocker, tmp_path):
        """Regression: the count must survive a real MemoryClient lifecycle.

        Chaining ``.store.count_...()`` on a temporary client closes the
        connection via ``__del__`` before the query runs. A MagicMock cannot
        reproduce this — only a real connection does — so this test opens one.
        """
        from memory import MemoryClient
        from memory.config import default_db_path_for_home

        db = default_db_path_for_home(tmp_path)
        seed = MemoryClient(db_path=db)
        for cid in ("q1", "q2"):
            seed.store.create_conversation(
                Conversation(
                    id=cid,
                    interface="cli",
                    journey="mirror",
                    ended_at="2026-01-01T00:00:00Z",
                    metadata=json.dumps({"extraction_quarantined": True}),
                )
            )
        seed.close()

        mocker.patch(
            "memory.cli.conversation_logger._memory_client",
            side_effect=lambda *_a, **_k: MemoryClient(db_path=db),
        )
        from memory.cli.conversation_logger import _count_quarantined_conversations

        assert _count_quarantined_conversations() == 2

    def test_no_quarantine_line_when_none(self, mocker):
        for step in (
            "close_stale_orphans",
            "backfill_pi_sessions",
            "retitle_pending_conversations",
            "extract_pending",
        ):
            mocker.patch(f"memory.cli.conversation_logger.{step}", return_value=0)
        mock_mem = MagicMock()
        mock_mem.store.count_quarantined_conversations.return_value = 0
        mock_mem.store.count_conversations_with_extraction_status.return_value = 0
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mock_mem)

        from memory.cli.conversation_logger import session_maintenance

        assert "quarantined" not in session_maintenance().lower()

    def test_reports_parse_failed_count_when_present(self, mocker):
        for step in (
            "close_stale_orphans",
            "backfill_pi_sessions",
            "retitle_pending_conversations",
            "extract_pending",
        ):
            mocker.patch(f"memory.cli.conversation_logger.{step}", return_value=0)
        mock_mem = MagicMock()
        mock_mem.store.count_quarantined_conversations.return_value = 0
        mock_mem.store.count_conversations_with_extraction_status.return_value = 3
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mock_mem)

        from memory.cli.conversation_logger import session_maintenance

        report = session_maintenance()
        assert "3" in report
        assert "unreadable model output" in report.lower()
        mock_mem.store.count_conversations_with_extraction_status.assert_called_with("parse_failed")

    def test_no_parse_failed_line_when_none(self, mocker):
        for step in (
            "close_stale_orphans",
            "backfill_pi_sessions",
            "retitle_pending_conversations",
            "extract_pending",
        ):
            mocker.patch(f"memory.cli.conversation_logger.{step}", return_value=0)
        mock_mem = MagicMock()
        mock_mem.store.count_quarantined_conversations.return_value = 0
        mock_mem.store.count_conversations_with_extraction_status.return_value = 0
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mock_mem)

        from memory.cli.conversation_logger import session_maintenance

        assert "unreadable" not in session_maintenance().lower()

    def test_reports_carried_over_count_when_backlog_remains(self, mocker):
        # CV9.E2.S26 (AI-05): after a capped extraction run, the remaining
        # eligible count is reported so a chronic backlog stays visible.
        for step in (
            "close_stale_orphans",
            "backfill_pi_sessions",
            "retitle_pending_conversations",
        ):
            mocker.patch(f"memory.cli.conversation_logger.{step}", return_value=0)
        mocker.patch("memory.cli.conversation_logger.extract_pending", return_value=10)
        mock_mem = MagicMock()
        mock_mem.store.count_quarantined_conversations.return_value = 0
        mock_mem.store.count_conversations_with_extraction_status.return_value = 0
        mock_mem.store.count_unextracted_conversations.return_value = 5
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mock_mem)

        from memory.cli.conversation_logger import session_maintenance

        report = session_maintenance()

        assert "5" in report
        assert "carried over" in report.lower()

    def test_no_carried_over_line_when_backlog_fully_drained(self, mocker):
        for step in (
            "close_stale_orphans",
            "backfill_pi_sessions",
            "retitle_pending_conversations",
        ):
            mocker.patch(f"memory.cli.conversation_logger.{step}", return_value=0)
        mocker.patch("memory.cli.conversation_logger.extract_pending", return_value=3)
        mock_mem = MagicMock()
        mock_mem.store.count_quarantined_conversations.return_value = 0
        mock_mem.store.count_conversations_with_extraction_status.return_value = 0
        mock_mem.store.count_unextracted_conversations.return_value = 0
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mock_mem)

        from memory.cli.conversation_logger import session_maintenance

        assert "carried over" not in session_maintenance().lower()

    def test_carried_over_wording_does_not_collide_with_skipped_or_deferred(self, mocker):
        # Word-collision guard (prompt-engineer, S25 precedent): "skipped" is
        # AI-21's journey-less-conversation vocabulary; "deferred" is
        # session_start_fast's whole-maintenance-deferred vocabulary. The
        # per-conversation carry-over count must use neither.
        for step in (
            "close_stale_orphans",
            "backfill_pi_sessions",
            "retitle_pending_conversations",
        ):
            mocker.patch(f"memory.cli.conversation_logger.{step}", return_value=0)
        mocker.patch("memory.cli.conversation_logger.extract_pending", return_value=10)
        mock_mem = MagicMock()
        mock_mem.store.count_quarantined_conversations.return_value = 0
        mock_mem.store.count_conversations_with_extraction_status.return_value = 0
        mock_mem.store.count_unextracted_conversations.return_value = 5
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mock_mem)

        from memory.cli.conversation_logger import session_maintenance

        report = session_maintenance()
        assert "skipped" not in report.lower()
        assert "deferred" not in report.lower()
