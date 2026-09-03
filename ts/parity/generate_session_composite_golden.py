"""Generate the session-composite report golden (CV22.DS7.US10 slice D).

`session-start` and `session-maintenance` are what Pi runs at session
boundaries, and their report is printed to the user, so parity is string-exact
in grammar, labels, step order, and the warning tails.

Elapsed seconds are the one exception: they are wall-clock and cannot be
byte-stable across runs or cores. Rather than freeze them (which would fake the
evidence), the generator records the report with each timing token replaced by a
placeholder, and separately records the raw token so the TypeScript side can
prove the token still MATCHES Python's exact grammar before normalizing it. A
re-worded label, a missing space, or a change from one decimal place to two
therefore still fails; only the number is ignored.

Run:  uv run python ts/parity/generate_session_composite_golden.py
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "session-composite.golden.json"

# Python renders `f"{label}: {count} ({elapsed:.1f}s)"`. The capture keeps the
# label and count exact while isolating the wall-clock number.
TIMING_RE = re.compile(r"^(?P<label>[^:]+): (?P<count>\d+) \((?P<seconds>\d+\.\d)s\)$")


def _normalize(report: str) -> tuple[str, list[dict]]:
    """Replace each timing token with a placeholder after proving its grammar.

    Nothing carrying a wall-clock value is stored: the elapsed seconds vary run
    to run, and a golden that changes on regeneration cannot be a determinism
    gate. The grammar is enforced HERE instead, at generation time -- a step
    line that does not match the oracle's format raises rather than being
    silently written through, so the committed evidence stays deterministic
    without weakening the check.
    """
    normalized_lines: list[str] = []
    steps: list[dict] = []
    for line in report.split("\n"):
        if _looks_like_step(line):
            match = TIMING_RE.fullmatch(line)
            if match is None:
                raise RuntimeError(f"step line does not match the timing grammar: {line!r}")
            steps.append({"label": match["label"], "count": int(match["count"])})
            normalized_lines.append(f"{match['label']}: {match['count']} (<elapsed>s)")
            continue
        normalized_lines.append(line)
    return "\n".join(normalized_lines), steps


def _looks_like_step(line: str) -> bool:
    """A step line is any line the report renders with a trailing duration."""
    return line.endswith("s)") and ": " in line


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / "session-composite-fixture"
        home.mkdir()
        for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV"):
            os.environ.pop(key, None)
        fixture_db = home / "memory.db"
        os.environ["MIRROR_HOME"] = str(home)
        os.environ["MIRROR_USER"] = home.name
        os.environ["DB_PATH"] = str(fixture_db)
        os.environ["MEMORY_RECEPTION"] = "0"
        # Keep the Pi backfill step deterministic and offline: an absent
        # directory returns 0 on both cores, which is exactly the count the
        # report must show. The real backfill port is slice E.
        os.environ["PI_SESSIONS_DIR"] = str(Path(tmp) / "absent-pi-sessions")

        from memory.cli import conversation_logger as logger
        from memory.client import MemoryClient
        from memory.intelligence import extraction as extraction_module
        from memory.models import Conversation, Message

        mem = MemoryClient(db_path=fixture_db)
        opened = Path(mem.conn.execute("PRAGMA database_list").fetchone()[2]).resolve()
        if opened != fixture_db.resolve() or not opened.is_relative_to(Path(tmp).resolve()):
            raise RuntimeError(f"refusing non-temporary fixture database: {opened}")

        class _Response:
            def __init__(self, content: str) -> None:
                self.content = content
                self.model = "fixture-model"
                self.prompt = ""
                self.prompt_tokens = 11
                self.completion_tokens = 7
                self.latency_ms = 3

        replies = {"title": "A generated title", "summary": "A summary.", "tags": '["alpha"]'}

        def fake_send_to_model(model, messages, **kwargs):  # noqa: ANN001, ANN003
            from memory.intelligence import prompts as p

            prompt = messages[0]["content"]
            if prompt.startswith(p.CONVERSATION_TITLE_PROMPT):
                return _Response(replies["title"])
            if prompt.startswith(p.CONVERSATION_TAGS_PROMPT):
                return _Response(replies["tags"])
            if prompt.startswith(p.CONVERSATION_SUMMARY_PROMPT):
                return _Response(replies["summary"])
            return _Response("[]")

        extraction_module.send_to_model = fake_send_to_model

        def seed_conversation(
            conversation_id: str,
            *,
            ended: bool,
            title: str | None,
            metadata: str | None,
            message_count: int,
            last_message_at: str,
            journey: str | None = "mirror-ts-core",
        ) -> None:
            mem.store.create_conversation(
                Conversation(
                    id=conversation_id,
                    interface="pi",
                    journey=journey,
                    title=title,
                    metadata=metadata,
                    started_at="2026-09-03T10:00:00.000000Z",
                    ended_at="2026-09-03T10:30:00.000000Z" if ended else None,
                )
            )
            for index in range(message_count):
                mem.store.add_message(
                    Message(
                        id=f"{conversation_id}-m{index:02d}",
                        conversation_id=conversation_id,
                        role="user" if index % 2 == 0 else "assistant",
                        content=f"line {index}",
                        created_at=last_message_at,
                    )
                )

        scenarios: list[dict] = []

        def record(label: str, report: str, *, extra: dict | None = None) -> None:
            normalized, steps = _normalize(report)
            scenarios.append(
                {
                    "label": label,
                    "report_normalized": normalized,
                    "steps": steps,
                    **(extra or {}),
                }
            )

        # 1. Nothing to do: every step reports zero and no warning tail appears.
        record("maintenance_empty_database", logger.session_maintenance(mirror_home=str(home)))

        # 2. A stale orphan (idle, unbound) is closed. Note the extraction step
        # still reports 0: closing runs the FULL close tail, which extracts and
        # marks the conversation, so `extract_pending` correctly finds nothing
        # left. The step order matters, but not because one feeds the other.
        seed_conversation(
            "conv-orphan",
            ended=False,
            title="Provisional title",
            metadata=json.dumps({"title_status": "provisional"}),
            message_count=4,
            last_message_at="2026-09-03T09:00:00.000000Z",
        )
        record("maintenance_closes_and_extracts_stale_orphan", logger.session_maintenance(str(home)))

        # 3. Re-running immediately is idempotent: the orphan is closed and
        # extracted, so every step reports zero work again.
        record("maintenance_rerun_is_idempotent", logger.session_maintenance(str(home)))

        # 4. An ended conversation with a weak title is retitled.
        seed_conversation(
            "conv-retitle",
            ended=True,
            title="short...",
            metadata=None,
            message_count=4,
            last_message_at="2026-09-03T09:00:00.000000Z",
            journey=None,
        )
        record("maintenance_retitles_pending_conversation", logger.session_maintenance(str(home)))

        # 5. The quarantine warning tail.
        seed_conversation(
            "conv-quarantined",
            ended=True,
            title="Quarantined",
            metadata=json.dumps({"extraction_quarantined": True}),
            message_count=4,
            last_message_at="2026-09-03T09:00:00.000000Z",
        )
        record("maintenance_reports_quarantine_tail", logger.session_maintenance(str(home)))

        # 6. session-start composes the ACTIVE banner with the full report;
        # --fast defers the work entirely.
        record("session_start_full", logger.session_start(str(home)))
        record("session_start_fast", logger.session_start_fast(str(home)))

        mem.close()

    golden = {
        "meta": {
            "timing_grammar": "<label>: <count> (<seconds with one decimal>s)",
            "note": (
                "Reports are compared with timing values normalized, but only "
                "after the token matches the grammar above."
            ),
        },
        "scenarios": scenarios,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    for scenario in scenarios:
        first = scenario["report_normalized"].split("\n")[0]
        print(f"  {scenario['label']:44} {first}")
    print(f"scenarios: {len(scenarios)}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
