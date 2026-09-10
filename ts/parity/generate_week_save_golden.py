"""Generate the committed `week save` golden (CV22.DS7.US11 plateau 1).

Drives the REAL `memory.cli.week.cmd_save` oracle over the pending-file matrix
on a fresh temporary mirror home per case, recording what the TypeScript port
must reproduce byte for byte: stdout, the `tasks` rows written, and whether the
pending file was removed.

`week save` is the one leaf of this story that crosses NO provider seam. It
reads `tempfile.gettempdir()/mm_week_pending.json`, calls `add_task` per item
with `source="week_plan"`, unlinks the file, and prints a receipt. CR068 found
it filed as "LLM-gated" in `routing.ts`, which is false -- this corpus is the
evidence that it is deterministic and can flip ungated.

Branches exercised:
  - `scheduled_at` present -> " at HH:MM" in the receipt;
  - `time_hint` present without `scheduled_at` -> " (hint)";
  - neither -> no time suffix;
  - both -> `scheduled_at` wins (the elif);
  - an UNPARSEABLE `scheduled_at` -> Python's `except ValueError` leaves the
    suffix empty, and the row still stores the bad string;
  - `journey` present/absent -> " [slug]" suffix;
  - a non-ASCII title (code-point handling in the receipt);
  - several items in one file (ordering is file order);
  - no pending file at all -> "No pending items to save.", no rows;
  - an EMPTY pending list -> Python still unlinks and prints "0 items saved:".

The receipt embeds each new task's 8-character id, which is generated, so the
corpus aliases ids in receipt order (`<task-1>`, ...) the way the
conversation-logger corpus aliases conversation ids. Aliasing would also hide a
wrong id FORMAT, so `id_shapes` records the raw shape (length and character
class) separately -- the TS port must produce ids the alias can be applied to,
not merely ids the alias erases.

Run:  uv run python ts/parity/generate_week_save_golden.py
"""

from __future__ import annotations

import contextlib
import io
import json
import re
import tempfile
from pathlib import Path

from memory import MemoryClient
from memory.config import default_db_path_for_home

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "week-save.golden.json"

TASK_COLUMNS = "journey, title, status, due_date, scheduled_at, time_hint, stage, context, source"

CASES: tuple[tuple[str, list[dict] | None], ...] = (
    ("no pending file", None),
    ("empty pending list", []),
    (
        "scheduled_at renders as ' at HH:MM'",
        [{"title": "Ship the port", "due_date": "2026-09-10", "scheduled_at": "2026-09-10T14:30"}],
    ),
    (
        "time_hint only renders as ' (hint)'",
        [{"title": "Review the plan", "due_date": "2026-09-10", "time_hint": "morning"}],
    ),
    (
        "neither renders no time suffix",
        [{"title": "Read the ledger", "due_date": "2026-09-11"}],
    ),
    (
        "scheduled_at wins over time_hint",
        [
            {
                "title": "Both fields",
                "due_date": "2026-09-12",
                "scheduled_at": "2026-09-12T09:05",
                "time_hint": "afternoon",
            }
        ],
    ),
    (
        "unparseable scheduled_at falls through ValueError to no suffix",
        [{"title": "Bad clock", "due_date": "2026-09-13", "scheduled_at": "not-a-timestamp"}],
    ),
    (
        "journey renders as ' [slug]'",
        [{"title": "Scoped item", "due_date": "2026-09-14", "journey": "mirror-ts-core"}],
    ),
    (
        "non-ASCII title",
        [{"title": "Revisão do plano — café ☕", "due_date": "2026-09-15", "journey": "mirror"}],
    ),
    (
        "several items keep file order",
        [
            {"title": "First", "due_date": "2026-09-16", "time_hint": "morning"},
            {
                "title": "Second",
                "due_date": "2026-09-16",
                "scheduled_at": "2026-09-16T18:00",
                "journey": "admin",
            },
            {"title": "Third", "due_date": "2026-09-17", "context": "carried over"},
        ],
    ),
)


def run_case(pending: list[dict] | None) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / "home"
        db_path = default_db_path_for_home(home)
        mem = MemoryClient(env="test", db_path=db_path)

        # `cmd_save` reads a module-level PENDING_FILE resolved at import time;
        # point the whole run at a scratch temp dir so nothing touches the real
        # one and the corpus is reproducible on any machine.
        from memory.cli import week as week_cli

        pending_path = Path(tmp) / "mm_week_pending.json"
        original = week_cli.PENDING_FILE
        week_cli.PENDING_FILE = pending_path
        try:
            if pending is not None:
                pending_path.write_text(
                    json.dumps(pending, ensure_ascii=False, indent=2), encoding="utf-8"
                )
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                week_cli.cmd_save(mem)
            stdout = out.getvalue()
            file_exists_after = pending_path.exists()
        finally:
            week_cli.PENDING_FILE = original

        rows = [
            dict(row)
            for row in mem.store.conn.execute(
                f"SELECT id, {TASK_COLUMNS} FROM tasks ORDER BY created_at ASC, title ASC"
            ).fetchall()
        ]

        # Alias generated ids in the order the receipt prints them, then drop
        # the raw value from the graded rows.
        printed = re.findall(r"`([0-9a-f]+)`", stdout)
        aliases = {value: f"<task-{index}>" for index, value in enumerate(printed, start=1)}
        for raw, alias in aliases.items():
            stdout = stdout.replace(f"`{raw}`", f"`{alias}`")
        id_shapes = [
            {"length": len(value), "hex": bool(re.fullmatch(r"[0-9a-f]+", value))}
            for value in printed
        ]
        for row in rows:
            row["id"] = aliases.get(row["id"][:8], "<unaliased>")

        return {
            "stdout": stdout,
            "pending_file_exists_after": file_exists_after,
            "tasks": rows,
            "id_shapes": id_shapes,
        }


def main() -> None:
    cases = []
    for label, pending in CASES:
        cases.append({"label": label, "pending": pending, **run_case(pending)})
    golden = {"cases": cases}
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(golden, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    written = sum(len(c["tasks"]) for c in cases)
    print(f"cases: {len(cases)}, task rows written across corpus: {written}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
