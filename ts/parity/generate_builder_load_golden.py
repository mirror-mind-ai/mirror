"""Generate the `build load` golden (CV22.DS7.US8 plateau 7, Scope G).

`load` is the last leaf and the only one in this story that crosses the provider
seam, so its corpus is built in two halves that fail differently.

**The pure half, here.** `render_builder_mode_transition` and `_extract_query` are
deterministic functions over the journey document, and they carry most of the
divergence risk in the leaf:

* `_extract_query` reads FIVE section names, two of them Portuguese, and slices the
  result to 500 -- which is 500 CODE POINTS in Python and 500 UTF-16 units in a
  naive JavaScript port, so a briefing with emoji or CJK diverges silently and the
  only symptom is a different embedding, hence a differently ordered memories
  block. Cases carry astral characters at the boundary.
* the transition card's `_wrap` does NOT chunk over-long words (it truncates in
  `_line` instead), which is the opposite of the story cards -- the same asymmetry
  `explorer/transition.ts` already records for the Explorer card.
* `_extract_section` has a FALLBACK: when no section matches, it joins every
  non-heading line and slices to 240. A port that returns `None` there renders a
  card with no briefing row, and the row is what a Navigator reads first.
* `_extract_stage` is `re.MULTILINE` with `.+$`, so it stops at the line end and
  keeps interior whitespace before `.strip()`.

**The invocation half** lives in `_load_invocations` and drives the real
`cmd_load` in a subprocess under patched providers -- see that function's
docstring for why the seam is patched rather than replayed.

Run:  uv run python ts/parity/generate_builder_load_golden.py
"""

from __future__ import annotations

import json
import os
import shutil
import struct
import subprocess
import sys
import unicodedata
from pathlib import Path
from typing import Any

from memory.cli.build import _extract_query
from memory.surfaces.mode_transition import render_builder_mode_transition

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "builder-load.golden.json"
# Resolved against the repository root, which is both the generator's cwd and the
# TypeScript test's. Gitignored, like every other parity staging directory.
PARITY_ROOT = Path("tmp") / "parity" / "builder-load"
FROZEN_NOW = "2026-01-01T00:00:00+00:00"
SESSION_ID = "builder-load-session"

# A journey document with every feature the extractors look at: a Stage line, a
# Description section, and a heading that terminates capture.
FULL_JOURNEY = """# Mirror TypeScript Core Port
**Status:** active
**Stage:** DS7 — Command Burn-Down (26/27) — next: load

## Description

Dedicated journey to implement CV22, the TypeScript Core Port. Ports Mirror
Mind's Python core to TypeScript via a database-seam strangler.

## Scope

This heading terminates the capture, so nothing here reaches the query.
"""

# Portuguese section names, which the extractor accepts and a port written from
# the English ones alone would miss.
#
# TWO forms, and the difference is a real defect rather than a test detail.
# `_extract_query` compares the lowercased heading against a literal list, with no
# Unicode normalization, so `Descrição` written NFD (c + combining cedilla, a +
# combining tilde) does NOT match the NFC literal in `build.py` -- and the query
# silently falls back to the SLUG, which turns an informed memories block into a
# slug search. macOS filesystem APIs and some editors produce NFD text, so this is
# reachable by a real journey document.
#
# The port must reproduce it: JavaScript's `includes` compares code units too, so
# parity holds as long as neither side normalizes. A port that "helpfully" calls
# `.normalize("NFC")` fixes the defect and breaks parity, which is why BOTH forms
# are recorded. Carried to Debt Review as a CR.
_PORTUGUESE_TEMPLATE = """# Jornada em português
**Stage:** Fase 2

## {heading}

Uma jornada cuja abertura está em português.

## Outra seção

Isto não deve entrar na consulta.
"""

# The section test runs against EVERY line, not only headings, and a match
# `continue`s -- so a BODY line containing one of the five names is SILENTLY
# DROPPED from the query, while the lines around it are kept. Harmless in a long
# description; fatal in a short one, because a body whose only line mentions
# "context" captures nothing and the query collapses to the slug. Found exactly
# that way: the Portuguese case's body originally said "seção de contexto" and
# produced the slug with no error.
BODY_MENTION_JOURNEY = """# A journey whose prose mentions the magic words

## Description

This first sentence is kept.
The next line explains the context in which the work happens.
This line is kept too; only the line above it disappears.

## Scope

Not captured.
"""

