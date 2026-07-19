"""Shadow CLI: surface and promote shadow-layer observations.

CV7.E4.S4 — Shadow as structural cultivation.

Usage:
    python -m memory shadow scan [--limit N] [--mirror-home PATH]
    python -m memory shadow apply <proposal_id> [--content "..."] [--mirror-home PATH]
    python -m memory shadow reject <proposal_id> [--mirror-home PATH]
    python -m memory shadow list [--status pending|accepted|rejected]
                                 [--limit N] [--mirror-home PATH]
    python -m memory shadow show [--mirror-home PATH]
"""

from __future__ import annotations

import json
import sys

from memory.cli.common import db_path_from_mirror_home
from memory.client import MemoryClient
from memory.intelligence.shadow import propose_shadow_observations
from memory.models import Consolidation, Identity
from memory.services.observability import build_llm_logger

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _client(mirror_home: str | None) -> MemoryClient:
    return MemoryClient(db_path=db_path_from_mirror_home(mirror_home))


def _make_llm_logger(store):
    """Return an on_llm_call callback for shadow scan, honoring MEMORY_LOG_LLM_CALLS."""
    return build_llm_logger(store, role="shadow_scan")


def _user_name(mem: MemoryClient) -> str:
    entry = mem.store.get_identity("user", "identity")
    if entry:
        import re

        m = re.search(r"speaking with (\w+)", entry.content)
        if m:
            return m.group(1)
    return "the user"


def _print_proposal(c: Consolidation, index: int, total: int) -> None:
    memory_ids: list[str] = json.loads(c.source_memory_ids) if c.source_memory_ids else []
    print(f"\n{'─' * 60}")
    print(f"Observation {index}/{total}  [{c.id[:8]}]  🌑 SHADOW_OBSERVATION")
    print(f"{'─' * 60}")
    if c.rationale:
        print(f"**Pattern:** {c.rationale}")
    if memory_ids:
        print(f"**Source memories:** {', '.join(m[:8] for m in memory_ids)}")
    print(f"\n{c.proposal}\n")


def _resolve_proposal(mem: MemoryClient, proposal_id: str) -> Consolidation | None:
    c = mem.store.get_consolidation(proposal_id)
    if c:
        return c
    for item in mem.store.list_consolidations(limit=200):
        if item.id.startswith(proposal_id):
            return item
    return None


# ---------------------------------------------------------------------------
# Subcommands
# ---------------------------------------------------------------------------


def cmd_scan(args: list[str]) -> None:
    import argparse

    parser = argparse.ArgumentParser(prog="memory shadow scan")
    parser.add_argument(
        "--limit",
        type=int,
        default=50,
        help="Max shadow-candidate memories to consider (default: 50)",
    )
    parser.add_argument("--mirror-home", default=None)
    parsed = parser.parse_args(args)

    mem = _client(parsed.mirror_home)
    llm_logger = _make_llm_logger(mem.store)

    # Load shadow-candidate memories.
    memories = mem.store.get_shadow_candidate_memories(
        readiness_states=("observed", "candidate"),
        limit=parsed.limit,
    )

    if not memories:
        print(
            "No shadow-candidate memories found.\n"
            "Shadow candidates come from:\n"
            "  • memories with layer='shadow'\n"
            "  • memories of type 'tension' or 'pattern'\n"
            "  • memories advanced to 'candidate' via mm-consolidate\n"
        )
        return

    print(f"Found {len(memories)} shadow-candidate memories. Generating observations...\n")

    shadow_entries = mem.store.get_identity_by_layer("shadow")
    user_name = _user_name(mem)

    proposals = propose_shadow_observations(
        memories=memories,
        shadow_entries=shadow_entries,
        user_name=user_name,
        on_llm_call=llm_logger,
    )

    if not proposals:
        print(
            "No new observations were proposed.\n"
            "The LLM found nothing new beyond what is already in the structural shadow layer,\n"
            "or the evidence was insufficient to surface an observation."
        )
        return

    for i, proposal in enumerate(proposals, 1):
        mem.store.create_consolidation(proposal)
        _print_proposal(proposal, i, len(proposals))

    print(
        f"\n{len(proposals)} observation(s) created with status='pending'.\n"
        "Review each observation above, then:\n"
        "  Accept:  python -m memory shadow apply <proposal_id>\n"
        '  Edit:    python -m memory shadow apply <proposal_id> --content "revised text"\n'
        "  Reject:  python -m memory shadow reject <proposal_id>"
    )


