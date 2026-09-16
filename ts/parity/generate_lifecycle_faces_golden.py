"""Generate the committed ES-001 lifecycle read-face golden (CV22.DS7.US11 plateau 5b).

Covers the TWO deterministic faces this story ports:

    conversations --metadata-lifecycle-dry-run <conversation-id>
    conversations --metadata-lifecycle-preview-at-message <message-id>

`--metadata-lifecycle-apply` and `--metadata-lifecycle-demo` are NOT here.
Both need `apply_metadata_lifecycle`, ~80 lines of unported decision logic with
a write path (`ts/src/conversation/closeTail.ts` already carries an explicit
refusal saying so), and `demo` calls `apply`. The US11 Plan review had recorded
these four as "wiring over the ported engine", which was true of the two reads
and false of the two writes. Navigator decision 2026-09-09 (option B): ship the
reads here, refuse the writes BY NAME, hand them to DS7.TS4. The two
`--metadata-backfill-*` flags remain DS10 retirements.

Both faces are pure reads: no model call, no write, so the corpus needs no
provider stub -- only the key popped, so an unexpected network path raises.

Branches exercised:
  - a conversation with a provisional title and messages -> the full report;
  - a conversation with a STORED SUMMARY and TAGS -> the keep/refine decisions
    that only exist when those columns are read. The first version of this
    corpus seeded neither, so the TypeScript face could drop both columns and
    still pass;
  - a conversation whose title is MANUAL -> the preserve decision;
  - a conversation with no messages -> the untitleable path;
  - an id PREFIX rather than a full id -> `find_conversation_by_id_prefix`;
  - an unknown conversation id -> ValueError text;
  - an empty conversation id -> the "required" ValueError;
  - preview-at-message at the first, middle, and last message -> the
    included/excluded counts move with the boundary;
  - preview-at-message by message-id PREFIX;
  - preview-at-message for an unknown message id.

Run:  uv run python ts/parity/generate_lifecycle_faces_golden.py
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "lifecycle-faces.golden.json"


def _seed(
    mem,
    *,
    title: str | None,
    manual: bool,
    message_count: int,
    summary: str | None = None,
    tags: str | None = None,
) -> dict:
    conversation = mem.conversations.start_conversation("cli")
    if title is not None:
        if manual:
            mem.conversations.update_title(conversation.id, title)
        else:
            mem.conversations.set_provisional_title(conversation.id, title)
    if summary is not None or tags is not None:
        mem.store.update_conversation(
            conversation.id,
            **({"summary": summary} if summary is not None else {}),
            **({"tags": tags} if tags is not None else {}),
        )
    message_ids = []
    for index in range(message_count):
        role = "user" if index % 2 == 0 else "assistant"
        message = mem.conversations.add_message(
            conversation.id, role, f"Mensagem {index} sobre o checkpoint do plano."
        )
        message_ids.append(message.id)
    row = mem.store.conn.execute(
        "SELECT id, title, started_at, summary, tags, metadata FROM conversations WHERE id = ?",
        (conversation.id,),
    ).fetchone()
    messages = [
        dict(m)
        for m in mem.store.conn.execute(
            "SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? "
            "ORDER BY created_at",
            (conversation.id,),
        ).fetchall()
    ]
    # Record the ACTUAL rows the oracle wrote. An earlier draft had the TS test
    # seed its own guess at the metadata `set_provisional_title` produces, and
    # the title decision came out `keep` where Python says `repair` -- the
    # fixture, not the port, was wrong. The corpus now carries the world.
    return {
        "conversation_id": conversation.id,
        "message_ids": message_ids,
        "conversation_row": dict(row),
        "message_rows": messages,
    }


def _capture(fn) -> dict:
    try:
        return {"report": fn(), "error": None}
    except ValueError as exc:
        return {"report": None, "error": str(exc)}


def main() -> None:
    for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV", "OPENROUTER_API_KEY"):
        os.environ.pop(key, None)
    os.environ["MEMORY_RECEPTION"] = "0"

    cases = []
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / "home"
        db_path = home / "memory.db"
        os.environ["DB_PATH"] = str(db_path)

        from memory.client import MemoryClient

        mem = MemoryClient(env="test", db_path=db_path)

        provisional = _seed(mem, title="vamos trabalhar no maestro", manual=False, message_count=4)
        manual = _seed(mem, title="Manual conversation title", manual=True, message_count=2)
        empty = _seed(mem, title=None, manual=False, message_count=0)

        # The case the first corpus could not see: a conversation that already
        # HAS a summary and tags. Every field's decision moves when those two
        # columns are read -- including the title's, because refinement evidence
        # is drawn from the summary.
        stored = _seed(
            mem,
            title="Initial editorial session",
            manual=False,
            message_count=2,
            summary=(
                "Editorial workflow for a manuscript. Scrivener import, cover briefing, "
                "Kindle export, EPUB validation, chapter cleanup, raw text hygiene."
            ),
            tags='["editorial", "workflow"]',
        )

        seeds = {
            "provisional": provisional,
            "manual": manual,
            "empty": empty,
            "stored": stored,
        }

        dry_run_cases = [
            ("provisional title, four messages", provisional["conversation_id"]),
            ("manual title is preserved", manual["conversation_id"]),
            ("no messages", empty["conversation_id"]),
            ("stored summary and tags", stored["conversation_id"]),
            ("id prefix resolves", provisional["conversation_id"][:8]),
            ("unknown conversation id", "does-not-exist"),
            ("empty conversation id", ""),
        ]
        for label, conversation_id in dry_run_cases:
            cases.append(
                {
                    "face": "dry_run",
                    "label": label,
                    "argument": conversation_id,
                    **_capture(
                        lambda cid=conversation_id: mem.conversations.dry_run_metadata_lifecycle(
                            cid
                        )
                    ),
                }
            )

        preview_cases = [
            ("boundary at the first message", provisional["message_ids"][0]),
            ("boundary at a middle message", provisional["message_ids"][1]),
            ("boundary at the last message", provisional["message_ids"][-1]),
            ("message id prefix resolves", provisional["message_ids"][2][:8]),
            ("unknown message id", "no-such-message"),
            ("empty message id", ""),
        ]
        for label, message_id in preview_cases:
            cases.append(
                {
                    "face": "preview_at_message",
                    "label": label,
                    "argument": message_id,
                    **_capture(
                        lambda mid=message_id: (
                            mem.conversations.dry_run_metadata_lifecycle_at_message(mid)
                        )
                    ),
                }
            )

        # Ids are generated, so alias every one that appears in a report.
        aliases: dict[str, str] = {}
        for index, (name, seed) in enumerate(seeds.items(), start=1):
            aliases[seed["conversation_id"]] = f"<conversation-{name}>"
            for message_index, message_id in enumerate(seed["message_ids"], start=1):
                aliases[message_id] = f"<{name}-message-{message_index}>"

        blob = json.dumps({"cases": cases}, ensure_ascii=False, indent=2, sort_keys=True)
        for raw, alias in aliases.items():
            blob = blob.replace(raw, alias)
            blob = blob.replace(raw[:8], alias)
        payload = json.loads(blob)
        seed_blob = json.dumps(
            {
                name: {
                    "conversation_row": seed["conversation_row"],
                    "message_rows": seed["message_rows"],
                }
                for name, seed in seeds.items()
            },
            ensure_ascii=False,
            sort_keys=True,
        )
        for raw, alias in aliases.items():
            seed_blob = seed_blob.replace(raw, alias)
            seed_blob = seed_blob.replace(raw[:8], alias)
        payload["seeds"] = json.loads(seed_blob)

    # Timestamps are generated. Map every distinct one to a deterministic
    # synthetic value IN SORTED ORDER, so relative ordering -- which the
    # message-boundary logic depends on -- is preserved exactly while the
    # corpus stays byte-stable across runs.
    import re as _re

    blob = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    stamps = sorted(set(_re.findall(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z", blob)))
    for index, stamp in enumerate(stamps, start=1):
        blob = blob.replace(stamp, f"2026-09-09T12:00:{index:02d}.000000Z")
    payload = json.loads(blob)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    for case in payload["cases"]:
        state = "error" if case["error"] else "report"
        print(f"  {case['face']:<20} {case['label'][:44]:<44} -> {state}")
    print(f"cases: {len(payload['cases'])}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    sys.exit(main())
