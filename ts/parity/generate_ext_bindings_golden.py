"""Generate the bindings + migrations golden from Python (CV22.DS7.TS4 plateau 3).

Two things are graded here and they are different in kind:

  * the STREAMS of `ext <id> bind|unbind|bindings|migrate`, recorded from the
    real CLI in subprocesses; and
  * the ROWS those commands leave in `_ext_bindings` and `_ext_migrations`,
    read back after each step, because a command that prints the right line
    and writes the wrong row is exactly the defect this corpus exists to catch.

`created_at` / `applied_at` are wall-clock, so each recorded row keeps its
value replaced by a token: the bytes are graded by the write probe with a
frozen clock, and the SHAPE is asserted here (a `+00:00` isoformat, never the
`Z` spelling the rest of Mirror uses).

The migration scripts live in `ts/test/fixtures/ext-bindings/migrations/`, one
directory per scenario, and they stage the splitter's real traps: a semicolon
inside a string literal, an escaped quote, a block comment holding a fake
statement, and a prefix violation.

Usage:
    uv run python ts/parity/generate_ext_bindings_golden.py
"""

from __future__ import annotations

import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FIXTURES = REPO_ROOT / "ts" / "test" / "fixtures" / "ext-bindings"
GOLDEN_PATH = REPO_ROOT / "ts" / "test" / "fixtures" / "ext-bindings.golden.json"
EXTENSION_ID = "beta"
TIMESTAMP_TOKEN = "<TIMESTAMP>"
ISO_UTC_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+00:00")

# (label, argv after `ext`). Ordered: later cases see earlier writes.
STEPS: list[tuple[str, list[str]]] = [
    ("bindings_empty", [EXTENSION_ID, "bindings"]),
    ("bind_persona", [EXTENSION_ID, "bind", "context", "--persona", "engineer"]),
    (
        "bind_persona_again_is_idempotent",
        [EXTENSION_ID, "bind", "context", "--persona", "engineer"],
    ),
    ("bind_journey", [EXTENSION_ID, "bind", "context", "--journey", "mirror-ts-core"]),
    ("bind_global", [EXTENSION_ID, "bind", "briefing", "--global"]),
    ("bind_global_again_duplicates", [EXTENSION_ID, "bind", "briefing", "--global"]),
    ("bindings_populated", [EXTENSION_ID, "bindings"]),
    ("unbind_persona", [EXTENSION_ID, "unbind", "context", "--persona", "engineer"]),
    (
        "unbind_persona_again_finds_nothing",
        [EXTENSION_ID, "unbind", "context", "--persona", "engineer"],
    ),
    ("unbind_global_removes_every_duplicate", [EXTENSION_ID, "unbind", "briefing", "--global"]),
    ("bind_without_tail", [EXTENSION_ID, "bind"]),
    ("bind_without_target", [EXTENSION_ID, "bind", "context"]),
    ("bind_unrecognised_argument", [EXTENSION_ID, "bind", "context", "--everywhere"]),
    ("bind_help_describes_and_does_not_write", [EXTENSION_ID, "bind", "--help"]),
    ("migrate_help_describes_and_does_not_apply", [EXTENSION_ID, "migrate", "--help"]),
    ("bindings_after_unbinds", [EXTENSION_ID, "bindings"]),
    ("migrate_applies_pending", [EXTENSION_ID, "migrate"]),
    ("migrate_is_idempotent", [EXTENSION_ID, "migrate"]),
    ("migrate_unknown_extension", ["ext-nope", "migrate"]),
]

# Scenarios that need their own migrations directory and a fresh database.
MIGRATION_SCENARIOS: list[tuple[str, str]] = [
    ("migrate_prefix_violation", "prefix-violation"),
    ("migrate_invalid_filename", "invalid-filename"),
    ("migrate_failing_sql_rolls_back", "failing-sql"),
    ("migrate_drifted_file", "drift"),
]


def _environment(home: Path) -> dict[str, str]:
    env = dict(os.environ)
    for key in list(env):
        if key.startswith("MIRROR_TS_") or key in {"MIRROR_HOME", "MIRROR_USER", "DB_PATH"}:
            del env[key]
    env["MIRROR_HOME"] = str(home)
    env["MEMORY_ENV"] = "test"
    env["OPENROUTER_API_KEY"] = ""
    env["PYTHONIOENCODING"] = "utf-8"
    return env


