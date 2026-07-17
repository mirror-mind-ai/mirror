"""Consolidation CLI: scan memories for patterns and apply consolidation proposals.

CV7.E4.S3 — Consolidation as integration (manual-by-acknowledgment).

Usage:
    python -m memory consolidate scan [--journey J] [--layer L] [--limit N]
                                      [--threshold 0.75] [--mirror-home PATH]
    python -m memory consolidate apply <proposal_id> [--content "..."] [--mirror-home PATH]
    python -m memory consolidate reject <proposal_id> [--mirror-home PATH]
    python -m memory consolidate list [--status pending|accepted|rejected]
                                      [--limit N] [--mirror-home PATH]
"""

from __future__ import annotations

import argparse
import json
import sys

from memory.cli.common import db_path_from_mirror_home
from memory.client import MemoryClient
from memory.intelligence.consolidate import (
    DEFAULT_CLUSTER_THRESHOLD,
    cluster_memories,
    propose_consolidation,
)
from memory.models import Consolidation, Identity
from memory.services.observability import build_llm_logger

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _client(mirror_home: str | None) -> MemoryClient:
    return MemoryClient(db_path=db_path_from_mirror_home(mirror_home))


def _make_llm_logger(store):
    """Return an on_llm_call callback for consolidation, honoring MEMORY_LOG_LLM_CALLS."""
    return build_llm_logger(store, role="consolidation")


def _identity_context(mem: MemoryClient) -> str:
    """Build a brief identity context string for the consolidation prompt."""
    parts = []
    for layer, key in [("ego", "behavior"), ("ego", "identity"), ("self", "soul")]:
        entry = mem.store.get_identity(layer, key)
        if entry:
            parts.append(f"## {layer}/{key}\n{entry.content[:600]}")
    return "\n\n".join(parts) if parts else "(no identity context loaded)"


def _user_name(mem: MemoryClient) -> str:
    """Extract the user's first name from the identity database."""
    entry = mem.store.get_identity("user", "identity")
    if entry and "Vinícius" in entry.content:
        return "Vinícius"
    # Fallback: scan for any first-name marker
    if entry:
        import re

        m = re.search(r"speaking with (\w+)", entry.content)
        if m:
            return m.group(1)
    return "the user"


def _print_proposal(c: Consolidation, source_memories: list, index: int, total: int) -> None:
    action_icon = {"merge": "🔀", "identity_update": "🧬", "shadow_candidate": "🌑"}.get(
        c.action, "•"
    )
    print(f"\n{'─' * 60}")
    print(f"Proposal {index}/{total}  [{c.id[:8]}]  {action_icon} {c.action.upper()}")
    print(f"{'─' * 60}")

    print("\n**Source memories:**")
    for mem in source_memories:
        date = mem.created_at[:10]
        print(f"  • [{mem.id[:8]}] {mem.title}  ({mem.memory_type}/{mem.layer}, {date})")

    if c.target_layer and c.target_key:
        print(f"\n**Target:** `{c.target_layer}/{c.target_key}`")

    if c.rationale:
        print(f"\n**Rationale:** {c.rationale}")

    print(f"\n**Proposed content:**\n{c.proposal}")
    print()


# ---------------------------------------------------------------------------
# Subcommands
# ---------------------------------------------------------------------------


