"""List recent conversations from the memory database."""

import argparse
import json
import sqlite3

from memory import MemoryClient
from memory.db.schema import SCHEMA
from memory.intelligence.search import MemorySearch
from memory.services.conversation import ConversationService
from memory.services.attachment import AttachmentService
from memory.services.identity import IdentityService
from memory.services.journey import JourneyService
from memory.services.memory import MemoryService
from memory.services.tasks import TaskService
from memory.storage.store import Store
from memory.cli.common import db_path_from_mirror_home


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="List recent conversations")
    parser.add_argument("--limit", type=int, default=20, help="Number of conversations")
    parser.add_argument("--journey", help="Filter by journey")
    parser.add_argument("--persona", help="Filter by persona")
    parser.add_argument(
        "--mirror-home",
        default=None,
        help="Explicit user home whose database should be read for this command",
    )
    parser.add_argument(
        "--metadata-lifecycle-dry-run",
        metavar="CONVERSATION_ID",
        help="Report metadata lifecycle decisions for one conversation without changing it",
    )
    parser.add_argument(
        "--metadata-lifecycle-apply",
        metavar="CONVERSATION_ID",
        help="Apply explicit metadata lifecycle values and print an operation report",
    )
    parser.add_argument(
        "--metadata-lifecycle-demo",
        action="store_true",
        help="Run a controlled in-memory metadata lifecycle demo report",
    )
    parser.add_argument(
        "--metadata-lifecycle-preview-at-message",
        metavar="MESSAGE_ID",
        help="Debug-preview metadata lifecycle decisions using messages up to one message",
    )
    parser.add_argument(
        "--metadata-backfill-preview",
        action="store_true",
        help="Preview historical conversation metadata backfill without mutation",
    )
    parser.add_argument(
        "--metadata-backfill-apply",
        action="store_true",
        help="Apply historical conversation metadata backfill to a bounded candidate set",
    )
    parser.add_argument(
        "--metadata-backfill-mode",
        choices=("safe", "force"),
        default="safe",
        help="Backfill preview mode",
    )
    parser.add_argument("--title", help="Explicit title value for metadata lifecycle apply")
    parser.add_argument("--summary", help="Explicit summary value for metadata lifecycle apply")
    parser.add_argument(
        "--tag",
        dest="tags",
        action="append",
        default=None,
        help="Explicit tag value for metadata lifecycle apply; may be repeated",
    )
    args = parser.parse_args(argv)

    if args.metadata_lifecycle_demo:
        report = _metadata_lifecycle_demo_report()
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    mem = MemoryClient(db_path=db_path_from_mirror_home(args.mirror_home))

    if args.metadata_lifecycle_dry_run:
        report = mem.conversations.dry_run_metadata_lifecycle(
            args.metadata_lifecycle_dry_run
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    if args.metadata_backfill_preview:
        report = mem.conversations.preview_metadata_backfill(
            mode=args.metadata_backfill_mode,
            limit=args.limit,
            journey=args.journey,
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    if args.metadata_backfill_apply:
        report = mem.conversations.apply_metadata_backfill(
            mode=args.metadata_backfill_mode,
            limit=args.limit,
            journey=args.journey,
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    if args.metadata_lifecycle_preview_at_message:
        report = mem.conversations.dry_run_metadata_lifecycle_at_message(
            args.metadata_lifecycle_preview_at_message
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    if args.metadata_lifecycle_apply:
        report = mem.conversations.apply_metadata_lifecycle(
            args.metadata_lifecycle_apply,
            title=args.title,
            summary=args.summary,
            tags=args.tags,
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    summaries = mem.conversations.list_recent(
        limit=args.limit,
        journey=args.journey,
        persona=args.persona,
    )

    if not summaries:
        print("No conversations found.")
        return

    for summary in summaries:
        title = summary.title or "(untitled)"
        date = summary.started_at[:10] if summary.started_at else "?"
        persona_str = f" ◇ {summary.persona}" if summary.persona else ""
        journey_str = f" [{summary.journey}]" if summary.journey else ""
        print(
            f"**{date}** | `{summary.id[:8]}`{journey_str}{persona_str} "
            f"({summary.message_count} msgs)"
        )
        print(f"  {title}")
        print()


def _demo_conversation_service() -> tuple[ConversationService, Store]:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    store = Store(conn)
    memory_service = MemoryService(store, search_engine=MemorySearch(store))
    attachment_service = AttachmentService(store)
    identity_service = IdentityService(store, attachments=attachment_service)
    journey_service = JourneyService(store, identity=identity_service)
    task_service = TaskService(store, journeys=journey_service)
    return ConversationService(store, memories=memory_service, tasks=task_service), store


def _metadata_lifecycle_demo_report() -> dict:
    conversations, store = _demo_conversation_service()

    repair = conversations.start_conversation("cli")
    conversations.set_provisional_title(repair.id, "vamos trabalhar no maestro")
    conversations.add_message(repair.id, "user", "Vamos validar checkpoint visibility")
    conversations.add_message(repair.id, "assistant", "Vamos revisar o handoff")
    preview = conversations.dry_run_metadata_lifecycle(repair.id)
    apply = conversations.apply_metadata_lifecycle(
        repair.id,
        title="Maestro checkpoint visibility validation",
        summary="Conversation metadata lifecycle validation.",
        tags=["metadata", "conversation"],
    )
    after_apply = store.get_conversation(repair.id)

    manual = conversations.start_conversation("cli", title="Initial title")
    conversations.add_message(manual.id, "user", "Quero corrigir títulos")
    conversations.add_message(manual.id, "assistant", "Vamos desenhar a correção")
    conversations.update_title(manual.id, "Manual conversation title")
    manual_apply = conversations.apply_metadata_lifecycle(
        manual.id,
        title="Generated replacement title",
    )

    refine = conversations.start_conversation("cli", title="Initial editorial session")
    conversations.add_message(refine.id, "user", "Let's begin")
    conversations.add_message(refine.id, "assistant", "Ready")
    store.update_conversation(
        refine.id,
        summary=(
            "Editorial workflow for Raphael Albino manuscript. Scrivener import, "
            "cover briefing, Kindle export, EPUB validation, chapter cleanup, raw text hygiene."
        ),
    )
    refine_apply = conversations.apply_metadata_lifecycle(
        refine.id,
        title="Better editorial workflow title",
    )

    checks = {
        "preview_non_mutating": preview["mutated"] is False,
        "apply_changed_title": apply["changed"].get("title")
        == "Maestro checkpoint visibility validation",
        "manual_lock_preserved": manual_apply["skipped"].get("title")
        == "manual_lock_preserved",
        "refine_candidate_skipped": refine_apply["skipped"].get("title")
        == "candidate_decision_requires_explicit_review",
    }
    return {
        "mode": "metadata_lifecycle_demo",
        "uses_production_data": False,
        "passed": all(checks.values()),
        "checks": checks,
        "scenarios": {
            "preview": preview,
            "apply": {
                "report": apply,
                "after": {
                    "title": after_apply.title if after_apply else None,
                    "summary": after_apply.summary if after_apply else None,
                    "tags": after_apply.tags if after_apply else None,
                },
            },
            "manual_lock": manual_apply,
            "refine_candidate": refine_apply,
        },
    }


if __name__ == "__main__":
    main()
