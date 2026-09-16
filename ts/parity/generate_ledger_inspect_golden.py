"""Generate the ledger-inspect golden from the Python CLI (CV22.DS7.TS4 plateau 2).

`inspect llm-calls` and `inspect embedding-provenance` are the two ledger
reads. Unlike the catalog family (plateau 1), these two ARE argparse: a bad
`--limit` exits **2** with usage on stderr, where `extensions bogus` exits 1
with usage on stdout. Both classes live under one command name, which is why
the golden records stdout, stderr, and the exit code for every case.

The database is built here from `ts/test/fixtures/ledger-inspect/rows.json`,
the same file the TypeScript test seeds its own database from. Nothing binary
is committed, and both engines provably start from the same values.

Usage:
    uv run python ts/parity/generate_ledger_inspect_golden.py
"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ROWS_PATH = REPO_ROOT / "ts" / "test" / "fixtures" / "ledger-inspect" / "rows.json"
GOLDEN_PATH = REPO_ROOT / "ts" / "test" / "fixtures" / "ledger-inspect.golden.json"

CASES: list[tuple[str, list[str]]] = [
    ("llm_calls_default_limit", ["inspect", "llm-calls"]),
    ("llm_calls_limit_3", ["inspect", "llm-calls", "--limit", "3"]),
    ("llm_calls_limit_1", ["inspect", "llm-calls", "--limit", "1"]),
    ("llm_calls_role_embedding", ["inspect", "llm-calls", "--role", "embedding"]),
    ("llm_calls_role_unknown", ["inspect", "llm-calls", "--role", "nope"]),
    (
        "llm_calls_conversation",
        ["inspect", "llm-calls", "--conversation", "conv-0002-cccc-dddd"],
    ),
    # The store applies LIMIT; the CLI filters --session and --since AFTERWARDS.
    (
        "llm_calls_session_after_limit",
        ["inspect", "llm-calls", "--session", "session-gamma", "--limit", "3"],
    ),
    ("llm_calls_session_full", ["inspect", "llm-calls", "--session", "session-gamma"]),
    ("llm_calls_since_date", ["inspect", "llm-calls", "--since", "2026-01-12"]),
    ("llm_calls_since_future", ["inspect", "llm-calls", "--since", "2030-01-01"]),
    ("llm_calls_summary", ["inspect", "llm-calls", "--summary"]),
    ("llm_calls_summary_since", ["inspect", "llm-calls", "--summary", "--since", "2026-01-12"]),
    (
        "llm_calls_summary_since_future",
        ["inspect", "llm-calls", "--summary", "--since", "2030-01-01"],
    ),
    # argparse refusals: exit 2, usage on stderr.
    ("llm_calls_bad_limit", ["inspect", "llm-calls", "--limit", "x"]),
    ("llm_calls_unknown_option", ["inspect", "llm-calls", "--nope"]),
    ("llm_calls_role_without_value", ["inspect", "llm-calls", "--role"]),
    # provenance
    ("embedding_provenance", ["inspect", "embedding-provenance"]),
    ("embedding_provenance_unknown_option", ["inspect", "embedding-provenance", "--nope"]),
]

EMPTY_CASES: list[tuple[str, list[str]]] = [
    ("llm_calls_empty_database", ["inspect", "llm-calls"]),
    ("llm_calls_summary_empty_database", ["inspect", "llm-calls", "--summary"]),
    ("embedding_provenance_empty_database", ["inspect", "embedding-provenance"]),
]


def _seed(db_path: Path, rows: dict, *, empty: bool) -> None:
    from memory.db.schema import SCHEMA

    connection = sqlite3.connect(db_path)
    try:
        connection.executescript(SCHEMA)
        if empty:
            connection.commit()
            return
        for conversation in rows["conversations"]:
            connection.execute(
                "INSERT INTO conversations (id, started_at, interface) VALUES (?, ?, ?)",
                (conversation["id"], conversation["started_at"], conversation["interface"]),
            )
        for call in rows["llm_calls"]:
            connection.execute(
                """
                INSERT INTO llm_calls (
                    id, role, model, prompt, response, prompt_tokens, completion_tokens,
                    latency_ms, cost_usd, conversation_id, session_id, called_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    call["id"],
                    call["role"],
                    call["model"],
                    call["prompt"],
                    call["response"],
                    call["prompt_tokens"],
                    call["completion_tokens"],
                    call["latency_ms"],
                    call["cost_usd"],
                    call["conversation_id"],
                    call["session_id"],
                    call["called_at"],
                ),
            )
        for memory in rows["memories"]:
            embedding = memory["embedding"]
            connection.execute(
                """
                INSERT INTO memories (
                    id, memory_type, layer, title, content, created_at, embedding, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    memory["id"],
                    memory["memory_type"],
                    memory["layer"],
                    memory["title"],
                    memory["content"],
                    memory["created_at"],
                    embedding.encode("utf-8") if embedding is not None else None,
                    memory["metadata"],
                ),
            )
        connection.commit()
    finally:
        connection.close()


def _environment(home: Path) -> dict[str, str]:
    env = dict(os.environ)
    for key in list(env):
        if key.startswith("MIRROR_TS_") or key in {"MIRROR_HOME", "MIRROR_USER", "DB_PATH"}:
            del env[key]
    env["MIRROR_HOME"] = str(home)
    env["MEMORY_ENV"] = "test"
    env["OPENROUTER_API_KEY"] = ""
    env["PYTHONIOENCODING"] = "utf-8"
    # argparse wraps usage at the terminal width; pin it so the golden does not
    # depend on the generating machine's COLUMNS.
    env["COLUMNS"] = "80"
    return env


def _run(home: Path, argv: list[str]) -> dict[str, object]:
    completed = subprocess.run(
        [sys.executable, "-m", "memory", *argv, "--mirror-home", str(home)],
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


def main() -> int:
    rows = json.loads(ROWS_PATH.read_text(encoding="utf-8"))
    cases: list[dict[str, object]] = []

    with tempfile.TemporaryDirectory(prefix="ledger-golden-") as tmp:
        for label, argv in CASES:
            home = Path(tmp) / "seeded"
            if not home.exists():
                home.mkdir(parents=True)
                _seed(home / "memory_test.db", rows, empty=False)
            cases.append({"label": label, **_run(home, argv)})

        empty_home = Path(tmp) / "empty"
        empty_home.mkdir(parents=True)
        _seed(empty_home / "memory_test.db", rows, empty=True)
        for label, argv in EMPTY_CASES:
            cases.append({"label": label, **_run(empty_home, argv)})

        leaked = [
            case["label"]
            for case in cases
            if tmp in str(case["stdout"]) or tmp in str(case["stderr"])
        ]
        if leaked:
            print(f"absolute temp path leaked into: {leaked}", file=sys.stderr)
            return 1

    document = {
        "_generated_by": "ts/parity/generate_ledger_inspect_golden.py",
        "_semantics": (
            "Python's answer for `inspect llm-calls` and `inspect embedding-provenance`, "
            "one subprocess per case, over a database seeded from "
            "ts/test/fixtures/ledger-inspect/rows.json. These two leaves ARE argparse: "
            "their refusals exit 2 with usage on stderr."
        ),
        "cases": cases,
    }
    GOLDEN_PATH.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {GOLDEN_PATH.relative_to(REPO_ROOT)} ({len(cases)} cases)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