def cmd_scan(args: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="memory consolidate scan")
    parser.add_argument("--journey", default=None, help="Filter memories by journey")
    parser.add_argument("--layer", default=None, help="Filter memories by layer")
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Maximum number of proposals to generate (default: 5)",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_CLUSTER_THRESHOLD,
        help=f"Cosine similarity threshold for clustering (default: {DEFAULT_CLUSTER_THRESHOLD})",
    )
    parser.add_argument("--mirror-home", default=None)
    parsed = parser.parse_args(args)

    mem = _client(parsed.mirror_home)
    llm_logger = _make_llm_logger(mem.store)

    # Load memories with embeddings.
    all_memories = mem.store.get_all_memories_with_embeddings()
    if parsed.journey:
        all_memories = [m for m in all_memories if m.journey == parsed.journey]
    if parsed.layer:
        all_memories = [m for m in all_memories if m.layer == parsed.layer]

    if not all_memories:
        print("No memories with embeddings found for the given filters.")
        return

    print(f"Scanning {len(all_memories)} memories (threshold={parsed.threshold})...")

    clusters = cluster_memories(all_memories, threshold=parsed.threshold)

    if not clusters:
        print("No clusters found above the similarity threshold.")
        print(f"Try lowering --threshold (current: {parsed.threshold:.2f}).")
        return

    # Cap at limit.
    clusters = clusters[: parsed.limit]
    print(f"Found {len(clusters)} cluster(s). Generating proposals...\n")

    user_name = _user_name(mem)
    identity_ctx = _identity_context(mem)

    proposals_created = 0
    for cluster in clusters:
        proposal = propose_consolidation(
            cluster=cluster,
            user_name=user_name,
            identity_context=identity_ctx,
            on_llm_call=llm_logger,
        )
        if proposal is None:
            print(f"  ⚠ LLM returned no valid proposal for cluster of {len(cluster)} memories.")
            continue

        mem.store.create_consolidation(proposal)
        source_memories = list(cluster)
        _print_proposal(proposal, source_memories, proposals_created + 1, len(clusters))
        proposals_created += 1

    if proposals_created == 0:
        print("No proposals were generated.")
        return

    print(
        f"\n{proposals_created} proposal(s) created with status='pending'.\n"
        "Review each proposal above, then:\n"
        "  Accept:  python -m memory consolidate apply <proposal_id>\n"
        '  Edit:    python -m memory consolidate apply <proposal_id> --content "revised text"\n'
        "  Reject:  python -m memory consolidate reject <proposal_id>\n"
        "  List all: python -m memory consolidate list"
    )


def cmd_apply(args: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="memory consolidate apply")
    parser.add_argument("proposal_id", help="Proposal ID (or first 8 chars)")
    parser.add_argument(
        "--content",
        default=None,
        help="Override the proposed content with user-edited text",
    )
    parser.add_argument("--mirror-home", default=None)
    parsed = parser.parse_args(args)

    mem = _client(parsed.mirror_home)

    # Resolve partial ID.
    consolidation = _resolve_proposal(mem, parsed.proposal_id)
    if consolidation is None:
        print(f"Error: proposal '{parsed.proposal_id}' not found.", file=sys.stderr)
        sys.exit(1)

    if consolidation.status != "pending":
        print(f"Proposal {consolidation.id[:8]} is already '{consolidation.status}'.")
        return

    result_content = parsed.content or consolidation.proposal
    source_ids: list[str] = json.loads(consolidation.source_memory_ids)

    # Execute the proposal.
    if consolidation.action == "identity_update":
        if not consolidation.target_layer or not consolidation.target_key:
            print(
                "Error: identity_update proposal has no target_layer/target_key.", file=sys.stderr
            )
            sys.exit(1)
        existing = mem.store.get_identity(consolidation.target_layer, consolidation.target_key)
        if existing:
            updated_content = existing.content.rstrip() + "\n\n" + result_content
        else:
            updated_content = result_content
        identity = Identity(
            layer=consolidation.target_layer,
            key=consolidation.target_key,
            content=updated_content,
        )
        mem.store.upsert_identity(identity)
        print(f"✓ Updated identity: {consolidation.target_layer}/{consolidation.target_key}")
        # Advance source memories to 'acknowledged'.
        for mid in source_ids:
            mem.store.update_memory_readiness_state(mid, "acknowledged")
        print(f"  Source memories ({len(source_ids)}) advanced to 'acknowledged'.")

    elif consolidation.action == "merge":
        from memory.models import Memory as MemoryModel

        # Create the merged memory.
        first = mem.store.get_memory(source_ids[0])
        if first is None:
            print("Error: source memory not found.", file=sys.stderr)
            sys.exit(1)
        merged = MemoryModel(
            memory_type=first.memory_type,
            layer=first.layer,
            title=f"[merged] {first.title}",
            content=result_content,
            journey=first.journey,
            context=f"Merged from: {', '.join(source_ids)}",
            relevance_score=1.0,
        )
        # Embed and store.
        from memory.intelligence.embeddings import (
            add_embedding_provenance,
            embedding_to_bytes,
            generate_embedding,
        )
        from memory.services.observability import build_llm_logger

        emb = generate_embedding(
            result_content, on_llm_call=build_llm_logger(mem.store, role="embedding")
        )
        merged.embedding = embedding_to_bytes(emb)
        merged.metadata = add_embedding_provenance(merged.metadata)
        mem.store.create_memory(merged)
        print(f"✓ Created merged memory: [{merged.id[:8]}] {merged.title}")
        # Mark originals as 'integrated'.
        for mid in source_ids:
            mem.store.update_memory_readiness_state(mid, "integrated")
        print(f"  Source memories ({len(source_ids)}) marked as 'integrated'.")

    elif consolidation.action == "shadow_candidate":
        # Advance source memories to 'candidate' for the mm-shadow pass.
        for mid in source_ids:
            mem.store.update_memory_readiness_state(mid, "candidate")
        print(
            f"✓ Shadow candidate accepted. "
            f"{len(source_ids)} memories advanced to 'candidate'.\n"
            "  Run mm-shadow to surface these in the next shadow review pass."
        )

    # Record the accepted result with provenance.
    mem.store.update_consolidation_status(
        consolidation.id, status="accepted", result=result_content
    )
    print(f"\nProposal [{consolidation.id[:8]}] marked as accepted.")


