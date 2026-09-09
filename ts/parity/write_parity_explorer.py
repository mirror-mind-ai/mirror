"""Explorer Story write-parity probe (CV22.DS7.US7 plateau 2).

The unit tests grade the story functions against a golden built on synthetic
databases. This probe grades them where it matters: on a copy of a REAL
database, through the same `Store` a live session uses, against a journey that
already carries rows.

The sequence is the one an exploration actually performs -- open, thicken,
surface an attractor, propose an experiment, attach source evidence, archive --
and the graded artifact is BOTH stores after EACH step:

  * `exploratory_stories`, because the four `*_json` columns carry Python's
    `ensure_ascii=False` insertion-ordered bytes and the absent experiment or
    handoff must be SQL NULL, not the string `"null"`;
  * `runtime_sessions`, because `_store_story` still rewrites the legacy
    payload on every mutation, and the archive step must deactivate it.

The intermediate states are where the divergences live: an upsert that loses
`id`/`created_at`, a clear that reads as a keep, a second row where the partial
unique index expects one, or an archive that leaves the runtime payload active
are all invisible in a final-state-only comparison.

Copy-only: like every probe in this harness, it runs against a copied database
and never touches the source.
"""

from __future__ import annotations

import json
import shutil
import sqlite3
from pathlib import Path
from typing import Any

from memory.services.explorer_story import (
    ExplorerAttractor,
    ExplorerExperimentProposal,
    ExplorerSourceConversation,
    archive_explorer_story,
    set_explorer_attractors,
    set_explorer_experiment_proposal,
    set_explorer_source_conversations,
    update_explorer_story,
)
from memory.storage.store import Store

PROBE_JOURNEY = "write-parity-explorer-journey"
SESSION_ID = f"__explorer_story__:{PROBE_JOURNEY}"

OPENING_STORY = "The port keeps meeting the same wall ✦ parity is cheap to claim."
THICKENED_STORY = "  The wall turned out to be a rendering problem.  "
ATTRACTOR_LABEL = "grade the surface, not the intent"
ATTRACTOR_DETAIL = "沉默不是空白而是尚未成形的語言"
EXPERIMENT_TITLE = "port one ritual command end to end"
SOURCE_CONVERSATION_ID = "write-parity-explorer-conversation"


SNAPSHOT_COLUMNS = (
    "journey",
    "title",
    "status",
    "current_story",
    "narrative_summary",
    "last_story_card",
    "attractors_json",
    "experiment_proposal_json",
    "builder_handoff_json",
    "source_conversations_json",
    "created_at",
    "updated_at",
    "promoted_at",
    "archived_at",
)