def cmd_apply(args: list[str]) -> None:
    import argparse

    parser = argparse.ArgumentParser(prog="memory shadow apply")
    parser.add_argument("proposal_id")
    parser.add_argument(
        "--content",
        default=None,
        help="Override proposed content with user-edited text",
    )
    parser.add_argument("--mirror-home", default=None)
    parsed = parser.parse_args(args)

    mem = _client(parsed.mirror_home)
    consolidation = _resolve_proposal(mem, parsed.proposal_id)

    if consolidation is None:
        print(f"Error: proposal '{parsed.proposal_id}' not found.", file=sys.stderr)
        sys.exit(1)

    if consolidation.action != "shadow_observation":
        print(
            f"Error: [{consolidation.id[:8]}] has action='{consolidation.action}'. "
            "Use mm-consolidate for non-shadow proposals.",
            file=sys.stderr,
        )
        sys.exit(1)

    if consolidation.status != "pending":
        print(f"Proposal {consolidation.id[:8]} is already '{consolidation.status}'.")
        return

    result_content = parsed.content or consolidation.proposal
    source_ids: list[str] = json.loads(consolidation.source_memory_ids)

    # Append to the structural shadow layer (create if absent).
    target_key = consolidation.target_key or "profile"
    existing = mem.store.get_identity("shadow", target_key)
    if existing:
        updated_content = existing.content.rstrip() + "\n\n---\n\n" + result_content
    else:
        updated_content = result_content

    mem.store.upsert_identity(Identity(layer="shadow", key=target_key, content=updated_content))
    print(f"✓ Shadow layer updated: shadow/{target_key}")

    # Transition source memories to 'acknowledged'.
    for mid in source_ids:
        mem.store.update_memory_readiness_state(mid, "acknowledged")
    if source_ids:
        print(f"  {len(source_ids)} source memories advanced to 'acknowledged'.")

    # Record provenance.
    mem.store.update_consolidation_status(
        consolidation.id, status="accepted", result=result_content
    )
    print(f"\nProposal [{consolidation.id[:8]}] accepted and recorded with provenance.")


def cmd_reject(args: list[str]) -> None:
    import argparse

    parser = argparse.ArgumentParser(prog="memory shadow reject")
    parser.add_argument("proposal_id")
    parser.add_argument("--mirror-home", default=None)
    parsed = parser.parse_args(args)

    mem = _client(parsed.mirror_home)
    consolidation = _resolve_proposal(mem, parsed.proposal_id)

    if consolidation is None:
        print(f"Error: proposal '{parsed.proposal_id}' not found.", file=sys.stderr)
        sys.exit(1)

    if consolidation.status != "pending":
        print(f"Proposal {consolidation.id[:8]} is already '{consolidation.status}'.")
        return

    mem.store.update_consolidation_status(consolidation.id, status="rejected")
    print(f"Proposal [{consolidation.id[:8]}] rejected. Shadow layer unchanged.")


def cmd_list(args: list[str]) -> None:
    import argparse

    parser = argparse.ArgumentParser(prog="memory shadow list")
    parser.add_argument("--status", choices=["pending", "accepted", "rejected"], default=None)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--mirror-home", default=None)
    parsed = parser.parse_args(args)

    mem = _client(parsed.mirror_home)
    # Show only shadow_observation entries.
    all_items = mem.store.list_consolidations(status=parsed.status, limit=parsed.limit * 5)
    items = [c for c in all_items if c.action == "shadow_observation"][: parsed.limit]

    if not items:
        label = f" ({parsed.status})" if parsed.status else ""
        print(f"No shadow observations found{label}.")
        return

    status_icon = {"pending": "⏳", "accepted": "✓", "rejected": "✗"}
    for c in items:
        st = status_icon.get(c.status, "?")
        date = c.created_at[:10]
        ids = json.loads(c.source_memory_ids) if c.source_memory_ids else []
        print(
            f"{st} [{c.id[:8]}] {date}  🌑 {c.rationale or 'shadow observation'}  ({len(ids)} memories)"
        )


def cmd_show(args: list[str]) -> None:
    """Show the current structural shadow layer content."""
    import argparse

    parser = argparse.ArgumentParser(prog="memory shadow show")
    parser.add_argument("--mirror-home", default=None)
    parsed = parser.parse_args(args)

    mem = _client(parsed.mirror_home)
    entries = mem.store.get_identity_by_layer("shadow")

    if not entries:
        print(
            "The structural shadow layer is empty.\n"
            "Run 'python -m memory shadow scan' to surface candidate observations."
        )
        return

    print(f"Shadow layer ({len(entries)} entries):\n")
    for entry in entries:
        print(f"=== shadow/{entry.key} ===")
        print(entry.content)
        print()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    args = argv if argv is not None else sys.argv[1:]

    if not args:
        print(
            "Usage: python -m memory shadow <subcommand> [options]\n"
            "Subcommands: scan, apply, reject, list, show"
        )
        sys.exit(1)

    subcommand = args[0]
    rest = args[1:]

    dispatch = {
        "scan": cmd_scan,
        "apply": cmd_apply,
        "reject": cmd_reject,
        "list": cmd_list,
        "show": cmd_show,
    }

    if subcommand not in dispatch:
        print(f"Unknown subcommand: {subcommand}", file=sys.stderr)
        sys.exit(1)

    dispatch[subcommand](rest)
