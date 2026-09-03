"""CLI: list journeys with status, stage, and description."""

import argparse
import re

from memory import MemoryClient
from memory.cli.common import db_path_from_mirror_home


def _journey_row(
    mem: MemoryClient,
    option: dict,
    last_interactions: dict[str, str] | None = None,
) -> dict:
    name = option["id"]
    ident = mem.store.get_identity("journey", name)
    content = ident.content if ident else ""
    status = option.get("status") or "?"

    desc = ""
    for line in content.split("\n"):
        line = line.strip()
        if line.startswith(("## Description", "## Descrição")):
            continue
        if line and not line.startswith("#") and not line.startswith("**"):
            desc = line[:80]
            break

    journey_path_raw = mem.get_identity("journey_path", name)
    journey_path = journey_path_raw if isinstance(journey_path_raw, str) else ""
    stage_match = re.search(r"\*\*(?:Current stage|Etapa atual):\*\*\s*(.+)", journey_path)
    stage = stage_match.group(1).strip() if stage_match else "—"

    last_raw = (last_interactions or {}).get(name, "")
    last = last_raw[:10] if last_raw else "—"
    return {
        "id": name,
        "status": status,
        "stage": stage,
        "description": desc,
        "last_interaction": last,
        "parent_journey": option.get("parent_journey") or "",
        "depth": option.get("depth", 0),
    }


def _print_journey(row: dict) -> None:
    status = row["status"]
    icon = {"active": "🚧", "completed": "✅", "paused": "⏸"}.get(status, "•")
    depth = int(row.get("depth", 0))
    prefix = f"{'│  ' * depth}└─ " if depth else ""
    detail_indent = f"{'│  ' * depth}  " if depth else "  "
    print(f"{prefix}{icon} **{row['id']}** ({status})")
    print(f"{detail_indent}Stage: {row['stage']} · Last: {row.get('last_interaction', '—')}")
    if row["description"]:
        print(f"{detail_indent}{row['description']}")
    print()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="List journeys with status and stage")
    parser.add_argument(
        "--mirror-home",
        default=None,
        help="Explicit user home whose database should be read for this command",
    )
    args = parser.parse_args(argv)

    mem = MemoryClient(db_path=db_path_from_mirror_home(args.mirror_home))
    options = mem.journeys.list_journey_options()

    if not options:
        print("No journeys found.")
        return

    last_interactions = mem.journeys.last_interactions()
    rows = [_journey_row(mem, option, last_interactions) for option in options]
    for row in rows:
        _print_journey(row)


if __name__ == "__main__":
    main()