# The same quirk where it actually bites: one body line, and it mentions a section
# name, so the query is the slug.
SINGLE_BODY_MENTION_JOURNEY = """# A journey with one line of prose

## Description

The whole description is about the context of this work.
"""

PORTUGUESE_NFC_JOURNEY = _PORTUGUESE_TEMPLATE.format(
    heading=unicodedata.normalize("NFC", "Descrição")
)
PORTUGUESE_NFD_JOURNEY = _PORTUGUESE_TEMPLATE.format(
    heading=unicodedata.normalize("NFD", "Descrição")
)

# No matching section at all: `_extract_section` falls back to every non-heading
# line joined and cut at 240, while `_extract_query` falls back to the SLUG. The
# two fallbacks differ, which is the point of having both here.
NO_SECTION_JOURNEY = """# A journey with no described section

Just a paragraph that belongs to no section.
And a second line of it.
"""

# 500 is a CODE POINT boundary. The run is long enough that the cut lands inside
# it: 520 astral characters are 520 code points to Python and 1040 UTF-16 units to
# JavaScript, so a naive `slice(0, 500)` keeps 250 of them and produces a visibly
# shorter query -- a different embedding, and therefore a differently ordered
# memories block, with no error anywhere.
ASTRAL_JOURNEY = (
    "# Astral journey\n**Stage:** 🟩 staged\n\n## Description\n\n"
    + ("🟦" * 520)
    + " tail words that fall past the five hundredth code point\n"
)

# A word longer than the card's 54-column wrap width: `_wrap` does NOT chunk it,
# so `_line` truncates it instead. The Explorer card records the same asymmetry.
LONG_WORD_JOURNEY = (
    "# Long word journey\n\n## Description\n\n" + ("x" * 120) + " and a short tail\n"
)

EMPTY_JOURNEY = ""

JOURNEYS: dict[str, str] = {
    "full": FULL_JOURNEY,
    "portuguese_nfc": PORTUGUESE_NFC_JOURNEY,
    "portuguese_nfd": PORTUGUESE_NFD_JOURNEY,
    "body_mention": BODY_MENTION_JOURNEY,
    "single_body_mention": SINGLE_BODY_MENTION_JOURNEY,
    "no_section": NO_SECTION_JOURNEY,
    "astral": ASTRAL_JOURNEY,
    "long_word": LONG_WORD_JOURNEY,
    "empty": EMPTY_JOURNEY,
    # The slug fallback: content that is only headings captures nothing.
    "headings_only": "# One\n## Two\n### Three\n",
}

PROJECT_PATHS: dict[str, str | None] = {
    "with_project": "/projects/mirror",
    "no_project": None,
}


def _transition_cases() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    for journey_name, content in JOURNEYS.items():
        for path_name, project_path in PROJECT_PATHS.items():
            cases.append(
                {
                    "name": f"transition_{journey_name}_{path_name}",
                    "journey": "demo-journey",
                    "journey_content": content,
                    "project_path": project_path,
                    "surface": render_builder_mode_transition(
                        journey="demo-journey",
                        journey_content=content,
                        project_path=project_path,
                    ),
                }
            )
    # A slug long enough to overflow the card, since the journey row is not wrapped
    # by `_wrap` alone -- `_line` truncates at WIDTH.
    long_slug = "a-journey-slug-that-is-far-longer-than-the-fifty-six-column-card"
    cases.append(
        {
            "name": "transition_long_slug",
            "journey": long_slug,
            "journey_content": FULL_JOURNEY,
            "project_path": "/projects/mirror",
            "surface": render_builder_mode_transition(
                journey=long_slug,
                journey_content=FULL_JOURNEY,
                project_path="/projects/mirror",
            ),
        }
    )
    return cases


