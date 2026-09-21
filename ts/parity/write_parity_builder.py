"""Builder write-parity probes: the delivery cursor, artifacts, and `load`.

Three probes live here. `builder_cursor_state` (plateau 2) grades database rows;
`builder_artifacts` (plateau 3) grades FILES; `builder_load` (plateau 7) grades
what a session start LEAVES BEHIND on a real corpus.

The artifacts probe encodes each file as an ordinary `{id, cells}` state row --
`id` is the project-relative path, `cells` is its content -- rather than adding a
file-aware probe type to the harness. That is a deliberate choice between two real
options. A new probe type would need its own diffing, its own redaction, and its own
failure reporting: new harness surface whose only user is this probe, and a probe
whose harness is buggy reports a false verdict, which is worse than having no probe
(the CR044 lesson: green has to mean something). `python_state` was never row-shaped
by contract -- it is a list of identified cell bags -- so a file maps onto it
without stretching the abstraction.

Safety property, stated because getting it wrong would be catastrophic rather than
merely wrong: the artifacts probe NEVER writes into the journey's real
`project_path`. It reads the journey and cursor from the database copy and
materializes into a disposable project tree beside the copy, in the harness work
dir. Pointing a lifecycle write at a Navigator's actual repository is the defect
class CR065 tracks, and the one that fabricated a roadmap package inside this
repository at plateau 3.

Original plateau-2 docstring follows.

Builder delivery-cursor write-parity probe (CV22.DS7.US8 plateau 2).

The synthetic corpus already grades the cursor's bytes exhaustively. This probe
answers a different question: does the sequence hold on a REAL database, starting
from whatever cursor that database already carries?

That starting state is the point. Every synthetic case begins from an empty row,
while a real install begins from a cursor mid-lifecycle — a generation well above
zero, an active item, possibly a pending confirmation and a receipt. The
carry-forward rule (`cursor_generation=None` keeps the stored value) and the
receipt-invalidation rule are both defined RELATIVE to a previous row, so they are
only fully exercised when a previous row exists and was not written by this
harness.

The probe therefore:

  1. reads the journeys the copy actually has, and picks one deterministically;
  2. records the cursor row as it stands, if any;
  3. applies a lifecycle sequence with Python, recording the full
     `runtime_sessions` row after EVERY step;
  4. leaves the copy for the TypeScript verifier, which replays the same sequence
     on its own fresh copy of the same seed and compares the sequences.

Graded as the whole row per step — `interface`, `journey`, `active`, `started_at`,
`closed_at`, `metadata` — with `started_at` the field that proves the upsert
PRESERVED a pre-existing row instead of recreating it.

What this probe does NOT prove: byte parity of `metadata`. The harness
canonicalizes every metadata cell (parse, then key-sorted re-stringify) so write
parity grades the VALUE rather than the serialization dialect. The bytes are the
contract D2 rests on, and they are pinned by `builder-cursor.golden.json` instead.
Saying so here matters, because a green probe could otherwise be mistaken for
proof of the property the revert actually needs.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path
from typing import Any

from memory.builder.delivery_cursor import (
    clear_delivery_cursor,
    get_delivery_cursor,
    set_delivery_cursor,
)
from memory.builder.story_paths import create_story_directory, resolve_story_directory
from memory.storage.store import Store

CURSOR_PREFIX = "__builder_delivery_cursor__:"
ADOPTION_PREFIX = "__builder_method_adoption__:"

ROW_COLUMNS = (
    "session_id",
    "interface",
    "journey",
    "active",
    "started_at",
    "updated_at",
    "closed_at",
    "metadata",
)

# The sequence, in the order the real commands write it. Kept free of any value
# derived from the copy so the TypeScript side can rebuild it from the fixture.
SEQUENCE: tuple[tuple[str, dict[str, Any]], ...] = (
    ("sync", {"last_delivery_event": "template_preparation", "cadence_profile": "stepwise"}),
    (
        "pull",
        {
            "active_item": "PARITY.DS1.US1",
            "active_item_title": "Write-parity probe story",
            "active_item_level": "user_story",
            "last_delivery_event": "pulled",
            "cadence_profile": "stepwise",
        },
    ),
    (
        "plan",
        {
            "active_item": "PARITY.DS1.US1",
            "active_item_level": "user_story",
            "active_checkpoint": "after_plan",
            "pending_confirmation": "navigator_approval",
            "last_delivery_event": "plan_checkpoint",
            "cadence_profile": "stepwise",
        },
    ),
    (
        "approve",
        {
            "active_item": "PARITY.DS1.US1",
            "active_item_level": "user_story",
            "last_delivery_event": "plan_approved",
            "cadence_profile": "stepwise",
        },
    ),
    # An explicit generation bump, which is the only thing that changes it.
    (
        "bump_generation",
        {
            "active_item": "PARITY.DS1.US1",
            "active_item_level": "user_story",
            "last_delivery_event": "plan_approved",
            "cadence_profile": "stepwise",
            "cursor_generation": 99,
        },
    ),
    # An ordinary write afterwards must CARRY 99 forward, not reset it.
    (
        "carry_generation",
        {
            "active_item": "PARITY.DS1.US1",
            "active_item_level": "user_story",
            "last_delivery_event": "validated",
            "cadence_profile": "stepwise",
        },
    ),
)


def _row(conn: sqlite3.Connection, session_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM runtime_sessions WHERE session_id = ?", (session_id,)
    ).fetchone()
    return None if row is None else {column: row[column] for column in ROW_COLUMNS}


def _pick_journey(conn: sqlite3.Connection) -> str:
    """A journey the copy actually has, chosen deterministically.

    Prefers one that ALREADY carries a delivery cursor, because a pre-existing row
    is what makes carry-forward and receipt invalidation real rather than
    synthetic. Falls back to the first journey identity, then to a fixed slug.
    """
    existing = conn.execute(
        """SELECT journey FROM runtime_sessions
            WHERE session_id LIKE ? AND journey IS NOT NULL
            ORDER BY journey LIMIT 1""",
        (f"{CURSOR_PREFIX}%",),
    ).fetchone()
    if existing and existing["journey"]:
        return str(existing["journey"])
    row = conn.execute(
        "SELECT key FROM identity WHERE layer = 'journey' ORDER BY key LIMIT 1"
    ).fetchone()
    return str(row["key"]) if row else "parity-journey"


def builder_cursor_state_probe(python_copy, frozen_datetime, now_iso: str) -> dict[str, Any]:
    """Apply the cursor sequence with Python and record every intermediate row.

    The clock is frozen the way every sibling probe freezes it. Without this the
    rows differ on `updated_at` alone -- `upsert_runtime_session` stamps
    `models._now()` -- and the probe reports a mismatch that is about the harness
    rather than about the port. Measured, not assumed: the first run failed on
    exactly those seven cells.
    """
    import memory.models as models_mod

    models_mod.datetime = frozen_datetime
    conn = get_connection_for(python_copy)
    try:
        journey = _pick_journey(conn)
        session_id = f"{CURSOR_PREFIX}{journey}"
        store = Store(conn)
        # The projection seam is Python-owned and best-effort; a probe must not
        # spawn it, so it is disabled rather than stubbed.

        starting_row = _row(conn, session_id)
        starting_cursor = get_delivery_cursor(store, journey)
        states: list[dict[str, Any]] = []
        for label, changes in SEQUENCE:
            set_delivery_cursor(store, journey=journey, method="ariad", **changes)
            row = _row(conn, session_id)
            states.append({"label": label, "row": row})
        # And the clear, which deactivates the row rather than deleting it.
        clear_delivery_cursor(store, journey)
        states.append({"label": "clear", "row": _row(conn, session_id)})
        # The TS harness ALSO emits the declared `snapshots` row, so the oracle
        # must append its equivalent or the two states differ by one row and the
        # verdict is a count mismatch rather than a behavioral one. Same shape the
        # soul probe uses (`steps + _snapshot_rows(...)`); the columns must match
        # the `SnapshotSpec` on the TypeScript side exactly.
        snapshot_row = _row(conn, session_id)
        snapshot = {
            "id": f"runtime_sessions:{session_id}",
            "cells": {
                column: (snapshot_row or {}).get(column)
                for column in (
                    "interface",
                    "journey",
                    "active",
                    "started_at",
                    "closed_at",
                    "metadata",
                )
            },
        }
    finally:
        conn.close()

    return {
        "label": "builder_cursor_state",
        "probe_type": "builder_cursor_state",
        "now_iso": now_iso,
        "builder_cursor": {
            "journey": journey,
            "session_id": session_id,
            "sequence": [{"label": label, "changes": changes} for label, changes in SEQUENCE],
            "starting_row": starting_row,
            "starting_generation": None
            if starting_cursor is None
            else starting_cursor.cursor_generation,
        },
        # Graded as an ordered sequence: the step index is part of the row id, so a
        # port that reaches the same END state through different intermediate rows
        # fails rather than passing on the final row alone.
        "python_state": [
            *(
                {
                    "id": f"{index:02d}:{state['label']}",
                    "cells": state["row"] or {"row": None},
                }
                for index, state in enumerate(states)
            ),
            snapshot,
        ],
    }


def get_connection_for(path) -> sqlite3.Connection:
    connection = sqlite3.connect(str(path))
    connection.row_factory = sqlite3.Row
    return connection


# The authored Delivery Story the artifacts probe expands, and the authored plan.md
# it must PRESERVE. Both are fixed text so the two engines materialize from the same
# starting tree.
_DS_CODE = "PARITY-DS1"
_DS_TITLE = "Write parity delivery story"
_DS_FOLDER = "docs/project/roadmap/parity-ds1-write-parity-delivery-story"
_DS_INDEX = """# PARITY-DS1 \u2014 Write parity delivery story

