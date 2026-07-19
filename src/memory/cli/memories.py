"""List memories with filters by type, layer, and journey."""

import argparse
import json

from memory import MemoryClient
from memory.cli.common import db_path_from_mirror_home

ICONS = {
    "decision": "⚖️",
    "insight": "💡",
    "idea": "🌱",
    "journal": "📓",
    "tension": "⚡",
    "learning": "📚",
    "pattern": "🔄",
    "commitment": "🤝",
    "reflection": "🪞",
}


def _print_memory_row(memory) -> None:
    icon = ICONS.get(memory.memory_type, "•")
    date = memory.created_at[:10] if memory.created_at else "?"
    journey_str = f" 🧭 {memory.journey}" if memory.journey else ""
    persona_str = f" ◇ {memory.persona}" if memory.persona else ""

    tags_list: list[str] = []
    if memory.tags:
        try:
            tags_list = json.loads(memory.tags)
        except (json.JSONDecodeError, TypeError):
            pass
    tags_str = f"  🏷 {', '.join(tags_list)}" if tags_list else ""

    print(f"{icon} **{memory.title}**")
    print(
        f"  {date} | `{memory.id[:8]}` | "
        f"{memory.memory_type} [{memory.layer}]{journey_str}{persona_str}"
    )
    print(f"  {memory.content[:200]}")
    if tags_str:
        print(tags_str)
    print()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="List memories from the memory database")
    parser.add_argument("--type", dest="memory_type", help="Filter by type")
    parser.add_argument("--layer", help="Filter by layer (self/ego/shadow)")
    parser.add_argument("--journey", help="Filter by journey")
    parser.add_argument("--limit", type=int, default=20, help="Maximum number")
    parser.add_argument("--search", help="Semantic search query")
    parser.add_argument(
        "--mirror-home",
        default=None,
        help="Explicit user home whose database should be read for this command",
    )
    args = parser.parse_args(argv)

    mem = MemoryClient(db_path=db_path_from_mirror_home(args.mirror_home))

    if args.search:
        outcome = mem.search_with_status(
            args.search,
            limit=args.limit,
            memory_type=args.memory_type,
            layer=args.layer,
            journey=args.journey,
            log_access=False,
        )
        results = outcome.results
        degraded_note = (
            "⚠ Degraded: lexical-only search (embedding unavailable — offline or no API key)."
        )
        if not results:
            print(degraded_note if outcome.degraded else "No memories found.")
            return

        if outcome.degraded:
            print(degraded_note + " Ranked by keyword match.\n")
        print(f'🔍 Search: "{args.search}" ({len(results)} results)\n')
        for memory, score in results:
            icon = ICONS.get(memory.memory_type, "•")
            date = memory.created_at[:10] if memory.created_at else "?"
            journey_str = f" 🧭 {memory.journey}" if memory.journey else ""
            tags_list: list[str] = []
            if memory.tags:
                try:
                    tags_list = (
                        json.loads(memory.tags) if isinstance(memory.tags, str) else memory.tags
                    )
                except (json.JSONDecodeError, TypeError):
                    pass
            tags_str = f"  🏷 {', '.join(tags_list)}" if tags_list else ""
            print(f"{icon} **{memory.title}** (score: {score:.3f})")
            print(
                f"  {date} | `{memory.id[:8]}` | {memory.memory_type} [{memory.layer}]{journey_str}"
            )
            print(f"  {memory.content[:200]}")
            if tags_str:
                print(tags_str)
            print()
        return

    memories = mem.memories.list_recent(
        limit=args.limit,
        memory_type=args.memory_type,
        layer=args.layer,
        journey=args.journey,
    )

    if not memories:
        print("No memories found.")
        return

    filter_parts = []
    if args.memory_type:
        filter_parts.append(f"type={args.memory_type}")
    if args.layer:
        filter_parts.append(f"layer={args.layer}")
    if args.journey:
        filter_parts.append(f"journey={args.journey}")
    filter_str = f" ({', '.join(filter_parts)})" if filter_parts else ""

    type_counts = mem.memories.count_by_type()
    totals = " | ".join(
        f"{ICONS.get(t, '•')} {t}: {c}" for t, c in sorted(type_counts, key=lambda r: r[0])
    )
    print(f"📦 Memories{filter_str} — {len(memories)} shown\n{totals}\n")

    for memory in memories:
        _print_memory_row(memory)


if __name__ == "__main__":
    main()
