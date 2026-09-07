"""Extraction-lifecycle write-parity probes (CV22.DS7.US10 slice F).

The Python CLI has no replay transport: its close tail either goes live
through OPENROUTER_API_KEY or fails. So the only way to compare a TypeScript
close tail against Python on the same starting state is in-process, with both
cores' model calls answered by the same stub. That is what these probes do,
on a copy of a real database, never against the live one:

  * ``close_tail`` -- ``end_conversation(extract=True)`` on a seeded
    conversation: extraction (one memory, one task), the summary embedding,
    the ledger, then close-time finalization;
  * ``session_composites`` -- ``session_maintenance`` over a seeded mix of a
    stale orphan, a poison-pill orphan, a retitle candidate, a pending
    extraction, and a conversation bound to an active session, graded as the
    full row state plus the report with its timings normalized;
  * ``journey_repair_apply`` -- the dry run, then ``--apply``, graded as
    findings plus before/after journey columns.

Rows created by the operation (memories, tasks, ledger rows) get random ids
in Python, so they are keyed by content (title) or by insertion order
(``rowid``), which additionally grades the ledger's call ORDER. Embedding
blobs are compared by SHA-256.

Stubs: ``send_to_model`` is answered by prompt prefix, ``generate_embedding``
returns a fixed vector, and ``_now()`` is frozen; OPENROUTER_API_KEY is
irrelevant because no provider path is reachable.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
import sqlite3
from contextlib import contextmanager, redirect_stdout
from pathlib import Path

import numpy as np

import memory.models as models_mod
from memory.config import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, db_path_for_home
from memory.intelligence import extraction as extraction_module
from memory.intelligence import prompts
from memory.intelligence.llm_router import LLMResponse
from memory.models import Conversation, Message
from memory.services import conversation as conversation_module

# ---- the shared stub replies (mirrored by the TypeScript verifier) ---------

STUB_MODEL = "fixture-model"
STUB_PROMPT_TOKENS = 11
STUB_COMPLETION_TOKENS = 7
STUB_LATENCY_MS = 3
EMBEDDING_VALUE = 0.25
POISON_MARKER = "POISON"
STUB_MEMORY = {
    "title": "Write-parity probe memory",
    "content": "The close tail persisted this memory through the stubbed extraction call.",
    "context": "Recorded by the write-parity harness.",
    "memory_type": "insight",
    "layer": "ego",
    "tags": ["parity", "probe"],
}
STUB_TASK = {
    "title": "Write-parity probe task",
    "due_date": "2026-06-30",
    "stage": "Probe",
    "context": "from the write-parity harness",
}
STUB_REPLIES = {
    "extraction": json.dumps([STUB_MEMORY]),
    "task_extraction": json.dumps([STUB_TASK]),
    "curation": "[]",
    "conversation_title": "A parity title",
    "conversation_tags": '["parity", "probe"]',
    "conversation_summary": "A parity summary.",
    "summary": "A parity summary.",
}

PROBE_JOURNEY = "demo-root-active"
NOW_MARKER = "<now>"


class _Response:
    def __init__(self, content: str, prompt: str) -> None:
        self.content = content
        self.model = STUB_MODEL
        self.prompt = prompt
        self.prompt_tokens = STUB_PROMPT_TOKENS
        self.completion_tokens = STUB_COMPLETION_TOKENS
        self.latency_ms = STUB_LATENCY_MS
        self.total_cost = None
        self.generation_id = None


def _surface_of(prompt: str) -> str:
    for name, surface in (
        ("EXTRACTION_PROMPT", "extraction"),
        ("TASK_EXTRACTION_PROMPT", "task_extraction"),
        ("CURATION_PROMPT", "curation"),
        ("CONVERSATION_TITLE_PROMPT", "conversation_title"),
        ("CONVERSATION_TAGS_PROMPT", "conversation_tags"),
        ("CONVERSATION_SUMMARY_PROMPT", "conversation_summary"),
    ):
        if prompt.startswith(getattr(prompts, name)):
            return surface
    return "summary"


def _fake_send_to_model(model, messages, **kwargs):
    prompt = messages[0]["content"]
    surface = _surface_of(prompt)
    if surface == "extraction" and POISON_MARKER in prompt:
        raise RuntimeError("provider rejected the transcript")
    return _Response(STUB_REPLIES[surface], prompt)


def _fake_generate_embedding(text: str, *, attempts: int = 3, on_llm_call=None):
    """The real `generate_embedding` fires one ledger callback per round-trip
    (`_log_embedding_call`); a stub that skipped it would hide the embedding
    rows Python writes in production. The stubbed provider reports no usage,
    so the row lands unpriced with prompt_tokens=None, exactly as a real
    provider response without usage would."""
    if on_llm_call is not None:
        on_llm_call(
            LLMResponse(
                model=EMBEDDING_MODEL,
                content="",
                prompt_tokens=None,
                latency_ms=0,
                prompt=text,
            )
        )
    return np.full(EMBEDDING_DIMENSIONS, EMBEDDING_VALUE, dtype=np.float32)


@contextmanager
def lifecycle_stubs(frozen_datetime):
    """Freeze the clock and answer every model and embedding call offline."""
    original_datetime = models_mod.datetime
    original_send = extraction_module.send_to_model
    original_embed = conversation_module.generate_embedding
    models_mod.datetime = frozen_datetime
    extraction_module.send_to_model = _fake_send_to_model
    conversation_module.generate_embedding = _fake_generate_embedding
    try:
        yield
    finally:
        models_mod.datetime = original_datetime
        extraction_module.send_to_model = original_send
        conversation_module.generate_embedding = original_embed


# ---- seeding (applied to the SEED database, before either copy) -------------


def _seed_conversation(
    store,
    conversation_id: str,
    *,
    journey: str | None,
    title: str | None,
    metadata: str | None,
    started_at: str,
    ended_at: str | None,
    turns: list[tuple[str, str, str]],
    interface: str = "pi",
) -> None:
    store.create_conversation(
        Conversation(
            id=conversation_id,
            interface=interface,
            journey=journey,
            title=title,
            metadata=metadata,
            started_at=started_at,
            ended_at=ended_at,
        )
    )
    for index, (role, content, created_at) in enumerate(turns):
        store.add_message(
            Message(
                id=f"{conversation_id}-m{index:02d}",
                conversation_id=conversation_id,
                role=role,
                content=content,
                created_at=created_at,
            )
        )


def _turns(prefix: str, base: str, count: int) -> list[tuple[str, str, str]]:
    return [
        (
            "user" if index % 2 == 0 else "assistant",
            f"{prefix}{'user' if index % 2 == 0 else 'assistant'} line {index} about the port",
            f"{base[:17]}{index:02d}.000000Z",
        )
        for index in range(count)
    ]


CLOSE_TAIL_CONVERSATION = "wp-close-tail"


def seed_close_tail(store) -> None:
    _seed_conversation(
        store,
        CLOSE_TAIL_CONVERSATION,
        journey=PROBE_JOURNEY,
        title="Provisional probe title",
        metadata=json.dumps({"title_status": "provisional"}),
        started_at="2026-06-23T10:00:00.000000Z",
        ended_at=None,
        turns=_turns("", "2026-06-23T10:00:00", 6),
    )


COMPOSITE_CONVERSATIONS = (
    "wp-stale-orphan",
    "wp-poison-orphan",
    "wp-retitle",
    "wp-pending",
    "wp-bound",
)
COMPOSITE_SESSION = "wp-live-session"


def seed_session_composites(store) -> None:
    # A stale orphan: open, idle for hours, provisional title -> closed,
    # extracted, and finalized by the first step.
    _seed_conversation(
        store,
        "wp-stale-orphan",
        journey=PROBE_JOURNEY,
        title="Provisional orphan",
        metadata=json.dumps({"title_status": "provisional"}),
        started_at="2026-06-23T06:00:00.000000Z",
        ended_at=None,
        turns=_turns("", "2026-06-23T06:00:00", 4),
    )
    # A poison-pill orphan: closing it fails extraction (attempt 1) but still
    # finalizes; extract_pending retries it (attempt 2) and carries it over.
    _seed_conversation(
        store,
        "wp-poison-orphan",
        journey=PROBE_JOURNEY,
        title="Provisional poison",
        metadata=json.dumps({"title_status": "provisional"}),
        started_at="2026-06-23T07:00:00.000000Z",
        ended_at=None,
        turns=_turns(f"{POISON_MARKER} ", "2026-06-23T07:00:00", 4),
    )
    # An ended conversation with a weak title and no journey: retitled only.
    _seed_conversation(
        store,
        "wp-retitle",
        journey=None,
        title="short...",
        metadata=None,
        started_at="2026-06-23T08:00:00.000000Z",
        ended_at="2026-06-23T08:30:00.000000Z",
        turns=_turns("", "2026-06-23T08:00:00", 4),
    )
    # An ended, never-extracted conversation under a journey: extract_pending.
    _seed_conversation(
        store,
        "wp-pending",
        journey=PROBE_JOURNEY,
        title="A perfectly fine pending title",
        metadata=None,
        started_at="2026-06-23T09:00:00.000000Z",
        ended_at="2026-06-23T09:30:00.000000Z",
        turns=_turns("", "2026-06-23T09:00:00", 4),
    )
    # Open and idle, but bound to an ACTIVE session: never treated as an orphan.
    _seed_conversation(
        store,
        "wp-bound",
        journey=PROBE_JOURNEY,
        title="Live and bound",
        metadata=None,
        started_at="2026-06-23T05:00:00.000000Z",
        ended_at=None,
        turns=_turns("", "2026-06-23T05:00:00", 4),
    )
    store.upsert_runtime_session(
        COMPOSITE_SESSION, conversation_id="wp-bound", interface="pi", active=True
    )


REPAIR_CONVERSATIONS = ("wp-repair-build", "wp-repair-activation", "wp-repair-unrelated")


def seed_journey_repair(store) -> None:
    _seed_conversation(
        store,
        "wp-repair-build",
        journey=None,
        title=None,
        metadata=None,
        started_at="2026-06-23T10:00:00.000000Z",
        ended_at="2026-06-23T10:10:00.000000Z",
        turns=[
            ("user", "/mm-build demo-root-active", "2026-06-23T10:00:01.000000Z"),
            ("assistant", "Builder Mode active.", "2026-06-23T10:00:02.000000Z"),
        ],
    )
    _seed_conversation(
        store,
        "wp-repair-activation",
        journey=None,
        title=None,
        metadata=None,
        started_at="2026-06-23T11:00:00.000000Z",
        ended_at="2026-06-23T11:10:00.000000Z",
        turns=[
            ("user", "vamos trabalhar no demo-child-beta", "2026-06-23T11:00:01.000000Z"),
            ("assistant", "Vamos.", "2026-06-23T11:00:02.000000Z"),
        ],
    )
    _seed_conversation(
        store,
        "wp-repair-unrelated",
        journey=None,
        title=None,
        metadata=None,
        started_at="2026-06-23T12:00:00.000000Z",
        ended_at="2026-06-23T12:10:00.000000Z",
        turns=[
            ("user", "just a normal question about the weather", "2026-06-23T12:00:01.000000Z"),
            ("assistant", "Sunny.", "2026-06-23T12:00:02.000000Z"),
        ],
    )


# ---- state projection --------------------------------------------------------

CONVERSATION_CELLS = (
    "title",
    "started_at",
    "ended_at",
    "interface",
    "persona",
    "journey",
    "summary",
    "tags",
    "metadata",
)
MESSAGE_CELLS = ("conversation_id", "role", "content", "created_at")
MEMORY_CELLS = (
    "memory_type",
    "layer",
    "content",
    "context",
    "journey",
    "persona",
    "tags",
    "conversation_id",
    "created_at",
    "metadata",
    "embedding",
)
TASK_CELLS = (
    "journey",
    "status",
    "due_date",
    "scheduled_at",
    "time_hint",
    "stage",
    "context",
    "source",
    "created_at",
    "updated_at",
    "completed_at",
)
# latency_ms is deliberately absent: Python measures the embedding stub with
# perf_counter, so it is the one cell that cannot be byte-stable.
LLM_CALL_CELLS = (
    "role",
    "model",
    "prompt",
    "response",
    "prompt_tokens",
    "completion_tokens",
    "cost_usd",
    "conversation_id",
    "called_at",
)
RUNTIME_SESSION_CELLS = (
    "conversation_id",
    "interface",
    "active",
    "started_at",
    "updated_at",
    "closed_at",
)


def _cell(value):
    if isinstance(value, bytes):
        return f"blob:sha256:{hashlib.sha256(value).hexdigest()}"
    return value


def _rows(conn, table, key, cells, where, params) -> list[dict]:
    cursor = conn.execute(
        f"SELECT {key} AS __key, {', '.join(cells)} FROM {table} WHERE {where} ORDER BY {key}",
        params,
    )
    return [
        {"id": f"{table}:{row['__key']}", "cells": {cell: _cell(row[cell]) for cell in cells}}
        for row in cursor.fetchall()
    ]


def _placeholders(values) -> str:
    return ", ".join("?" for _ in values)


def lifecycle_state(conn: sqlite3.Connection, conversation_ids, session_ids=()) -> list[dict]:
    """Every table the lifecycle touches, for the given conversations."""
    conn.row_factory = sqlite3.Row
    in_clause = f"conversation_id IN ({_placeholders(conversation_ids)})"
    ids = list(conversation_ids)
    state: list[dict] = []
    state += _rows(
        conn, "conversations", "id", CONVERSATION_CELLS, f"id IN ({_placeholders(ids)})", ids
    )
    state += _rows(conn, "messages", "id", MESSAGE_CELLS, in_clause, ids)
    state += _rows(conn, "memories", "title", MEMORY_CELLS, in_clause, ids)
    state += _rows(
        conn,
        "conversation_embeddings",
        "conversation_id",
        ("summary_embedding",),
        in_clause,
        ids,
    )
    state += _rows(conn, "tasks", "title", TASK_CELLS, "source = 'conversation'", ())
    state += _rows(conn, "llm_calls", "rowid", LLM_CALL_CELLS, in_clause, ids)
    if session_ids:
        session_list = list(session_ids)
        state += _rows(
            conn,
            "runtime_sessions",
            "session_id",
            RUNTIME_SESSION_CELLS,
            f"session_id IN ({_placeholders(session_list)})",
            session_list,
        )
    return state


TIMING_RE = re.compile(r"^(?P<label>[^:]+): (?P<count>\d+) \((?P<seconds>\d+\.\d)s\)$")


def normalize_report(report: str) -> str:
    """Replace each timing token only after it matches Python's exact grammar."""
    lines = []
    for line in report.split("\n"):
        if "(" in line and line.endswith("s)"):
            match = TIMING_RE.match(line)
            if not match:
                raise RuntimeError(f"timing line does not match the grammar: {line!r}")
            lines.append(f"{match['label']}: {match['count']} (<elapsed>s)")
        else:
            lines.append(line)
    return "\n".join(lines)