def _query_cases() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    for journey_name, content in JOURNEYS.items():
        query = _extract_query(content, "demo-journey")
        cases.append(
            {
                "name": f"query_{journey_name}",
                "journey_content": content,
                "slug": "demo-journey",
                "query": query,
                # Recorded so a UTF-16 port fails on the LENGTH before anyone has
                # to read the two strings side by side.
                "query_code_points": len(query),
                # The slug fallback is a DIFFERENT outcome from a short capture,
                # and the NFD case reaches it by accident rather than by design.
                "fell_back_to_slug": query == "demo-journey",
            }
        )
    return cases


# The fixture BOTH engines read: Python through `build_load_oracle.py`'s patched
# seam, TypeScript through its replay embedding provider. One file, so the two
# sides cannot disagree about the query vector and therefore about the ranking.
#
# A constant vector is the right shape here and not a shortcut: the search corpus
# already grades the ranker against a frozen query vector, and what `load` adds is
# COMPOSITION -- two searches, a merge, a dedupe, a stable sort, a slice of six.
EMBEDDING_DIMENSIONS = 1536
LOAD_FIXTURE = {
    "embedding": [0.0125] * EMBEDDING_DIMENSIONS,
    "llm": {"default": "[]"},
    "now": FROZEN_NOW,
    # The pinned model name, recorded so the ledger row is graded rather than
    # normalized: both engines must write the same `model` for a replayed call.
    "embedding_model": "openai/text-embedding-3-small",
}

# What the TypeScript replay provider expects, from the same numbers.
TS_EMBEDDING_FIXTURE = {
    "kind": "embedding",
    "response": {"embedding": LOAD_FIXTURE["embedding"]},
}

FIXTURE_DIR = HERE.parent / "test" / "fixtures" / "builder-load"


