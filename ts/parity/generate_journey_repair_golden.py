"""Generate the journey diagnose/repair golden (CV22.DS7.US10 slice E).

`diagnose-journeys` is read-only, but `repair-journeys --apply` rewrites the
`journey` column of conversations the user never explicitly assigned. A false
positive silently moves someone's conversation into the wrong journey, so the
inference is graded case by case, and the mutation is graded as before/after
state on a copy -- never against a real database.

The corpus exercises every inference route: the explicit build command in its
three spellings, a standalone alias line, activation phrases in Portuguese and
English, the skill-tag stripping path, the ambiguity refusal when two aliases
tie on length, and the near-misses that must NOT match (an alias mid-sentence,
an unknown slug after a build command).

Run:  uv run python ts/parity/generate_journey_repair_golden.py
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "journey-repair.golden.json"

# slug -> identity content. Two journeys share a heading length so the tie-break
# refusal is reachable; `mirror-ts-core` carries a distinct longer heading.
JOURNEYS = {
    "mirror-ts-core": "# Mirror TypeScript Core Port\n\nDescription.\n",
    "alpha-one": "# Alpha One\n\nDescription.\n",
    "beta-two": "# Beta Two\n\nDescription.\n",
    # Two journeys sharing a display heading. Both contribute the SAME alias,
    # so a text ending in it matches both slugs at equal length: a genuine tie,
    # which must be refused rather than resolved. This is the guard that stops
    # `--apply` writing an arbitrary one of two equally plausible journeys.
    "dup-alpha": "# Duplicate Title\n\nDescription.\n",
    "dup-beta": "# Duplicate Title\n\nDescription.\n",
    "no-heading": "Just body text with no heading at all.\n",
}

# label -> (title, first user message)
INFERENCE_CASES: tuple[tuple[str, str | None, str], ...] = (
    ("build_command_slash", None, "/mm-build mirror-ts-core"),
    ("build_command_dollar", None, "$mm-build alpha-one"),
    ("build_command_colon", None, "/mm:build beta-two"),
    ("build_command_unknown_slug", None, "/mm-build not-a-journey"),
    ("standalone_slug_line", None, "mirror-ts-core"),
    ("standalone_heading_line", None, "mirror typescript core port"),
    ("standalone_slug_with_spaces", None, "alpha one"),
    ("activation_pt_vamos_trabalhar", None, "vamos trabalhar no alpha-one"),
    ("activation_pt_quero_retomar", None, "quero retomar a jornada beta-two"),
    ("activation_en_lets_work", None, "let's work on mirror-ts-core"),
    ("skill_tag_stripped", None, "<skill>mm-build</skill>\n/mm-build alpha-one"),
    ("title_carries_the_slug", "alpha-one", ""),
    ("alias_mid_sentence_does_not_match", None, "I was reading about alpha-one yesterday"),
    ("empty_text", None, ""),
    ("whitespace_only", None, "   \n  "),
    ("unrelated_text", None, "just a normal question about the weather"),
    ("ambiguous_shared_alias_refuses", None, "duplicate title"),
)


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / "journey-repair-fixture"
        home.mkdir()
        for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV"):
            os.environ.pop(key, None)
        fixture_db = home / "memory.db"
        os.environ["MIRROR_HOME"] = str(home)
        os.environ["MIRROR_USER"] = home.name
        os.environ["DB_PATH"] = str(fixture_db)
        os.environ["MEMORY_RECEPTION"] = "0"

        from memory.cli import conversation_logger as logger
        from memory.client import MemoryClient
        from memory.models import Conversation, Message

        mem = MemoryClient(db_path=fixture_db)
        opened = Path(mem.conn.execute("PRAGMA database_list").fetchone()[2]).resolve()
        if opened != fixture_db.resolve() or not opened.is_relative_to(Path(tmp).resolve()):
            raise RuntimeError(f"refusing non-temporary fixture database: {opened}")

        for slug, content in JOURNEYS.items():
            mem.set_identity("journey", slug, content)

        raw_aliases = logger._journey_aliases(mem)
        # ORACLE NONDETERMINISM (recorded for Debt Review): Python builds each
        # alias list with `sorted(set(...), key=len, reverse=True)`. The sort is
        # stable, so aliases of EQUAL length come out in set-iteration order,
        # which string hash randomization varies between processes -- observed
        # directly: `beta-two` alternates between ["beta two", "beta-two"] and
        # the reverse across runs.
        #
        # It is behaviorally inert for inference: only the matched alias's
        # LENGTH feeds the cross-slug tie-break, and equal-length entries by
        # definition tie. But it cannot be committed as-is, because a golden
        # that changes on regeneration is not a determinism gate. The stored
        # form breaks ties lexicographically; TypeScript sorts the same way.
        aliases = {
            slug: sorted(values, key=lambda alias: (-len(alias), alias))
            for slug, values in raw_aliases.items()
        }
        for slug, values in raw_aliases.items():
            assert sorted(values) == sorted(aliases[slug]), slug
            assert [len(a) for a in values] == [len(a) for a in aliases[slug]], slug

        inference = []
        for label, title, first_user in INFERENCE_CASES:
            journey, reason = logger._infer_journey_for_conversation(title, first_user, aliases)
            inference.append(
                {
                    "label": label,
                    "title": title,
                    "first_user": first_user,
                    "activation_text": logger._activation_text(title, first_user),
                    "journey": journey,
                    "reason": reason,
                }
            )

        # Seed journeyless conversations for the diagnose/repair pass. Ordering
        # is by started_at DESC, so the timestamps are chosen to pin it.
        seeds = [
            ("conv-a", "2026-09-03T10:00:00.000000Z", None, "/mm-build mirror-ts-core", 2),
            ("conv-b", "2026-09-03T11:00:00.000000Z", None, "vamos trabalhar no alpha-one", 4),
            ("conv-c", "2026-09-03T12:00:00.000000Z", None, "unrelated chatter", 1),
            ("conv-d", "2026-09-03T09:00:00.000000Z", "beta-two", "", 3),
        ]
        for conversation_id, started_at, title, first_user, message_count in seeds:
            mem.store.create_conversation(
                Conversation(
                    id=conversation_id,
                    interface="pi",
                    journey=None,
                    title=title,
                    started_at=started_at,
                )
            )
            for index in range(message_count):
                mem.store.add_message(
                    Message(
                        id=f"{conversation_id}-m{index:02d}",
                        conversation_id=conversation_id,
                        role="user" if index % 2 == 0 else "assistant",
                        content=first_user if index == 0 else f"line {index}",
                        created_at=f"2026-09-03T12:00:{index:02d}.000000Z",
                    )
                )

        def journey_state() -> dict[str, str | None]:
            rows = mem.store.conn.execute(
                "SELECT id, journey FROM conversations ORDER BY id"
            ).fetchall()
            return {row["id"]: row["journey"] for row in rows}

        before = journey_state()
        dry_run = logger.diagnose_journey_associations(mirror_home=str(home), apply=False)
        after_dry_run = journey_state()
        limited = logger.diagnose_journey_associations(mirror_home=str(home), apply=False, limit=2)

        applied = logger.diagnose_journey_associations(mirror_home=str(home), apply=True)
        after_apply = journey_state()

        rendered = {}
        for name, findings, was_applied in (
            ("dry_run", dry_run, False),
            ("applied", applied, True),
        ):
            import io
            from contextlib import redirect_stdout

            buffer = io.StringIO()
            with redirect_stdout(buffer):
                logger._print_journey_association_findings(findings, applied=was_applied)
            rendered[name] = buffer.getvalue()

        mem.close()

    golden = {
        "meta": {
            "note": (
                "`--apply` is a mutating repair: findings are identical in both "
                "modes, and only the write differs."
            )
        },
        "journeys": JOURNEYS,
        "aliases": aliases,
        "inference": inference,
        "repair": {
            "seeds": [
                {
                    "id": seed[0],
                    "started_at": seed[1],
                    "title": seed[2],
                    "first_user": seed[3],
                    "message_count": seed[4],
                }
                for seed in seeds
            ],
            "journey_before": before,
            "dry_run_findings": dry_run,
            "journey_after_dry_run": after_dry_run,
            "limited_findings": limited,
            "applied_findings": applied,
            "journey_after_apply": after_apply,
            "rendered": rendered,
        },
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    for case in inference:
        print(f"  {case['label']:38} -> {case['journey']} ({case['reason']})")
    print(f"dry-run findings: {len(dry_run)}; applied: {len(applied)}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