# ---- the probes --------------------------------------------------------------


def close_tail_probe(python_copy: Path, frozen_datetime, now_iso: str) -> dict:
    from memory.client import MemoryClient

    with lifecycle_stubs(frozen_datetime):
        client = MemoryClient(db_path=python_copy)
        try:
            client.end_conversation(CLOSE_TAIL_CONVERSATION, extract=True)
            state = lifecycle_state(client.conn, [CLOSE_TAIL_CONVERSATION])
        finally:
            client.close()
    return {
        "label": "close_tail_demo",
        "probe_type": "close_tail",
        "now_iso": now_iso,
        "target_ids": [CLOSE_TAIL_CONVERSATION],
        "close_tail": {"conversation_id": CLOSE_TAIL_CONVERSATION, "replies": STUB_REPLIES},
        "python_state": state,
    }


def session_composites_probe(python_copy: Path, frozen_datetime, now_iso: str) -> dict:
    from memory.cli import conversation_logger as logger_mod
    from memory.client import MemoryClient

    absent_pi_dir = python_copy.parent / "absent-pi-sessions"
    original_pi_dir = os.environ.get("PI_SESSIONS_DIR")
    os.environ["PI_SESSIONS_DIR"] = str(absent_pi_dir)
    with lifecycle_stubs(frozen_datetime):
        # A fresh client per call: the maintenance counters close the client
        # they are handed, so a shared one would be closed mid-run.
        original_factory = logger_mod._memory_client
        logger_mod._memory_client = lambda mirror_home=None: MemoryClient(db_path=python_copy)
        try:
            report = logger_mod.session_maintenance()
            client = MemoryClient(db_path=python_copy)
            try:
                state = lifecycle_state(client.conn, COMPOSITE_CONVERSATIONS, [COMPOSITE_SESSION])
            finally:
                client.close()
        finally:
            logger_mod._memory_client = original_factory
            if original_pi_dir is None:
                os.environ.pop("PI_SESSIONS_DIR", None)
            else:
                os.environ["PI_SESSIONS_DIR"] = original_pi_dir
    state.append(
        {
            "id": "report:session_maintenance",
            "cells": {"report_normalized": normalize_report(report)},
        }
    )
    return {
        "label": "session_composites_demo",
        "probe_type": "session_composites",
        "now_iso": now_iso,
        "target_ids": list(COMPOSITE_CONVERSATIONS),
        "session_composites": {
            "conversation_ids": list(COMPOSITE_CONVERSATIONS),
            "session_ids": [COMPOSITE_SESSION],
            "replies": STUB_REPLIES,
            "poison_marker": POISON_MARKER,
        },
        "python_state": state,
    }