def _write_fixtures() -> Path:
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    oracle_path = FIXTURE_DIR / "oracle-seam.json"
    oracle_path.write_text(
        json.dumps(LOAD_FIXTURE, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    (FIXTURE_DIR / "replay-embedding.json").write_text(
        json.dumps(TS_EMBEDDING_FIXTURE, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return oracle_path


# --- the invocation half ----------------------------------------------------
#
# The seed is DATA in the corpus, not code in two languages. The command golden
# mirrors its `_seed` by hand in TypeScript and that duplication has broken twice
# already -- once per plateau that added scenarios. Here each case carries its rows
# explicitly, so both engines build the same database from the same numbers and a
# divergence in the insert mechanics fails the comparison instead of hiding in it.

ROW_COLUMNS = (
    "session_id",
    "interface",
    "journey",
    "persona",
    "conversation_id",
    "active",
    "started_at",
    "updated_at",
    "closed_at",
    "metadata",
)


def _embedding(spike_index: int, spike: float, base: float = 0.0125) -> list[float]:
    """A vector that is the query's, with ONE dimension moved.

    Cosine is scale invariant, so scaling the query vector would make every memory
    tie at 1.0 and the ranking would be decided by insertion order -- which grades
    nothing about the merge. Moving a single dimension gives each memory its own
    deterministic score, and the spread is what the corpus is for.
    """
    vector = [base] * EMBEDDING_DIMENSIONS
    vector[spike_index] = spike
    return vector


# Six memories, so the top-6 slice has something to cut, with scores that are
# distinct by construction. Three carry the journey, three do not: the scoped
# search sees the first three and the global search sees all six, which is what
# makes the merge and the dedupe observable.
SEED_MEMORIES: list[dict[str, Any]] = [
    {
        "id": f"mem-{index:02d}",
        "memory_type": "insight",
        "layer": layer,
        "title": title,
        "content": content,
        "journey": journey,
        "created_at": FROZEN_NOW,
        "use_count": use_count,
        "relevance_score": 1.0,
        "embedding": _embedding(index, spike),
    }
    for index, (layer, title, content, journey, spike, use_count) in enumerate(
        [
            ("ego", "Scoped insight one", "The strangler ports one command at a time.", "demo", 0.9, 3),
            ("ego", "Scoped insight two", "Parity is proven against a Python oracle.", "demo", 0.7, 1),
            ("shadow", "Scoped insight three", "A green test that never failed is a belief.", "demo", 0.5, 0),
            ("ego", "Global insight one", "Journeys carry their own project path.", None, 0.8, 5),
            ("user", "Global insight two", "The Navigator validates on the real home.", None, 0.6, 2),
            ("ego", "Global insight three", "Cadence decides what may happen unasked.", None, 0.4, 0),
        ]
    )
]

LOAD_JOURNEY = """# Demo journey
**Stage:** Plateau 7 — load

## Description

A journey whose briefing becomes the search query for the memories block.
"""

# A journey whose whole Description is three words, which is the ONLY shape under
# which a degraded `load` can render anything at all.
#
# `_fts_query` quotes each whitespace-delimited word and joins them, so the MATCH
# expression is an AND over EVERY word of the query -- and `load`'s query is a
# briefing paragraph cut at 500 code points. In degraded mode the semantic term is
# gone and non-matching memories are dropped outright (`mem.id not in fts_lookup:
# continue`), so a real journey's briefing matches nothing and the memories block
# disappears silently. Both shapes are recorded: this one to grade the lexical-only
# RANKING, and `load_degraded_briefing_query` to grade what a Navigator actually
# meets during an outage.
LEXICAL_JOURNEY = """# Lexical journey
**Stage:** Plateau 7 — degraded

## Description

Strangler parity oracle
"""

# Two memories carrying all three query words and one carrying none. The third is
# what makes the degraded filter observable: it ranks in the healthy twin (its
# embedding is closest to the query's) and vanishes when the provider fails, which
# is a HARD filter rather than a lower score.
LEXICAL_MEMORIES: list[dict[str, Any]] = [
    {
        "id": "lex-scoped",
        "memory_type": "insight",
        "layer": "ego",
        "title": "Strangler parity",
        "content": "The strangler keeps parity with the oracle on every ported leaf.",
        "journey": "demo",
        "created_at": FROZEN_NOW,
        "use_count": 0,
        "relevance_score": 1.0,
        "embedding": _embedding(40, 0.42),
    },
    {
        "id": "lex-global",
        "memory_type": "insight",
        "layer": "user",
        "title": "Oracle parity",
        "content": "Parity against the oracle is what the strangler proves.",
        "journey": None,
        "created_at": FROZEN_NOW,
        "use_count": 0,
        "relevance_score": 1.0,
        "embedding": _embedding(80, 0.30),
    },
    {
        "id": "lex-semantic-only",
        "memory_type": "insight",
        "layer": "shadow",
        "title": "Cadence",
        "content": "Cadence decides what may happen unasked.",
        "journey": None,
        "created_at": FROZEN_NOW,
        "use_count": 0,
        "relevance_score": 1.0,
        # The HIGHEST semantic score of the three, so a healthy run ranks it first
        # and the degraded run drops it entirely.
        "embedding": _embedding(120, 0.95),
    },
]


def _freeze_now() -> None:
    """Freeze the clock in THIS process too.

    `upsert_runtime_session` imports `_now` inside the function, so patching
    `memory.models._now` reaches it -- but only in the process that patches. The
    driver freezes its own; without this the rows the GENERATOR seeds carry a real
    timestamp while the rows the driver writes carry the frozen one, and the corpus
    records a mixture that no replay can reproduce.
    """
    from memory import models

    models._now = lambda: FROZEN_NOW


def _seed_database(db_path: Path, project: Path, *, case: dict[str, Any]) -> None:
    """Build one case's database, using the same rows the corpus records."""
    from memory.builder.delivery_cursor import set_delivery_cursor
    from memory.builder.method_adoption import set_adopted_method
    from memory.client import MemoryClient

    mem = MemoryClient(env="test", db_path=db_path)
    if case.get("journey_content") is not None:
        mem.set_identity("journey", case["slug"], case["journey_content"])
        if case.get("with_project", True):
            # Written DIRECTLY, not through `set_project_path`, which resolves to an
            # absolute path. The transition card truncates that row at 56 columns and
            # the trailer prints it whole, so an absolute root puts a machine path in
            # the corpus -- half of it unrecoverable by substitution. A repo-relative
            # path is what the lifecycle corpus hands its renderers for the same
            # reason, and both engines run from the repository root.
            mem.store.conn.execute(
                "UPDATE identity SET metadata = ? WHERE layer = 'journey' AND key = ?",
                (json.dumps({"project_path": project.as_posix()}), case["slug"]),
            )
    for memory in case.get("memories", []):
        mem.store.conn.execute(
            "INSERT INTO memories (id, memory_type, layer, title, content, journey, "
            "created_at, relevance_score, embedding, use_count) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                memory["id"],
                memory["memory_type"],
                memory["layer"],
                memory["title"],
                memory["content"],
                memory["journey"],
                memory["created_at"],
                memory["relevance_score"],
                struct.pack(f"<{len(memory['embedding'])}f", *memory["embedding"]),
                memory["use_count"],
            ),
        )
    if case.get("adopted_method"):
        set_adopted_method(mem.store, case["slug"], case["adopted_method"])
    if case.get("cursor"):
        set_delivery_cursor(mem.store, journey=case["slug"], **case["cursor"])
    mem.store.conn.commit()
    mem.store.conn.close()


def _runtime_rows(db_path: Path) -> list[dict[str, Any]]:
    import sqlite3

    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            f"SELECT {', '.join(ROW_COLUMNS)} FROM runtime_sessions ORDER BY session_id"
        ).fetchall()
        return [{column: row[column] for column in ROW_COLUMNS} for row in rows]
    finally:
        connection.close()


def _memory_access(db_path: Path) -> list[dict[str, Any]]:
    """`log_access` is why `load` is a MUTATING read: this is the mutation.

    What is graded and what is not, deliberately. `log_access` stamps
    `datetime.now(timezone.utc)` directly -- not `models._now` -- so its VALUE
    cannot be frozen from outside and pinning it would make the corpus depend on a
    wall clock. What matters is WHICH memories were touched and HOW OFTEN, so the
    row records the access-log count and the presence of the cached timestamp.

    `use_count` is recorded too, and it must NOT move: retrieval calls
    `log_access`, while `log_use` is the separate, stronger signal for a memory the
    model actually drew on. A port that bumps `use_count` here inflates the
    reinforcement term for anything a Navigator merely loaded.
    """
    import sqlite3

    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            "SELECT m.id, m.use_count, m.last_accessed_at IS NOT NULL AS accessed, "
            "(SELECT COUNT(*) FROM memory_access_log a WHERE a.memory_id = m.id) AS access_rows "
            "FROM memories m ORDER BY m.id"
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


def _llm_calls(db_path: Path) -> list[dict[str, Any]]:
    import sqlite3

    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            "SELECT role, model, prompt_tokens, completion_tokens FROM llm_calls ORDER BY id"
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


# Nine memories, five of them in the journey, with spikes close enough that MMR's
# diversity penalty differs between the two candidate sets. That is what makes the
# DEDUPE observable: the same memory is ranked twice, with a different score each
# time, so keeping the first occurrence and keeping the last produce different
# blocks. With well-separated scores the two rules agree and the corpus grades
# nothing -- which is exactly what mutation testing reported before this case
# existed.
OVERLAPPING_MEMORIES: list[dict[str, Any]] = [
    # Three journey memories, mutually DISTINCT, and three near-duplicates of them
    # that are NOT in the journey. The scoped search ranks the first three alone;
    # the global search ranks them beside their twins, where MMR's diversity
    # penalty applies. So the same memory is scored twice, differently -- which is
    # the only condition under which keeping the FIRST occurrence of a duplicate id
    # differs from keeping the last. Mutation testing reported the rule ungraded
    # until this shape existed.
    *[
        {
            "id": f"ovl-scoped-{index}",
            "memory_type": "insight",
            "layer": "ego",
            "title": f"Scoped twin {index}",
            "content": f"Strangler prose variant {index} about parity and oracles.",
            "journey": "demo",
            "created_at": FROZEN_NOW,
            "use_count": 0,
            "relevance_score": 1.0,
            # Distinct per memory: see the note on the global twins below.
            "embedding": _embedding(10 + index * 20, 0.60 - index * 0.04),
        }
        for index in range(3)
    ],
    *[
        {
            "id": f"ovl-global-{index}",
            "memory_type": "insight",
            "layer": "user",
            "title": f"Global twin {index}",
            "content": f"Strangler prose variant {index} about parity and oracles.",
            "journey": None,
            "created_at": FROZEN_NOW,
            "use_count": 0,
            "relevance_score": 1.0,
            # Near its scoped twin so MMR treats them as redundant, and DISTINCT
            # from its siblings so no two candidates tie.
            #
            # Two measured reasons, both found here. First, a hair's difference
            # (0.599 against 0.600) left scores equal to six decimals, and the
            # rendered order then hung on the RECENCY term -- which reads a live
            # clock, so the block reordered between runs and the test failed only
            # when the suite ran long enough to shift the decay. Second, perfectly
            # SYMMETRIC embeddings made three candidates tie exactly, and the two
            # engines then emitted them in different order: under an exact tie the
            # MMR selection order differs between numpy's argmax and the
            # TypeScript loop. That is a real divergence in the shared ranker
            # rather than in `load`, it belongs to the search family, and it is
            # recorded as a CR instead of being pinned by a case engineered to
            # provoke it.
            "embedding": _embedding(10 + index * 20, 0.44 - index * 0.03),
        }
        for index in range(3)
    ],
]

LOAD_CASES: list[dict[str, Any]] = [
    {
        "name": "load_overlapping_scores",
        "slug": "demo",
        "journey_content": LOAD_JOURNEY,
        "memories": OVERLAPPING_MEMORIES,
    },
    {
        "name": "load_adopted_with_memories",
        "slug": "demo",
        "journey_content": LOAD_JOURNEY,
        "memories": SEED_MEMORIES,
        "adopted_method": "ariad",
        "cursor": {
            "method": "ariad",
            "active_item": "CV1.DS1.US1",
            "active_item_title": "A user story",
            "active_item_level": "user_story",
            "last_delivery_event": "plan_approved",
        },
    },
    {
        "name": "load_unadopted",
        "slug": "demo",
        "journey_content": LOAD_JOURNEY,
        "memories": SEED_MEMORIES,
    },
    {
        "name": "load_without_memories",
        "slug": "demo",
        "journey_content": LOAD_JOURNEY,
        "memories": [],
    },
    {
        "name": "load_without_project_path",
        "slug": "demo",
        "journey_content": LOAD_JOURNEY,
        "memories": SEED_MEMORIES[:2],
        "with_project": False,
    },
    {
        "name": "load_unknown_journey",
        "slug": "missing",
        "journey_content": None,
        "memories": [],
    },
    # --- the provider outage, in the two shapes it takes -------------------
    #
    # A TWIN PAIR: identical seed, identical cursor, one healthy and one with the
    # embedding seam raising. Everything a surface golden can see is the same
    # except the memories block, which is the whole finding -- the card carries no
    # marker, so a Navigator cannot tell an outage from a quiet corpus (item 18c,
    # carried to Debt Review as a CR rather than marked here).
    #
    # The two names are the SAME LENGTH on purpose, and must stay that way. Each
    # case stages `tmp/parity/builder-load/<name>/project` and the transition card
    # PADS that row to 56 columns, so twins whose names differ by one character
    # differ by one space inside the card -- and the test that proves the outage
    # changes nothing but the memories block could no longer compare them.
    {
        "name": "load_lexical_healthy",
        "slug": "demo",
        "journey_content": LEXICAL_JOURNEY,
        "memories": LEXICAL_MEMORIES,
        "adopted_method": "ariad",
        "cursor": {
            "method": "ariad",
            "active_item": "CV1.DS1.US1",
            "active_item_title": "A user story",
            "active_item_level": "user_story",
            "last_delivery_event": "plan_approved",
        },
    },
    {
        "name": "load_lexical_offline",
        "slug": "demo",
        "journey_content": LEXICAL_JOURNEY,
        "memories": LEXICAL_MEMORIES,
        "adopted_method": "ariad",
        "cursor": {
            "method": "ariad",
            "active_item": "CV1.DS1.US1",
            "active_item_title": "A user story",
            "active_item_level": "user_story",
            "last_delivery_event": "plan_approved",
        },
        "fail_embedding": True,
    },
    # The PARTIAL outages, in both directions. `load` embeds twice and each search
    # catches its own failure, so a rate limit that arrives between the two calls
    # leaves one ranking semantic and the other lexical inside a single command.
    #
    # BOTH directions are recorded because the rule is "either search degrading
    # degrades the command", and one case can only prove half of it: with the
    # second call failing, reporting only the second status looks correct; with
    # the first failing, reporting only the first does. Mutation testing surfaced
    # each half in turn.
    {
        "name": "load_partial_outage",
        "slug": "demo",
        "journey_content": LEXICAL_JOURNEY,
        "memories": LEXICAL_MEMORIES,
        "adopted_method": "ariad",
        "cursor": {
            "method": "ariad",
            "active_item": "CV1.DS1.US1",
            "active_item_title": "A user story",
            "active_item_level": "user_story",
            "last_delivery_event": "plan_approved",
        },
        "fail_embedding_calls": [2],
    },
    {
        "name": "load_first_call_outage",
        "slug": "demo",
        "journey_content": LEXICAL_JOURNEY,
        "memories": LEXICAL_MEMORIES,
        "adopted_method": "ariad",
        "cursor": {
            "method": "ariad",
            "active_item": "CV1.DS1.US1",
            "active_item_title": "A user story",
            "active_item_level": "user_story",
            "last_delivery_event": "plan_approved",
        },
        "fail_embedding_calls": [1],
    },
    # The realistic outage: a briefing-length query, ANDed word by word against
    # FTS5, matching nothing. The block vanishes and the lifecycle continues --
    # sticky defaults, mode row, conversation switch, exit 0.
    {
        "name": "load_degraded_briefing_query",
        "slug": "demo",
        "journey_content": LOAD_JOURNEY,
        "memories": SEED_MEMORIES,
        "adopted_method": "ariad",
        "cursor": {
            "method": "ariad",
            "active_item": "CV1.DS1.US1",
            "active_item_title": "A user story",
            "active_item_level": "user_story",
            "last_delivery_event": "plan_approved",
        },
        "fail_embedding": True,
    },
]


def _run_case(case: dict[str, Any], oracle_fixture: Path) -> dict[str, Any]:
    # A REPO-RELATIVE root, like the lifecycle corpus, and for the same reason
    # (CR082): the transition card truncates the project-path row at 56 columns, so
    # an absolute temp root leaves a truncated PREFIX in the golden -- machine
    # dependent, and unfixable by substitution because half the path is gone. Under
    # `tmp/parity/builder-load/<case>` the row is byte-stable by construction and
    # stays fully graded; the TypeScript replay stages the same relative directory.
    tmp = PARITY_ROOT / case["name"]
    shutil.rmtree(tmp, ignore_errors=True)
    try:
        home = tmp / "home"
        home.mkdir(parents=True)
        project = tmp / "project"
        (project / "docs" / "project" / "roadmap").mkdir(parents=True)
        (project / "docs" / "project" / "roadmap" / "index.md").write_text(
            "# Roadmap\n", encoding="utf-8"
        )
        # A NEUTRAL checkout marker, so the clone-role guard's input is staged
        # rather than inherited.
        #
        # `_is_mirror_mind_checkout` walks up from the project path and stops at the
        # first directory holding `pyproject.toml` and `src/memory`, then asks
        # whether that pyproject declares `name = "mirror"`. The staging directory
        # lives inside THIS checkout, so without these two files the walk finds
        # Mirror Mind's own pyproject, the guard proceeds, and the outcome depends on
        # the developer's `.mirror-clone-role` -- `dev` on this machine, ABSENT in
        # CI, where the default is `production` and every case refused. Found by CI,
        # which is the environment that did not share the assumption.
        #
        # The guard itself is graded in TypeScript with an injected refusal: its real
        # inputs are a git root and a marker file, both properties of the machine
        # rather than of the command.
        (project / "src" / "memory").mkdir(parents=True)
        (project / "pyproject.toml").write_text(
            '[project]\nname = "builder-load-fixture"\n', encoding="utf-8"
        )
        db_path = home / "memory.db"
        _seed_database(db_path, project, case=case)

        environment = dict(os.environ)
        # ABSOLUTE, because one case runs from a different working directory and a
        # relative `DB_PATH` would silently resolve against it -- creating a fresh
        # empty database and reporting `journey 'demo' not found`. The PROJECT path
        # stays relative on purpose: it is recorded in the journey row and rendered
        # into the card, where an absolute root would be machine-dependent.
        environment["DB_PATH"] = str(db_path.resolve())
        environment["MIRROR_HOME"] = str(home.resolve())
        environment["MEMORY_ENV"] = "test"
        environment["PYTHONPATH"] = str(HERE.parent.parent / "src")
        environment.pop("MIRROR_SESSION_ID", None)
        completed = subprocess.run(
            [
                sys.executable,
                str(HERE / "build_load_oracle.py"),
                case["slug"],
                str(oracle_fixture),
                "--session-id",
                SESSION_ID,
                *(["--fail-embedding"] if case.get("fail_embedding") else []),
                *(
                    [
                        "--fail-embedding-calls",
                        ",".join(str(call) for call in case["fail_embedding_calls"]),
                    ]
                    if case.get("fail_embedding_calls")
                    else []
                ),
            ],
            capture_output=True,
            text=True,
            env=environment,
            # A journey with NO project path makes the clone-role guard inspect the
            # CURRENT DIRECTORY instead -- so that case runs from its own staged
            # root, whose neutral pyproject short-circuits the guard. Every other
            # case runs from the repository root, because their project paths are
            # recorded relative to it.
            #
            # Worth stating as behavior rather than as harness trivia: a Navigator
            # running `build load` for a path-less journey is judged by wherever the
            # shell happens to be, which inside a production-marked clone is a
            # refusal.
            cwd=str(project if not case.get("with_project", True) else HERE.parent.parent),
            check=False,
        )
        return {
            "name": case["name"],
            "slug": case["slug"],
            "project_root": project.as_posix(),
            # The TRANSPORT the oracle ran under, so the replay injects the same
            # one. Recorded per case rather than inferred from the name: a replay
            # that guesses its own transport grades whatever it guessed.
            "fail_embedding": bool(case.get("fail_embedding")),
            # Which round-trips failed, one-based. Empty with `fail_embedding` set
            # means every call failed; `[2]` is the rate limit that arrives
            # mid-command.
            "fail_embedding_calls": list(case.get("fail_embedding_calls", [])),
            "seed": {
                "journey_content": case.get("journey_content"),
                "with_project": case.get("with_project", True),
                "memories": case.get("memories", []),
                "adopted_method": case.get("adopted_method"),
                "cursor": case.get("cursor"),
            },
            "stdout": completed.stdout,
            "stderr": completed.stderr,
            "exit_code": completed.returncode,
            "runtime_sessions": _runtime_rows(db_path),
            "memory_access": _memory_access(db_path),
            "llm_calls": _llm_calls(db_path),
        }
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _load_invocations(oracle_fixture: Path) -> list[dict[str, Any]]:
    return [_run_case(case, oracle_fixture) for case in LOAD_CASES]


def build_payload() -> dict[str, Any]:
    oracle_fixture = _write_fixtures()
    return {
        "transitions": _transition_cases(),
        "queries": _query_cases(),
        "invocations": _load_invocations(oracle_fixture),
    }


def _assert_no_absolute_paths(payload: str) -> None:
    """Refuse a golden that would differ between two checkouts.

    The same guard every generator in this story carries, added here after an
    absolute project root reached the corpus through `set_project_path`.
    """
    leaks = [
        marker
        for marker in ("/Users/", "/home/runner", "/private/var", "/var/folders")
        if marker in payload
    ]
    if leaks:
        raise SystemExit(
            f"refusing to write a machine-dependent golden: it contains {leaks[0]!r}. "
            "Seed the project path repo-relative rather than substituting the text -- "
            "the transition card truncates that row, and a truncated prefix cannot be "
            "redacted."
        )


def main() -> None:
    _freeze_now()
    payload = build_payload()
    text = json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False)
    _assert_no_absolute_paths(text)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(text + "\n", encoding="utf-8")
    print(
        f"{len(payload['transitions'])} transition cases, "
        f"{len(payload['queries'])} query cases, "
        f"{len(payload['invocations'])} invocations"
    )
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")
    print(f"wrote {FIXTURE_DIR.relative_to(HERE.parent.parent)}/")


if __name__ == "__main__":
    main()