def _snapshot_rows(db_path: Path) -> list[dict]:
    """The final row state, in the shape the TS side declares as `snapshots`.

    The step rows above already carry every intermediate state, so this exists
    for what they cannot see: a row the write created OUTSIDE the journey's
    expected identity, which the snapshot's `WHERE ... IN` clause still picks
    up.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows: list[dict] = []
        for row in conn.execute(
            "SELECT * FROM exploratory_stories WHERE journey = ? ORDER BY id",
            (PROBE_JOURNEY,),
        ).fetchall():
            rows.append(
                {
                    "id": f"exploratory_stories:{row['id']}",
                    "cells": {column: row[column] for column in SNAPSHOT_COLUMNS},
                }
            )
        session = conn.execute(
            "SELECT metadata, active FROM runtime_sessions WHERE session_id = ?",
            (SESSION_ID,),
        ).fetchone()
        if session is not None:
            rows.append(
                {
                    "id": f"runtime_sessions:{SESSION_ID}",
                    "cells": {"metadata": session["metadata"], "active": session["active"]},
                }
            )
        return rows
    finally:
        conn.close()


def seed_explorer_story(store: Store) -> None:
    """Seed a legacy runtime payload, so the first read exercises the fallback."""
    store.upsert_runtime_session(
        SESSION_ID,
        interface="explorer_story",
        journey=PROBE_JOURNEY,
        active=True,
        metadata=json.dumps(
            {"current_exploratory_story": "a legacy story only the fallback can see"},
            ensure_ascii=False,
        ),
    )


def explorer_story_probe(python_copy, frozen_datetime, now_iso: str) -> dict[str, Any]:
    import memory.storage.explorer_stories as storage_mod
    from memory.client import MemoryClient

    original_now = storage_mod._now
    original_uuid = storage_mod._uuid
    storage_mod._now = lambda: now_iso
    storage_mod._uuid = lambda: "wpexplr"

    mem = MemoryClient(db_path=python_copy)
    steps: list[dict[str, Any]] = []

    def record(step: str) -> None:
        row = mem.conn.execute(
            "SELECT * FROM exploratory_stories WHERE journey = ? ORDER BY created_at, id",
            (PROBE_JOURNEY,),
        ).fetchall()
        session = mem.conn.execute(
            "SELECT metadata, active FROM runtime_sessions WHERE session_id = ?",
            (SESSION_ID,),
        ).fetchone()
        steps.append(
            {
                "id": f"explorer:{step}",
                "cells": {
                    "rows": json.dumps([dict(r) for r in row], ensure_ascii=False, sort_keys=True),
                    "session_metadata": session[0] if session else None,
                    "session_active": session[1] if session else None,
                },
            }
        )

    try:
        seed_explorer_story(mem.store)
        record("0_legacy_seed")

        update_explorer_story(mem.store, PROBE_JOURNEY, current_exploratory_story=OPENING_STORY)
        record("1_open_migrates_legacy")

        update_explorer_story(
            mem.store,
            PROBE_JOURNEY,
            current_exploratory_story=THICKENED_STORY,
            last_story_card="the oracle moved while we were reading it",
        )
        record("2_thicken_preserves_identity")

        update_explorer_story(mem.store, PROBE_JOURNEY, narrative_field_summary=None)
        record("3_explicit_none_is_a_clear_not_a_keep")

        set_explorer_attractors(
            mem.store,
            PROBE_JOURNEY,
            [ExplorerAttractor(label=ATTRACTOR_LABEL, description=ATTRACTOR_DETAIL, status="accepted")],
        )
        record("4_attractor_unicode_bytes")

        set_explorer_experiment_proposal(
            mem.store,
            PROBE_JOURNEY,
            ExplorerExperimentProposal(title=EXPERIMENT_TITLE, status="proposed"),
        )
        record("5_experiment_replaces_null_column")

        set_explorer_source_conversations(
            mem.store,
            PROBE_JOURNEY,
            [ExplorerSourceConversation(conversation_id=SOURCE_CONVERSATION_ID, role="origin")],
        )
        record("6_source_evidence")

        archive_explorer_story(mem.store, PROBE_JOURNEY)
        record("7_archive_deactivates_runtime_payload")
    finally:
        mem.close()
        storage_mod._now = original_now
        storage_mod._uuid = original_uuid

    return {
        "label": "explorer_story_demo",
        "probe_type": "explorer_story",
        "now_iso": now_iso,
        "target_ids": [PROBE_JOURNEY],
        "explorer_story": {
            "journey": PROBE_JOURNEY,
            "session_id": SESSION_ID,
            "opening_story": OPENING_STORY,
            "thickened_story": THICKENED_STORY,
            "attractor_label": ATTRACTOR_LABEL,
            "attractor_detail": ATTRACTOR_DETAIL,
            "experiment_title": EXPERIMENT_TITLE,
            "source_conversation_id": SOURCE_CONVERSATION_ID,
            "uuid": "wpexplr",
        },
        "python_state": steps + _snapshot_rows(python_copy),
    }


# --- handoff artifacts ---------------------------------------------------

HANDOFF_TITLE = "Parity is a rendering problem"
HANDOFF_SUMMARY = "Enough shape to plan, not enough to commit."
HANDOFF_SYNTHESIS = "The wall was never the database."
HANDOFF_COLLISIONS = ("parity-is-a-rendering-problem", "parity-is-a-rendering-problem-2")
HANDOFF_TRANSCRIPT = (
    ("user", "my key is api_key=sk-abcdefghijklmnop and my path is /Users/nav/dev/project"),
    ("assistant", "mailed nav@example.com and called +55 21 99999-1234 — also १२३४५६७८९०"),
)


def explorer_handoff_probe(python_copy, frozen_datetime, now_iso: str) -> dict[str, Any]:
    """Write the five handoff documents into a scratch project on disk.

    Unlike every other probe here the graded state is FILESYSTEM state, because
    that is what this command produces: documents inside the user's own
    repository. The scratch project is created beside the database copy, so the
    harness's work directory stays the only thing either core touches.

    The transcript carries one instance of every redaction pattern, including a
    Devanagari phone number -- the row that separates Python's Unicode-aware
    `\\d` from JavaScript's ASCII one, and the only place in this story where a
    port can leak a real secret into a file the user commits.
    """
    from memory.services.explorer_handoff import (
        HandoffConversationSource,
        HandoffSourceMessage,
        write_builder_handoff_artifacts,
    )
    from memory.services.explorer_story import (
        ExplorerAttractor,
        ExplorerExperimentProposal,
        ExplorerStory,
    )

    work_dir = Path(python_copy).parent
    project = work_dir / "python-handoff-project"
    # Reset, because the harness reuses its work directory across runs and the
    # collision loop counts what it finds: a leftover `-3` from a previous run
    # makes this run choose `-4` while the TS side, which resets, chooses `-3`.
    # The probe would then fail for a reason that has nothing to do with the
    # port. Both sides reset; neither observes the other.
    shutil.rmtree(project, ignore_errors=True)
    explorations = project / "docs" / "project" / "explorations"
    for collision in HANDOFF_COLLISIONS:
        (explorations / collision).mkdir(parents=True, exist_ok=True)

    story = ExplorerStory(
        journey=PROBE_JOURNEY,
        id="wpexplr",
        title=HANDOFF_TITLE,
        status="active",
        current_exploratory_story=OPENING_STORY,
        narrative_field_summary="Two cores, one database, one denominator nobody trusts.",
        last_story_card="The oracle moved while we were reading it.",
        attractors=(
            ExplorerAttractor(
                label=ATTRACTOR_LABEL, description=ATTRACTOR_DETAIL, status="accepted"
            ),
        ),
        experiment_proposal=ExplorerExperimentProposal(title=EXPERIMENT_TITLE),
    )
    sources = (
        HandoffConversationSource(
            conversation_id=SOURCE_CONVERSATION_ID,
            title="Where parity breaks",
            role="origin",
            messages=tuple(
                HandoffSourceMessage(role=role, content=content)
                for role, content in HANDOFF_TRANSCRIPT
            ),
        ),
    )

    handoff = write_builder_handoff_artifacts(
        project,
        story,
        title=HANDOFF_TITLE,
        summary=HANDOFF_SUMMARY,
        editorial_synthesis=HANDOFF_SYNTHESIS,
        source_conversations=sources,
        include_full_conversation=True,
    )

    base = Path(handoff.artifact_dir)
    state = [
        {
            "id": "handoff:artifact_dir",
            "cells": {"path": base.relative_to(project).as_posix()},
        }
    ]
    for path in sorted(base.rglob("*")):
        if path.is_file():
            state.append(
                {
                    "id": f"handoff:{path.relative_to(base).as_posix()}",
                    "cells": {"content": path.read_text(encoding="utf-8")},
                }
            )

    return {
        "label": "explorer_handoff_demo",
        "probe_type": "explorer_handoff",
        "now_iso": now_iso,
        "target_ids": [PROBE_JOURNEY],
        "explorer_handoff": {
            # The TS side writes into its OWN scratch project beside the same
            # database copies, so neither core can observe the other's files.
            "ts_project_dir": str((work_dir / "ts-handoff-project").resolve()),
            "journey": PROBE_JOURNEY,
            "story_id": "wpexplr",
            "title": HANDOFF_TITLE,
            "summary": HANDOFF_SUMMARY,
            "editorial_synthesis": HANDOFF_SYNTHESIS,
            "current_story": OPENING_STORY,
            "narrative_summary": "Two cores, one database, one denominator nobody trusts.",
            "last_story_card": "The oracle moved while we were reading it.",
            "attractor_label": ATTRACTOR_LABEL,
            "attractor_detail": ATTRACTOR_DETAIL,
            "experiment_title": EXPERIMENT_TITLE,
            "source_conversation_id": SOURCE_CONVERSATION_ID,
            "source_title": "Where parity breaks",
            "collisions": list(HANDOFF_COLLISIONS),
            "transcript": [
                {"role": role, "content": content} for role, content in HANDOFF_TRANSCRIPT
            ],
        },
        "python_state": state,
    }


SEEDERS = {"explorer_story": seed_explorer_story}
PROBES = {"explorer_story": explorer_story_probe, "explorer_handoff": explorer_handoff_probe}
