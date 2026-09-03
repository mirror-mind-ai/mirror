"""Generate the close-tail call-sequence golden (CV22.DS7.US10 slice C').

The ai-engineer plan review classed this blocking: end-state equality cannot
expose a diverged LLM call graph. The metadata lifecycle engine decides
*whether* and *how often* each surface fires, so a TypeScript port could reach
an identical conversation row while making a different number of model calls.
Under replay that difference is invisible; at the DS8 live cutover it is cost
and latency.

This generator therefore records the ORDERED sequence of surfaces the real
Python close tail calls, alongside the resulting row state, for scenarios that
exercise the branch structure:

  * every field generated from scratch;
  * the double-summary branch, where a blank summary generation makes Python
    call `suggest_summary` a SECOND time and hand the result to `_suggest_tags`,
    which ignores it (a discarded LLM call, preserved for parity);
  * finalization after an extraction failure, proving `ended_at` is written
    first and the `finally` still finalizes;
  * a re-run over an already-finalized conversation, which is NOT free.

Surfaces are identified by matching the assembled prompt against the system
prompt bodies, reusing the assembly contract graded by
`generate_prompt_assembly_golden.py`.

Run:  uv run python ts/parity/generate_close_tail_golden.py
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "close-tail.golden.json"

NOW = "2026-09-03T12:00:00.000000Z"


def _surface_of(prompt: str) -> str:
    from memory.intelligence import prompts as p

    for name, surface in (
        ("EXTRACTION_PROMPT", "extraction"),
        ("TASK_EXTRACTION_PROMPT", "task_extraction"),
        ("CURATION_PROMPT", "curation"),
        ("CONVERSATION_TITLE_PROMPT", "conversation_title"),
        ("CONVERSATION_TAGS_PROMPT", "conversation_tags"),
        ("CONVERSATION_SUMMARY_PROMPT", "conversation_summary"),
    ):
        if prompt.startswith(getattr(p, name)):
            return surface
    return "unknown"


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / "close-tail-fixture"
        home.mkdir()
        for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV"):
            os.environ.pop(key, None)
        fixture_db = home / "memory.db"
        os.environ["MIRROR_HOME"] = str(home)
        # Pin MIRROR_USER to the home's basename (US4 incident rule): a
        # re-injected user from a repo .env conflicts with the temporary home.
        os.environ["MIRROR_USER"] = home.name
        os.environ["DB_PATH"] = str(fixture_db)
        os.environ["MEMORY_RECEPTION"] = "0"

        from memory.client import MemoryClient
        from memory.intelligence import extraction as extraction_module
        from memory.models import Conversation, Message

        mem = MemoryClient(db_path=fixture_db)
        opened = Path(mem.conn.execute("PRAGMA database_list").fetchone()[2]).resolve()
        if opened != fixture_db.resolve() or not opened.is_relative_to(Path(tmp).resolve()):
            raise RuntimeError(f"refusing non-temporary fixture database: {opened}")

        calls: list[str] = []
        replies: dict[str, str] = {}

        class _Response:
            def __init__(self, content: str) -> None:
                self.content = content
                self.model = "fixture-model"
                self.prompt = ""
                self.prompt_tokens = 11
                self.completion_tokens = 7
                self.latency_ms = 3

        def fake_send_to_model(model, messages, **kwargs):  # noqa: ANN001, ANN003
            prompt = messages[0]["content"]
            surface = _surface_of(prompt)
            calls.append(surface)
            return _Response(replies.get(surface, ""))

        extraction_module.send_to_model = fake_send_to_model

        def seed(
            conversation_id: str,
            *,
            title: str | None,
            summary: str | None,
            tags: str | None,
            metadata: str | None,
            message_count: int,
        ) -> None:
            mem.store.create_conversation(
                Conversation(
                    id=conversation_id,
                    interface="pi",
                    journey="mirror-ts-core",
                    title=title,
                    summary=summary,
                    tags=tags,
                    metadata=metadata,
                    started_at=NOW,
                )
            )
            for index in range(message_count):
                role = "user" if index % 2 == 0 else "assistant"
                mem.store.add_message(
                    Message(
                        id=f"{conversation_id}-m{index:02d}",
                        conversation_id=conversation_id,
                        role=role,
                        content=f"{role} line {index}",
                        created_at=f"2026-09-03T12:00:{index:02d}.000000Z",
                    )
                )

        def row_state(conversation_id: str) -> dict:
            conv = mem.store.get_conversation(conversation_id)
            return {
                "title": conv.title,
                "summary": conv.summary,
                "tags": conv.tags,
                "metadata": conv.metadata,
                "ended_at_set": conv.ended_at is not None,
            }

        scenarios: list[dict] = []

        def run_scenario(
            label: str,
            *,
            conversation_id: str,
            seed_kwargs: dict,
            reply_map: dict[str, str],
            action: str = "finalize",
            extraction_raises: bool = False,
            repeat: int = 1,
        ) -> None:
            calls.clear()
            replies.clear()
            replies.update(reply_map)
            seed(conversation_id, **seed_kwargs)

            reports = []
            for _ in range(repeat):
                if action == "finalize":
                    reports.append(mem.conversations.finalize_metadata_on_close(conversation_id))
                else:
                    if extraction_raises:
                        original = mem.conversations._run_extraction

                        def boom(_cid):  # noqa: ANN001
                            raise RuntimeError("extraction failed")

                        mem.conversations._run_extraction = boom
                        try:
                            mem.conversations.end_conversation(conversation_id, extract=True)
                        except RuntimeError:
                            pass
                        finally:
                            mem.conversations._run_extraction = original
                    else:
                        mem.conversations.end_conversation(conversation_id, extract=False)
                    reports.append(None)

            scenarios.append(
                {
                    "label": label,
                    "action": action,
                    "repeat": repeat,
                    "extraction_raises": extraction_raises,
                    "seed": seed_kwargs,
                    "replies": dict(reply_map),
                    "call_sequence": list(calls),
                    "final_state": row_state(conversation_id),
                    "reports": [
                        {
                            "mutated": r["mutated"],
                            "changed": r["changed"],
                            "skipped": r["skipped"],
                            "profile": r["profile"],
                            "actions": r["actions"],
                        }
                        for r in reports
                        if r is not None
                    ],
                }
            )

        # 1. Nothing stored yet: title, summary and tags are all generated.
        run_scenario(
            "generates_all_fields",
            conversation_id="conv-all",
            seed_kwargs={
                "title": None,
                "summary": None,
                "tags": None,
                "metadata": None,
                "message_count": 4,
            },
            reply_map={
                "conversation_title": "A generated title",
                "conversation_summary": "A generated summary sentence.",
                "conversation_tags": '["alpha", "bravo"]',
            },
        )

        # 2. The double-summary branch: a stored summary with quality issues
        # decides `refine_candidate`, the first generation comes back blank, so
        # Python calls the summary surface a SECOND time for the tag source and
        # `_suggest_tags` discards it.
        run_scenario(
            "double_summary_when_generation_is_blank",
            conversation_id="conv-double",
            seed_kwargs={
                "title": "A perfectly fine title",
                "summary": "- bullet one\n- bullet two",
                "tags": None,
                "metadata": None,
                "message_count": 4,
            },
            reply_map={
                "conversation_title": "Another title",
                "conversation_summary": "   ",
                "conversation_tags": '["alpha"]',
            },
        )

        # 3. Extraction raises: ended_at is already written and the finally
        # still finalizes metadata.
        run_scenario(
            "finalizes_after_extraction_failure",
            conversation_id="conv-fail",
            seed_kwargs={
                "title": None,
                "summary": None,
                "tags": None,
                "metadata": None,
                "message_count": 4,
            },
            reply_map={
                "conversation_title": "Title after failure",
                "conversation_summary": "Summary after failure.",
                "conversation_tags": '["alpha"]',
            },
            action="end_conversation",
            extraction_raises=True,
        )

        # 4. Re-running the close tail over an already-finalized conversation is
        # NOT free: a generated title plus six messages decides
        # `refine_candidate`, which close_time regenerates again.
        run_scenario(
            "rerun_over_finalized_conversation",
            conversation_id="conv-rerun",
            seed_kwargs={
                "title": None,
                "summary": None,
                "tags": None,
                "metadata": None,
                "message_count": 6,
            },
            reply_map={
                "conversation_title": "A generated title",
                "conversation_summary": "A generated summary sentence.",
                "conversation_tags": '["alpha", "bravo"]',
            },
            repeat=2,
        )

        # 5. A manual title lock survives the force profile.
        run_scenario(
            "manual_title_lock_is_preserved",
            conversation_id="conv-manual",
            seed_kwargs={
                "title": "Human chosen title",
                "summary": None,
                "tags": None,
                "metadata": json.dumps({"title_status": "manual"}),
                "message_count": 4,
            },
            reply_map={
                "conversation_title": "Machine title",
                "conversation_summary": "A generated summary sentence.",
                "conversation_tags": '["alpha"]',
            },
        )

        mem.close()

    golden = {
        "meta": {
            "note": (
                "Ordered LLM call sequences for the close tail. End-state equality "
                "cannot expose a diverged call graph; the sequence can."
            ),
            "profile": "close_time",
        },
        "scenarios": scenarios,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    for scenario in scenarios:
        print(f"  {scenario['label']:38} calls={scenario['call_sequence']}")
    print(f"scenarios: {len(scenarios)}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