def journey_repair_apply_probe(python_copy: Path, frozen_datetime, now_iso: str) -> dict:
    """Dry run, then --apply, on a mirror-home layout so Python's backup() runs.

    ``diagnose_journey_associations(apply=True)`` refuses without a backup, and
    ``backup()`` archives ``db_path_for_home(mirror_home)``; the copy is
    therefore placed where a mirror home would keep it, still under tmp/.
    """
    from memory.cli import conversation_logger as logger_mod

    repair_home = python_copy.parent / "repair-home"
    repair_home.mkdir(parents=True, exist_ok=True)
    home_db = db_path_for_home(repair_home)
    home_db.parent.mkdir(parents=True, exist_ok=True)
    for candidate in (home_db, Path(f"{home_db}-wal"), Path(f"{home_db}-shm")):
        if candidate.exists():
            candidate.unlink()
    with sqlite3.connect(str(python_copy)) as src, sqlite3.connect(str(home_db)) as dst:
        src.backup(dst)

    def journeys(conn) -> dict:
        conn.row_factory = sqlite3.Row
        placeholders = _placeholders(REPAIR_CONVERSATIONS)
        return {
            row["id"]: row["journey"]
            for row in conn.execute(
                f"SELECT id, journey FROM conversations WHERE id IN ({placeholders}) ORDER BY id",
                REPAIR_CONVERSATIONS,
            )
        }

    def rendered(findings, applied: bool) -> str:
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            logger_mod._print_journey_association_findings(findings, applied=applied)
        return buffer.getvalue()

    original_datetime = models_mod.datetime
    models_mod.datetime = frozen_datetime
    try:
        conn = sqlite3.connect(str(home_db))
        before = journeys(conn)
        conn.close()
        dry_run = logger_mod.diagnose_journey_associations(mirror_home=str(repair_home))
        conn = sqlite3.connect(str(home_db))
        after_dry_run = journeys(conn)
        conn.close()
        with redirect_stdout(io.StringIO()):  # backup() prints its progress
            applied = logger_mod.diagnose_journey_associations(
                mirror_home=str(repair_home), apply=True
            )
        conn = sqlite3.connect(str(home_db))
        after_apply = journeys(conn)
        conn.close()
    finally:
        models_mod.datetime = original_datetime

    state = [
        {"id": "journeys:before", "cells": dict(before)},
        {"id": "journeys:after_dry_run", "cells": dict(after_dry_run)},
        {"id": "journeys:after_apply", "cells": dict(after_apply)},
        {"id": "findings:dry_run", "cells": {"json": json.dumps(dry_run, sort_keys=True)}},
        {"id": "findings:applied", "cells": {"json": json.dumps(applied, sort_keys=True)}},
        {"id": "rendered:dry_run", "cells": {"text": rendered(dry_run, applied=False)}},
        {"id": "rendered:applied", "cells": {"text": rendered(applied, applied=True)}},
    ]
    return {
        "label": "journey_repair_apply_demo",
        "probe_type": "journey_repair_apply",
        "now_iso": now_iso,
        "target_ids": list(REPAIR_CONVERSATIONS),
        "journey_repair_apply": {"conversation_ids": list(REPAIR_CONVERSATIONS)},
        "python_state": state,
    }


SEEDERS = {
    "close_tail": seed_close_tail,
    "session_composites": seed_session_composites,
    "journey_repair_apply": seed_journey_repair,
}
PROBES = {
    "close_tail": close_tail_probe,
    "session_composites": session_composites_probe,
    "journey_repair_apply": journey_repair_apply_probe,
}