def cmd_reject(args: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="memory consolidate reject")
    parser.add_argument("proposal_id", help="Proposal ID (or first 8 chars)")
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
    print(f"Proposal [{consolidation.id[:8]}] rejected. Source memories unchanged.")


def cmd_list(args: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="memory consolidate list")
    parser.add_argument(
        "--status",
        choices=["pending", "accepted", "rejected"],
        default=None,
    )
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--mirror-home", default=None)
    parsed = parser.parse_args(args)

    mem = _client(parsed.mirror_home)
    items = mem.store.list_consolidations(status=parsed.status, limit=parsed.limit)

    if not items:
        label = f" ({parsed.status})" if parsed.status else ""
        print(f"No consolidations found{label}.")
        return

    action_icon = {"merge": "🔀", "identity_update": "🧬", "shadow_candidate": "🌑"}
    status_icon = {"pending": "⏳", "accepted": "✓", "rejected": "✗"}

    for c in items:
        icon = action_icon.get(c.action, "•")
        st = status_icon.get(c.status, "?")
        date = c.created_at[:10]
        ids = json.loads(c.source_memory_ids) if c.source_memory_ids else []
        target = f" → {c.target_layer}/{c.target_key}" if c.target_layer and c.target_key else ""
        print(f"{st} [{c.id[:8]}] {date}  {icon} {c.action}{target}  ({len(ids)} memories)")
        if c.rationale:
            print(f"   {c.rationale}")


# ---------------------------------------------------------------------------
# ID resolution
# ---------------------------------------------------------------------------


def _resolve_proposal(mem: MemoryClient, proposal_id: str) -> Consolidation | None:
    """Resolve a full or partial (8-char) proposal ID."""
    # Try exact first.
    c = mem.store.get_consolidation(proposal_id)
    if c:
        return c
    # Try prefix match across recent consolidations.
    all_items = mem.store.list_consolidations(limit=200)
    for item in all_items:
        if item.id.startswith(proposal_id):
            return item
    return None


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    args = argv if argv is not None else sys.argv[1:]

    if not args:
        print(
            "Usage: python -m memory consolidate <subcommand> [options]\n"
            "Subcommands: scan, apply, reject, list"
        )
        sys.exit(1)

    subcommand = args[0]
    rest = args[1:]

    if subcommand == "scan":
        cmd_scan(rest)
    elif subcommand == "apply":
        cmd_apply(rest)
    elif subcommand == "reject":
        cmd_reject(rest)
    elif subcommand == "list":
        cmd_list(rest)
    else:
        print(f"Unknown subcommand: {subcommand}", file=sys.stderr)
        sys.exit(1)