**Status:** \U0001f7e1 Planned
**Type:** Delivery Story

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| PARITY-DS1.US-1 | Materialize the first slice | User Story | \U0001f7e1 Planned |
| PARITY-DS1.TS-1 | Harden the materialization seam | Technical Story | \U0001f7e1 Planned |

## Done Condition

Done when the children deliver a coherent outcome.
"""
_AUTHORED_PLAN = "# Plan \u2014 authored by the Driver\n\nThis body must survive Plan.\n"


def _write_project(project) -> None:
    """The starting tree, identical for both engines."""
    for relative, content in (
        ("README.md", "# Parity project\n"),
        ("docs/project/roadmap/index.md", "# Roadmap\n"),
        (f"{_DS_FOLDER}/index.md", _DS_INDEX),
    ):
        target = project / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")


def _project_files(project) -> list[dict[str, Any]]:
    """Every authored file as a state row: id = project-relative path, cells = content.

    Sorted by path so the two engines' lists align positionally, and
    project-relative so the row ids do not carry the work dir -- the same reason the
    lifecycle corpus records relative paths.
    """
    rows: list[dict[str, Any]] = []
    for path in sorted(project.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(project).as_posix()
        rows.append({"id": f"file:{relative}", "cells": {"content": path.read_text("utf-8")}})
    return rows


def builder_artifacts_probe(python_copy, frozen_datetime, now_iso: str) -> dict[str, Any]:
    """Materialize a story package with Python and record the resulting files.

    The lifecycle runs for real against the copy's own journey and cursor: Expand on
    an authored Delivery Story, then Pull/Prepare/Plan on one of its children with an
    authored `plan.md` already in place. So the probe grades three things the golden
    grades synthetically, but here on a real database: the child folder derivation,
    the generated artifact bytes, and the preservation rule.
    """
    import memory.models as models_mod

    from memory.builder.ariad_method import get_ariad_method
    from memory.builder.lifecycle import (
        BuilderLifecycleItem,
        expand_delivery_story,
        plan_lifecycle_item,
        prepare_lifecycle_item,
        pull_lifecycle_item,
    )

    models_mod.datetime = frozen_datetime
    project = python_copy.parent / "builder-artifacts-python" / "project"
    if project.exists():
        shutil.rmtree(project)
    project.mkdir(parents=True, exist_ok=True)
    _write_project(project)

    conn = get_connection_for(python_copy)
    try:
        journey = _pick_journey(conn)
        store = Store(conn)

        set_delivery_cursor(
            store,
            journey=journey,
            method="ariad",
            active_item=_DS_CODE,
            active_item_title=_DS_TITLE,
            active_item_level="delivery_story",
        )
        expand = expand_delivery_story(
            store, journey=journey, method="ariad", project_path=project
        )
        child_code = expand.cursor.child_work_items[0]
        child_title = expand.recommended_story_title
        pull_lifecycle_item(
            store,
            journey=journey,
            method="ariad",
            item=BuilderLifecycleItem(
                code=child_code,
                title=child_title,
                level="user_story",
                why_now="write parity materialization",
            ),
        )
        prepare_lifecycle_item(store, journey=journey, method="ariad", project_path=project)
        package = resolve_story_directory(project, child_code) or create_story_directory(
            project, child_code, child_title
        )
        plan_path = Path(package) / "plan.md"
        plan_path.parent.mkdir(parents=True, exist_ok=True)
        plan_path.write_text(_AUTHORED_PLAN, encoding="utf-8")
        plan_lifecycle_item(
            store,
            journey=journey,
            method=get_ariad_method(),
            plan_artifact_path=plan_path,
        )
        files = _project_files(project)
        cursor_row = _row(conn, f"{CURSOR_PREFIX}{journey}")
        snapshot = {
            "id": f"runtime_sessions:{CURSOR_PREFIX}{journey}",
            "cells": {
                column: (cursor_row or {}).get(column)
                for column in (
                    "interface",
                    "journey",
                    "active",
                    "started_at",
                    "closed_at",
                    "metadata",
                )
            },
        }
    finally:
        conn.close()

    return {
        "label": "builder_artifacts",
        "probe_type": "builder_artifacts",
        "now_iso": now_iso,
        "builder_artifacts": {
            "journey": journey,
            "session_id": f"{CURSOR_PREFIX}{journey}",
            "delivery_story": _DS_CODE,
            "delivery_story_title": _DS_TITLE,
            "child_code": child_code,
            "child_title": child_title,
            "authored_plan": _AUTHORED_PLAN,
            "starting_files": {
                "README.md": "# Parity project\n",
                "docs/project/roadmap/index.md": "# Roadmap\n",
                f"{_DS_FOLDER}/index.md": _DS_INDEX,
            },
        },
        "python_state": [*files, snapshot],
    }


# --- `build load` on a real corpus (plateau 7) -------------------------------
#
# The synthetic corpus grades `load` against Python on nine seeded databases with
# at most nine memories. This probe answers the question those cannot: does the
# composition hold on a REAL corpus, where the ranker runs over thousands of
# stored vectors and the merge has genuine near-ties to break?
#
# Everything it grades is content-free by construction. Memory ids (opaque), row
# counts, ledger roles, and DIGESTS of the rendered surfaces -- never a title, a
# body, or the query. A digest still fails when the engines disagree, and the
# harness's `--debug-sensitive-output` remains the deliberate way to see why.

HERE = Path(__file__).resolve().parent
LOAD_SESSION_ID = "__builder_load_probe__"
STICKY_SESSION_ID = "__global_sticky_defaults__"
LOAD_FIXTURE = HERE.parent / "test" / "fixtures" / "builder-load" / "oracle-seam.json"
TS_LOAD_FIXTURE = HERE.parent / "test" / "fixtures" / "builder-load" / "replay-embedding.json"
MEMORIES_HEADING = "=== recent memories ==="
# The runtime-session cells a session start writes: the mode row's binding, the
# conversation it bound, and the sticky defaults. `updated_at` is excluded for the
# reason the cursor probe excludes it -- both engines stamp the frozen now, so it
# grades the harness rather than the port.
LOAD_SESSION_COLUMNS = (
    "conversation_id",
    "interface",
    "persona",
    "journey",
    "active",
    "started_at",
    "closed_at",
    "metadata",
)
LOAD_CONVERSATION_COLUMNS = ("started_at", "ended_at", "interface", "persona", "journey")


def _pick_load_journey(conn: sqlite3.Connection) -> str:
    """The journey with the most memories, then alphabetical.

    Deterministic, and chosen for SIZE on purpose: the scoped search must have a
    real candidate set to rank, or the probe grades an empty block and proves
    nothing the synthetic corpus did not already prove.
    """
    row = conn.execute(
        """SELECT i.key AS key, COUNT(m.id) AS memories
             FROM identity i
             LEFT JOIN memories m ON m.journey = i.key
            WHERE i.layer = 'journey'
            GROUP BY i.key
            ORDER BY memories DESC, i.key
            LIMIT 1"""
    ).fetchone()
    return str(row["key"]) if row else "parity-journey"


def _require_pinned_dimension(conn: sqlite3.Connection) -> None:
    """Refuse a corpus whose vectors are not the pinned width.

    The fixture's query vector is 1536-dimensional, and Python's `search` takes the
    dot product against each stored embedding with no width check of its own -- so
    a corpus at another width dies inside numpy with `shapes (1536,) and (8,) not
    aligned`, four frames deep, and the probe looks broken rather than
    inapplicable. The synthetic demo database is exactly that corpus: its vectors
    are eight floats wide.

    This is a precondition of the probe, not a defect in either engine. Naming it
    here is the CR044 rule -- a harness whose failure is unreadable teaches people
    to ignore it.
    """
    fixture_width = len(json.loads(LOAD_FIXTURE.read_text(encoding="utf-8"))["embedding"])
    row = conn.execute(
        "SELECT LENGTH(embedding) AS bytes FROM memories WHERE embedding IS NOT NULL LIMIT 1"
    ).fetchone()
    if row is None:
        raise SystemExit(
            "the builder_load probe needs a corpus with stored embeddings: this "
            "database has none, so both engines would render an empty memories block "
            "and the probe would grade nothing."
        )
    width = int(row["bytes"]) // 4  # float32
    if width != fixture_width:
        raise SystemExit(
            f"the builder_load probe needs a corpus embedded at the pinned width "
            f"({fixture_width}); this database stores {width}-dimensional vectors. "
            "The synthetic demo database is 8-wide by construction -- run this probe "
            "against a real mirror home, which is the corpus it exists to grade."
        )


def _digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _memories_block(stdout: str) -> str:
    """The rendered block alone, so its digest fails independently of the cards."""
    _, separator, block = stdout.partition(MEMORIES_HEADING)
    return block if separator else ""


def builder_load_probe(python_copy, frozen_datetime, now_iso: str) -> dict[str, Any]:
    """Run the real `cmd_load` against the COPY, in a subprocess, and snapshot it.

    A subprocess rather than an in-process call, and that is a safety property
    rather than a style choice. `cmd_load` builds its own `MemoryClient()` and
    `switch_conversation` opens its own connection, both resolving `DB_PATH` from
    config at import time -- so an in-process probe would have to patch every one
    of those seams correctly to avoid writing into the Navigator's REAL database.
    A child process with `DB_PATH` pointing at the copy cannot reach it at all,
    whatever the command does internally.

    The seam is `build_load_oracle.py`: the same patched providers, reading the
    same fixture the TypeScript replay provider reads, behind the same socket
    tripwire that makes a live call impossible.
    """
    conn = get_connection_for(python_copy)
    try:
        _require_pinned_dimension(conn)
        journey = _pick_load_journey(conn)
        base_access_id = int(
            conn.execute("SELECT COALESCE(MAX(id), 0) AS id FROM memory_access_log").fetchone()[
                "id"
            ]
        )
    finally:
        conn.close()

    home = Path(python_copy).parent / "builder-load-home"
    shutil.rmtree(home, ignore_errors=True)
    home.mkdir(parents=True)

    environment = dict(os.environ)
    environment["DB_PATH"] = str(Path(python_copy).resolve())
    environment["MIRROR_HOME"] = str(home.resolve())
    environment["MEMORY_ENV"] = "test"
    environment["PYTHONPATH"] = str(HERE.parent.parent / "src")
    environment.pop("MIRROR_SESSION_ID", None)
    completed = subprocess.run(
        [
            sys.executable,
            str(HERE / "build_load_oracle.py"),
            journey,
            str(LOAD_FIXTURE),
            "--session-id",
            LOAD_SESSION_ID,
            "--now",
            now_iso,
            # The guard's inputs are the machine's, not the command's: a git root
            # and a marker file. Graded in the corpus with an injected refusal.
            "--ignore-clone-role",
        ],
        capture_output=True,
        text=True,
        env=environment,
        cwd=str(HERE.parent.parent),
        check=False,
    )
    if completed.returncode != 0:
        raise SystemExit(
            "the builder_load probe's oracle failed "
            f"(exit {completed.returncode}): {completed.stderr[-2000:]}"
        )

    conn = get_connection_for(python_copy)
    try:
        accessed = [
            {"id": f"access:{index:03d}", "cells": {"memory_id": row["memory_id"]}}
            for index, row in enumerate(
                conn.execute(
                    "SELECT memory_id FROM memory_access_log WHERE id > ? ORDER BY id",
                    (base_access_id,),
                ).fetchall()
            )
        ]
        # Selected by the FROZEN clock rather than by id: `llm_calls.id` is a
        # uuid, and `log_llm_call` imports `_uuid` by name so the oracle's frozen
        # counter never reaches it. `called_at` is `_now()`, which is frozen.
        ledger = [
            {
                "id": f"llm:{index:03d}",
                "cells": {
                    "role": row["role"],
                    "model": row["model"],
                    "prompt_tokens": row["prompt_tokens"],
                    "completion_tokens": row["completion_tokens"],
                    "cost_usd": row["cost_usd"],
                },
            }
            for index, row in enumerate(
                conn.execute(
                    "SELECT role, model, prompt_tokens, completion_tokens, cost_usd "
                    "FROM llm_calls WHERE called_at = ? ORDER BY rowid",
                    (now_iso,),
                ).fetchall()
            )
        ]
        touched = [str(entry["cells"]["memory_id"]) for entry in accessed]
        sessions = [
            {
                "id": f"runtime_sessions:{row['session_id']}",
                "cells": {column: row[column] for column in LOAD_SESSION_COLUMNS},
            }
            for row in conn.execute(
                "SELECT session_id, "
                + ", ".join(LOAD_SESSION_COLUMNS)
                + " FROM runtime_sessions WHERE session_id IN (?, ?) ORDER BY session_id",
                (LOAD_SESSION_ID, STICKY_SESSION_ID),
            ).fetchall()
        ]
        conversation_id = conn.execute(
            "SELECT conversation_id FROM runtime_sessions WHERE session_id = ?",
            (LOAD_SESSION_ID,),
        ).fetchone()
        conversation_id = None if conversation_id is None else conversation_id["conversation_id"]
        conversations = [
            {
                "id": f"conversations:{row['id']}",
                "cells": {column: row[column] for column in LOAD_CONVERSATION_COLUMNS},
            }
            for row in (
                conn.execute(
                    "SELECT id, "
                    + ", ".join(LOAD_CONVERSATION_COLUMNS)
                    + " FROM conversations WHERE id = ?",
                    (conversation_id,),
                ).fetchall()
                if conversation_id
                else []
            )
        ]
        # `title` and `summary` are deliberately absent from the graded columns
        # and present here as PRESENCE flags: a session start creates an empty
        # conversation, so the only signal they carry is "still empty", and
        # grading their text would put conversation prose in a fixture file for
        # no extra evidence.
        flags = conn.execute(
            "SELECT (title IS NOT NULL) AS has_title, (summary IS NOT NULL) AS has_summary, "
            "(SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS messages "
            "FROM conversations c WHERE c.id = ?",
            (conversation_id,),
        ).fetchone()
        conversation_flags = [
            {
                "id": "conversation:flags",
                "cells": {
                    "has_title": int(flags["has_title"]) if flags else -1,
                    "has_summary": int(flags["has_summary"]) if flags else -1,
                    "messages": int(flags["messages"]) if flags else -1,
                },
            }
        ]
        # Retrieval logs ACCESS, never USE. On a real corpus the distinction is
        # load-bearing: `use_count` feeds the reinforcement term, so a port that
        # bumped it here would quietly re-rank the Navigator's whole memory.
        memories = [
            {"id": f"memories:{row['id']}", "cells": {"use_count": row["use_count"]}}
            for row in (
                conn.execute(
                    "SELECT id, use_count FROM memories WHERE id IN "
                    f"({', '.join('?' for _ in touched)}) ORDER BY id",
                    touched,
                ).fetchall()
                if touched
                else []
            )
        ]
    finally:
        conn.close()
    shutil.rmtree(home, ignore_errors=True)

    surfaces = [
        {
            "id": "stdout:sha256",
            "cells": {
                "stdout": _digest(completed.stdout),
                "stderr": _digest(completed.stderr),
                "memories_block": _digest(_memories_block(completed.stdout)),
                # The block's ORDER is not derivable from the access log -- access
                # is logged per search, the block is the merged, re-sorted six --
                # so its digest is the only thing that grades the merge on real
                # data. The count is recorded beside it to make a mismatch
                # readable without revealing anything.
                "memories_rendered": _memories_block(completed.stdout).count("\n["),
            },
        }
    ]

    return {
        "label": "builder_load",
        "probe_type": "builder_load",
        "now_iso": now_iso,
        "builder_load": {
            "journey": journey,
            "session_id": LOAD_SESSION_ID,
            "sticky_session_id": STICKY_SESSION_ID,
            "replay_embedding_path": str(TS_LOAD_FIXTURE),
            "base_access_log_id": base_access_id,
            "conversation_id": conversation_id,
            "touched_memory_ids": touched,
        },
        "python_state": [
            *accessed,
            *ledger,
            *surfaces,
            *sessions,
            *conversations,
            *conversation_flags,
            *memories,
        ],
    }


PROBES = {
    "builder_cursor_state": builder_cursor_state_probe,
    "builder_artifacts": builder_artifacts_probe,
    "builder_load": builder_load_probe,
}