def _make_home(tmp: Path, name: str, migrations: str | None) -> Path:
    from memory.db.schema import SCHEMA

    home = tmp / name
    (home / "extensions" / EXTENSION_ID).mkdir(parents=True)
    if migrations is not None:
        shutil.copytree(FIXTURES / migrations, home / "extensions" / EXTENSION_ID / "migrations")
    connection = sqlite3.connect(home / "memory_test.db")
    try:
        connection.executescript(SCHEMA)
        connection.commit()
    finally:
        connection.close()
    return home


def _rows(home: Path) -> dict[str, list[dict[str, object]]]:
    connection = sqlite3.connect(home / "memory_test.db")
    connection.row_factory = sqlite3.Row
    try:
        bindings = [
            {**dict(row), "created_at": TIMESTAMP_TOKEN}
            for row in connection.execute(
                "SELECT extension_id, capability_id, target_kind, target_id, created_at "
                "FROM _ext_bindings ORDER BY capability_id, target_kind, "
                "COALESCE(target_id, ''), created_at"
            )
        ]
        migrations = [
            {**dict(row), "applied_at": TIMESTAMP_TOKEN}
            for row in connection.execute(
                "SELECT extension_id, filename, checksum, applied_at "
                "FROM _ext_migrations ORDER BY filename"
            )
        ]
        tables = [
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ext_%' "
                "ORDER BY name"
            )
        ]
    finally:
        connection.close()
    return {"bindings": bindings, "migrations": migrations, "tables": tables}


def _redact(text: str, home: Path) -> str:
    return ISO_UTC_RE.sub(TIMESTAMP_TOKEN, text.replace(str(home), "<HOME>"))


def _run(home: Path, argv: list[str]) -> dict[str, object]:
    completed = subprocess.run(
        [sys.executable, "-m", "memory", "ext", *argv, "--mirror-home", str(home)],
        cwd=REPO_ROOT,
        env=_environment(home),
        capture_output=True,
        text=True,
    )
    return {
        "argv": argv,
        "stdout": _redact(completed.stdout, home),
        "stderr": _redact(completed.stderr, home),
        "exit_code": completed.returncode,
    }


def main() -> int:
    cases: list[dict[str, object]] = []
    with tempfile.TemporaryDirectory(prefix="ext-bindings-golden-") as raw_tmp:
        tmp = Path(raw_tmp)

        home = _make_home(tmp, "main", "happy")
        for label, argv in STEPS:
            cases.append({"label": label, "scenario": "happy", **_run(home, argv), **_rows(home)})

        for label, scenario in MIGRATION_SCENARIOS:
            scenario_home = _make_home(tmp, label, scenario)
            if scenario == "drift":
                # Apply once, then edit the file's SQL so the second run sees
                # a checksum that no longer matches.
                _run(scenario_home, [EXTENSION_ID, "migrate"])
                path = (
                    scenario_home / "extensions" / EXTENSION_ID / "migrations" / "001_initial.sql"
                )
                path.write_text(
                    path.read_text(encoding="utf-8").replace("'alpha'", "'beta'"),
                    encoding="utf-8",
                )
            cases.append(
                {
                    "label": label,
                    "scenario": scenario,
                    **_run(scenario_home, [EXTENSION_ID, "migrate"]),
                    **_rows(scenario_home),
                }
            )

        # A comment-and-whitespace-only edit is tolerated: same checksum.
        tolerant_home = _make_home(tmp, "tolerated_edit", "happy")
        _run(tolerant_home, [EXTENSION_ID, "migrate"])
        path = tolerant_home / "extensions" / EXTENSION_ID / "migrations" / "001_initial.sql"
        path.write_text(
            "-- a new comment line\n" + path.read_text(encoding="utf-8").replace("\n", "\n\n"),
            encoding="utf-8",
        )
        cases.append(
            {
                "label": "migrate_tolerates_comment_and_whitespace_edit",
                "scenario": "happy",
                **_run(tolerant_home, [EXTENSION_ID, "migrate"]),
                **_rows(tolerant_home),
            }
        )

    document = {
        "_generated_by": "ts/parity/generate_ext_bindings_golden.py",
        "_semantics": (
            "Python's answer for `ext <id> bind|unbind|bindings|migrate`: streams and "
            "exit code, plus the _ext_bindings / _ext_migrations rows and the extension "
            "tables that exist after each step. Timestamps are tokenised; their BYTES are "
            "graded by the write probe with a frozen clock."
        ),
        "timestamp_token": TIMESTAMP_TOKEN,
        "extension_id": EXTENSION_ID,
        "steps": [label for label, _ in STEPS],
        "cases": cases,
    }
    GOLDEN_PATH.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {GOLDEN_PATH.relative_to(REPO_ROOT)} ({len(cases)} cases)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
