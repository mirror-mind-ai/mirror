"""Generate the committed `week plan` golden (CV22.DS7.US11 plateau 4).

Drives the REAL `memory.cli.week.cmd_plan` oracle with the model stubbed and
the clock frozen, recording what the TypeScript port must reproduce: the JSON
report on stdout, the pending file's exact bytes, and the `llm_calls` row.

Hermetic by construction (CR065): `OPENROUTER_API_KEY` is popped before
`memory` is imported, so an unstubbed network path raises here exactly as it
would in CI.

The similarity check is the subtle part. `find_tasks_by_title(title[:20])`
issues `LIKE '%fragment%'` -- a CONTAINS match, with NO wildcard escaping and
the journey argument NOT passed -- then filters to the same `due_date` and
status != done. The US11 Plan review corrected an earlier description of this
as a "prefix query"; the cases below pin the real semantics, including the
wildcards, so the port cannot quietly implement the tidier thing.

Branches exercised:
  - no items returned by the model -> "No temporal items found in the text.";
  - a non-list response -> the same empty path;
  - an item whose dict is malformed -> skipped by the `except Exception`
    around `ExtractedWeekItem(**item_data)`, siblings still returned;
  - an existing task that matches on fragment AND due_date AND is not done
    -> a `warning` naming the FIRST match;
  - an existing task matching the fragment but a DIFFERENT due_date -> no
    warning;
  - an existing task matching, same date, but status='done' -> no warning;
  - a title over 20 characters -> only the first 20 form the fragment;
  - `%` and `_` in a title -> unescaped LIKE wildcards, so they over-match;
  - a non-ASCII title -> the 20 is code points, not UTF-16 units.

Run:  uv run python ts/parity/generate_week_plan_golden.py
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "week-plan.golden.json"

FROZEN_TODAY = "2026-09-09"
FROZEN_WEEKDAY = "Wednesday"

JOURNEYS = [
    {"slug": "mirror-ts-core", "description": "Port the Python core to TypeScript."},
    {"slug": "admin", "description": "Administrative work."},
]


class _StubResponse:
    def __init__(self, content: str) -> None:
        self.content = content
        self.model = "stub/model"
        self.generation_id = None
        self.prompt_tokens = 21
        self.completion_tokens = 9
        self.latency_ms = 4
        self.cost_usd = None


def _run_case(
    tmp: Path,
    text: str,
    model_content: str,
    existing_tasks: list[dict],
) -> dict:
    from memory.client import MemoryClient
    from memory.intelligence import extraction as extraction_module

    home = tmp / "home"
    db_path = home / "memory.db"
    os.environ["DB_PATH"] = str(db_path)

    mem = MemoryClient(env="test", db_path=db_path)
    for slug, description in ((j["slug"], j["description"]) for j in JOURNEYS):
        mem.set_identity("journey", slug, description)
    for task in existing_tasks:
        created = mem.tasks.add_task(
            title=task["title"],
            due_date=task.get("due_date"),
            journey=task.get("journey"),
        )
        if task.get("status") == "done":
            mem.tasks.complete_task(created.id)

    extraction_module.send_to_model = lambda model, messages, **kwargs: _StubResponse(model_content)

    from memory.cli import week as week_cli

    pending_path = tmp / "mm_week_pending.json"
    original = week_cli.PENDING_FILE
    week_cli.PENDING_FILE = pending_path
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            week_cli.cmd_plan(mem, text)
    finally:
        week_cli.PENDING_FILE = original

    stdout = out.getvalue().replace(str(pending_path), "<pending-file>")
    llm_calls = [
        dict(row)
        for row in mem.store.conn.execute(
            "SELECT role, model FROM llm_calls ORDER BY called_at ASC"
        ).fetchall()
    ]
    return {
        "stdout": stdout,
        "pending_file": pending_path.read_text(encoding="utf-8") if pending_path.exists() else None,
        "llm_calls": llm_calls,
    }


def _items(*payloads: dict) -> str:
    return json.dumps(list(payloads), ensure_ascii=False)


CASES: tuple[tuple[str, str, str, list[dict]], ...] = (
    ("no items returned", "nada temporal aqui", _items(), []),
    ("non-list response", "qualquer coisa", json.dumps({"not": "a list"}), []),
    (
        "one plain item",
        "Quarta: revisar o plano.",
        _items({"title": "Revisar o plano", "due_date": "2026-09-09"}),
        [],
    ),
    (
        "malformed item is skipped, sibling survives",
        "duas coisas",
        _items(
            {"title": "Boa", "due_date": "2026-09-10"},
            {"no_title_field": True},
        ),
        [],
    ),
    (
        "similar existing task warns, naming the first match",
        "Revisar o plano de novo",
        _items({"title": "Revisar o plano", "due_date": "2026-09-10"}),
        [{"title": "Revisar o plano semanal", "due_date": "2026-09-10"}],
    ),
    (
        "same fragment but a DIFFERENT due date does not warn",
        "Revisar o plano de novo",
        _items({"title": "Revisar o plano", "due_date": "2026-09-10"}),
        [{"title": "Revisar o plano semanal", "due_date": "2026-09-11"}],
    ),
    (
        "a matching task already DONE does not warn",
        "Revisar o plano de novo",
        _items({"title": "Revisar o plano", "due_date": "2026-09-10"}),
        [{"title": "Revisar o plano semanal", "due_date": "2026-09-10", "status": "done"}],
    ),
    (
        "only the first 20 characters form the fragment",
        "titulo longo",
        _items({"title": "ABCDEFGHIJKLMNOPQRSTUVWXYZ-cauda", "due_date": "2026-09-10"}),
        [{"title": "ABCDEFGHIJKLMNOPQRST-outra-cauda", "due_date": "2026-09-10"}],
    ),
    (
        "percent in a title is an UNESCAPED LIKE wildcard",
        "desconto",
        _items({"title": "100% do plano", "due_date": "2026-09-10"}),
        [{"title": "100 qualquer coisa do plano", "due_date": "2026-09-10"}],
    ),
    (
        "underscore in a title is an UNESCAPED single-char wildcard",
        "slug",
        _items({"title": "a_c", "due_date": "2026-09-10"}),
        [{"title": "abc", "due_date": "2026-09-10"}],
    ),
    (
        "non-ASCII title: the 20 is code points",
        "viagem",
        _items(
            {"title": "\U0001f30d viagem long\u00edssima para o norte", "due_date": "2026-09-10"}
        ),
        [],
    ),
    (
        "a non-string OPTIONAL field skips the whole item (pydantic forbids it)",
        "tipo errado",
        _items(
            {"title": "Boa", "due_date": "2026-09-10"},
            {"title": "Ruim", "due_date": "2026-09-10", "scheduled_at": 5},
        ),
        [],
    ),
    (
        "an UNKNOWN key skips the item (extra=forbid)",
        "chave extra",
        _items({"title": "Com extra", "due_date": "2026-09-10", "nope": 1}),
        [],
    ),
    (
        "explicit nulls are accepted",
        "nulos",
        _items(
            {
                "title": "Com nulos",
                "due_date": "2026-09-10",
                "scheduled_at": None,
                "time_hint": None,
                "journey": None,
                "context": None,
            }
        ),
        [],
    ),
    (
        "all optional fields present",
        "reuniao",
        _items(
            {
                "title": "Call com cliente",
                "due_date": "2026-09-10",
                "scheduled_at": "2026-09-10T18:00",
                "time_hint": "late afternoon",
                "journey": "admin",
                "context": "trimestral",
            }
        ),
        [],
    ),
)


def main() -> None:
    for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV", "OPENROUTER_API_KEY"):
        os.environ.pop(key, None)
    os.environ["MEMORY_RECEPTION"] = "0"

    # Freeze the clock the prompt embeds. `extract_week_plan` reads
    # `datetime.now()`, so without this the corpus would fail its own
    # comparison tomorrow.
    import datetime as datetime_module

    real_datetime = datetime_module.datetime

    class _FrozenDateTime(real_datetime):
        @classmethod
        def now(cls, tz=None):  # noqa: ANN001, ANN206
            return cls(2026, 9, 9, 13, 45, 0)

    datetime_module.datetime = _FrozenDateTime

    cases = []
    for label, text, model_content, existing in CASES:
        with tempfile.TemporaryDirectory() as tmp:
            result = _run_case(Path(tmp), text, model_content, existing)
        cases.append(
            {
                "label": label,
                "text": text,
                "model_response": model_content,
                "existing_tasks": existing,
                "journeys": JOURNEYS,
                "clock": {"today": FROZEN_TODAY, "weekday": FROZEN_WEEKDAY},
                **result,
            }
        )

    datetime_module.datetime = real_datetime

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps({"cases": cases}, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    for case in cases:
        warned = case["stdout"].count('"warning"')
        wrote = case["pending_file"] is not None
        print(f"  {case['label'][:52]:<52} warnings={warned} pending={wrote}")
    print(f"cases: {len(cases)}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    sys.exit(main())
