"""Generate the ES-001 metadata-lifecycle WRITE golden (CV22.DS7.TS4 plateau 6).

The two faces US11 refused by name and handed to this story:

    conversations --metadata-lifecycle-apply <conversation-id> [--title/--summary/--tags]
    conversations --metadata-lifecycle-demo

`apply` is graded on a seeded database: each case records the report Python
printed AND the conversation row afterwards, because a report that says
`mutated: true` while the row keeps its old title is exactly the defect a
report-only corpus cannot see. `demo` is graded as a whole document; it builds
its own in-memory world, so only its generated ids are aliased.

The seeded states are the ones the plan-stage quality-assurance panel named:
"real apply needs a copy holding a manually locked title, a refine candidate,
and a deferred-tags conversation, or the branches are theory". Each is seeded
through the real service so its metadata is authentic rather than guessed, and
the resulting rows are recorded so the TypeScript replay starts from the same
world.

Usage:
    uv run python ts/parity/generate_lifecycle_write_golden.py
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
GOLDEN_PATH = REPO_ROOT / "ts" / "test" / "goldens" / "lifecycle-write.golden.json"
ID_RE = re.compile(r"\b[0-9a-f]{8}\b")
TIMESTAMP_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)")

LONG_SUMMARY = (
    "Editorial workflow for a manuscript. Scrivener import, cover briefing, "
    "Kindle export, EPUB validation, chapter cleanup, raw text hygiene."
)


def _environment(home: Path) -> dict[str, str]:
    env = dict(os.environ)
    for key in list(env):
        if key.startswith("MIRROR_TS_") or key in {"MIRROR_HOME", "MIRROR_USER", "DB_PATH"}:
            del env[key]
    env["MIRROR_HOME"] = str(home)
    env["MEMORY_ENV"] = "test"
    env["MEMORY_RECEPTION"] = "0"
    env["OPENROUTER_API_KEY"] = ""
    env["PYTHONIOENCODING"] = "utf-8"
    return env


def _run(home: Path, argv: list[str]) -> dict[str, Any]:
    completed = subprocess.run(
        [sys.executable, "-m", "memory", "conversations", *argv, "--mirror-home", str(home)],
        cwd=REPO_ROOT,
        env=_environment(home),
        capture_output=True,
        text=True,
    )
    return {
        "argv": argv,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "exit_code": completed.returncode,
    }


def _normalize(document: Any, aliases: dict[str, str], stamps: dict[str, str]) -> Any:
    """Make the whole document reproducible: aliased ids, sequenced timestamps.

    Every id here is a uuid4 prefix and every timestamp a real clock, so a
    golden carrying them raw could never regenerate identically and the CI
    determinism gate would fail on the first re-run. Ids become `<IDn>` in
    first-seen order; timestamps become a monotonic `2026-01-01T00:00:0nZ`
    sequence, which preserves the ORDERING the engine reads them for while
    dropping the wall clock.
    """
    if isinstance(document, dict):
        return {key: _normalize(value, aliases, stamps) for key, value in document.items()}
    if isinstance(document, list):
        return [_normalize(value, aliases, stamps) for value in document]
    if isinstance(document, str):
        replaced = _alias_ids(document, aliases)
        for raw in sorted(TIMESTAMP_RE.findall(replaced)):
            if raw not in stamps:
                stamps[raw] = f"2026-01-01T00:00:{len(stamps):02d}Z"
        for raw, stamp in stamps.items():
            replaced = replaced.replace(raw, stamp)
        return replaced
    return document


def _alias_ids(text: str, aliases: dict[str, str]) -> str:
    """Replace every generated 8-hex id with a stable alias, in first-seen order."""

    def replace(match: re.Match[str]) -> str:
        value = match.group(0)
        if value not in aliases:
            aliases[value] = f"<ID{len(aliases) + 1}>"
        return aliases[value]

    return ID_RE.sub(replace, text)


def _seed(mem, *, state: str) -> str:
    """Create one conversation in a named lifecycle state, through the real service."""
    conversations = mem.conversations
    if state == "repair":
        conversation = conversations.start_conversation("cli")
        conversations.set_provisional_title(conversation.id, "vamos trabalhar no maestro")
        conversations.add_message(conversation.id, "user", "Vamos validar checkpoint visibility")
        conversations.add_message(conversation.id, "assistant", "Vamos revisar o handoff")
        return conversation.id
    if state == "manual_lock":
        conversation = conversations.start_conversation("cli", title="Initial title")
        conversations.add_message(conversation.id, "user", "Quero corrigir títulos")
        conversations.add_message(conversation.id, "assistant", "Vamos desenhar a correção")
        conversations.update_title(conversation.id, "Manual conversation title")
        return conversation.id
    if state == "refine_candidate":
        conversation = conversations.start_conversation("cli", title="Initial editorial session")
        conversations.add_message(conversation.id, "user", "Let's begin")
        conversations.add_message(conversation.id, "assistant", "Ready")
        mem.store.update_conversation(conversation.id, summary=LONG_SUMMARY)
        return conversation.id
    if state == "summary_and_tags_ready":
        # Four substantive messages and no stored summary: summary decides
        # `create`, tags decide `defer` until a summary lands in the SAME apply.
        conversation = conversations.start_conversation("cli")
        conversations.set_provisional_title(conversation.id, "primeiro assunto do dia")
        for index in range(4):
            role = "user" if index % 2 == 0 else "assistant"
            conversations.add_message(
                conversation.id,
                role,
                f"Mensagem {index} sobre o planejamento editorial e os proximos passos.",
            )
        return conversation.id
    if state == "long_summary_target":
        conversation = conversations.start_conversation("cli")
        for index in range(4):
            role = "user" if index % 2 == 0 else "assistant"
            conversations.add_message(
                conversation.id, role, f"Mensagem {index} com substancia suficiente."
            )
        return conversation.id
    if state == "untitleable":
        return conversations.start_conversation("cli").id
    raise ValueError(f"unknown seed state: {state}")


def _rows(db_path: Path, conversation_ids: dict[str, str]) -> dict[str, Any]:
    import sqlite3

    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    try:
        rows = {}
        for state, conversation_id in conversation_ids.items():
            row = connection.execute(
                "SELECT id, title, summary, tags, metadata FROM conversations WHERE id = ?",
                (conversation_id,),
            ).fetchone()
            rows[state] = dict(row) if row else None
        return rows
    finally:
        connection.close()


def _world(db_path: Path) -> dict[str, Any]:
    """Every seeded conversation and message, so the replay starts identical."""
    import sqlite3

    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    try:
        conversations = [
            dict(row)
            for row in connection.execute(
                "SELECT id, interface, title, started_at, summary, tags, metadata "
                "FROM conversations ORDER BY started_at, id"
            )
        ]
        messages = [
            dict(row)
            for row in connection.execute(
                "SELECT id, conversation_id, role, content, created_at FROM messages "
                "ORDER BY created_at, id"
            )
        ]
    finally:
        connection.close()
    return {"conversations": conversations, "messages": messages}


def main() -> int:
    for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "OPENROUTER_API_KEY"):
        os.environ.pop(key, None)
    os.environ["MEMORY_RECEPTION"] = "0"

    with tempfile.TemporaryDirectory(prefix="lifecycle-write-golden-") as raw_tmp:
        home = Path(raw_tmp) / "mirror"
        home.mkdir(parents=True)
        db_path = home / "memory_test.db"
        os.environ["DB_PATH"] = str(db_path)

        from memory.client import MemoryClient

        mem = MemoryClient(env="test", db_path=db_path)
        states = [
            "repair",
            "manual_lock",
            "refine_candidate",
            "summary_and_tags_ready",
            "long_summary_target",
            "untitleable",
        ]
        ids = {state: _seed(mem, state=state) for state in states}
        mem.store.conn.commit()
        mem.store.conn.close()

        world = _world(db_path)

        # (label, state or None, extra argv). Ordered: later cases see earlier
        # writes, which is how "apply twice" is graded at all.
        cases: list[tuple[str, str | None, list[str]]] = [
            (
                "apply_repairs_a_provisional_title",
                "repair",
                ["--title", "Maestro checkpoint visibility validation"],
            ),
            (
                "apply_again_after_the_repair",
                "repair",
                ["--title", "A second title nobody asked for"],
            ),
            (
                "apply_preserves_a_manual_lock",
                "manual_lock",
                ["--title", "Generated replacement title"],
            ),
            (
                "apply_refuses_a_refine_candidate",
                "refine_candidate",
                ["--title", "Better editorial workflow title"],
            ),
            ("apply_with_no_values", "repair", []),
            # The flag is `--tag`, singular and REPEATABLE (`dest="tags"`,
            # `action="append"`); there is no `--tags`. Measured: the plural
            # spelling is an argparse error, so a corpus written from the
            # parameter name alone would grade nothing.
            (
                "apply_blank_summary_on_a_create_decision",
                "summary_and_tags_ready",
                ["--summary", "   "],
            ),
            (
                "apply_creates_a_summary_and_carries_deferred_tags",
                "summary_and_tags_ready",
                [
                    "--summary",
                    "Planejamento editorial com os proximos passos acordados.",
                    "--tag",
                    "editorial",
                    "--tag",
                    "planejamento",
                ],
            ),
            (
                "apply_tags_after_the_summary_landed",
                "summary_and_tags_ready",
                ["--tag", "tarde-demais"],
            ),
            (
                "apply_a_summary_that_is_already_stored",
                "refine_candidate",
                ["--summary", "A replacement summary"],
            ),
            # Python truncates the summary with a slice, and a slice counts
            # CODE POINTS. The astral character below straddles position 1000,
            # where a UTF-16 slice would cut a surrogate pair in half and store
            # a lone surrogate.
            (
                "apply_truncates_a_long_summary_by_code_points",
                "long_summary_target",
                ["--summary", "a" * 999 + "\U0001f600" + "b" * 200],
            ),
            (
                "apply_on_an_untitleable_conversation",
                "untitleable",
                ["--title", "A title for a conversation with no messages"],
            ),
            ("apply_unknown_conversation", None, ["--title", "Nobody"]),
        ]

        recorded: list[dict[str, Any]] = []
        for label, state, extra in cases:
            conversation_id = ids[state] if state else "does-not-exist"
            answer = _run(home, ["--metadata-lifecycle-apply", conversation_id, *extra])
            recorded.append(
                {
                    "label": label,
                    "state": state,
                    "conversation_id": conversation_id,
                    "extra_argv": extra,
                    **answer,
                    "rows_after": _rows(db_path, ids),
                }
            )

        demo = _run(home, ["--metadata-lifecycle-demo"])

    aliases: dict[str, str] = {}
    document = {
        "_generated_by": "ts/parity/generate_lifecycle_write_golden.py",
        "_semantics": (
            "Python's answer for `conversations --metadata-lifecycle-apply` and "
            "`--metadata-lifecycle-demo`: the printed report, the exit code, and the "
            "conversation rows afterwards. Generated ids are aliased in first-seen order; "
            "the seeded world is carried so the replay starts from identical rows. A case "
            "carrying `divergence` records `stderr` as null: a CPython traceback is not "
            "portable, and the final line is what the port reproduces."
        ),
        "world": world,
        "ids": ids,
        "cases": [
            {
                **case,
                "stdout": case["stdout"],
                "stderr": None if case["exit_code"] != 0 else case["stderr"],
                "stderr_final_line": (
                    str(case["stderr"]).rstrip("\n").rsplit("\n", 1)[-1]
                    if case["exit_code"] != 0
                    else None
                ),
                "divergence": "python_traceback" if case["exit_code"] != 0 else None,
            }
            for case in recorded
        ],
        "demo": {
            **demo,
            "stdout": _alias_ids(demo["stdout"], aliases),
            "alias_count": None,
        },
    }
    document["demo"]["alias_count"] = len(aliases)
    # The demo's ids were aliased against `aliases` already; normalising the
    # rest of the document continues the same numbering, which is why the demo
    # is rendered before this call rather than inside it.
    normalized = _normalize(document, aliases, {})
    GOLDEN_PATH.write_text(
        json.dumps(normalized, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {GOLDEN_PATH.relative_to(REPO_ROOT)} ({len(recorded)} apply cases + demo)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
