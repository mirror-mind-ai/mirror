// `consolidate` command rendering (CV22.DS7.US3) -- the port of
// `cli/consolidate_cmd.py`'s print statements. Every function here is a pure
// string builder over already-decided data (`cultivationRoute.ts` decides
// WHAT happened; this module decides HOW it is printed), matching Python's
// exact output including its blank-line quirks (`print(f"...\n")` followed by
// `print()`'s own newline -- see `tasks.ts`'s module doc for the same idiom).

import type { ConsolidationRow, CultivationMemory } from "../../cultivation/consolidationStore.ts";
import type { ConsolidateScanResult } from "../../cultivation/scan.ts";
import type { ConsolidateApplyOutcome, RejectOutcome } from "../cultivationRoute.ts";
import { renderAlreadyReviewed, renderProposalNotFound } from "./cultivationShared.ts";

const ACTION_ICON: Record<string, string> = {
  merge: "🔀",
  identity_update: "🧬",
  shadow_candidate: "🌑",
};

const STATUS_ICON: Record<string, string> = {
  pending: "⏳",
  accepted: "✓",
  rejected: "✗",
};

function sourceIdCount(sourceMemoryIds: string): number {
  const parsed: unknown = sourceMemoryIds ? JSON.parse(sourceMemoryIds) : [];
  return Array.isArray(parsed) ? parsed.length : 0;
}

/** Port of `consolidate list`'s `cmd_list`. */
export function renderConsolidateList(
  items: readonly ConsolidationRow[],
  status: string | null,
): string {
  if (items.length === 0) {
    const label = status ? ` (${status})` : "";
    return `No consolidations found${label}.\n`;
  }
  const lines: string[] = [];
  for (const c of items) {
    const icon = ACTION_ICON[c.action] ?? "•";
    const st = STATUS_ICON[c.status] ?? "?";
    const date = c.created_at.slice(0, 10);
    const target = c.target_layer && c.target_key ? ` → ${c.target_layer}/${c.target_key}` : "";
    lines.push(
      `${st} [${c.id.slice(0, 8)}] ${date}  ${icon} ${c.action}${target}  (${sourceIdCount(c.source_memory_ids)} memories)`,
    );
    if (c.rationale) lines.push(`   ${c.rationale}`);
  }
  return lines.map((line) => `${line}\n`).join("");
}

/** Port of `consolidate reject`'s success message; not-found/already-reviewed are shared. */
export function renderConsolidateRejected(consolidation: ConsolidationRow): string {
  return `Proposal [${consolidation.id.slice(0, 8)}] rejected. Source memories unchanged.\n`;
}

/** Port of `consolidate reject`'s full output (not_found/already_reviewed shared, success family-specific). */
export function renderConsolidateReject(outcome: RejectOutcome): RenderedCommand {
  if (outcome.kind === "not_found") {
    return { text: renderProposalNotFound(outcome.proposalId), stderr: true, exitCode: 1 };
  }
  if (outcome.kind === "already_reviewed") {
    return { text: renderAlreadyReviewed(outcome.consolidation), stderr: false, exitCode: 0 };
  }
  return { text: renderConsolidateRejected(outcome.consolidation), stderr: false, exitCode: 0 };
}

/**
 * Port of `consolidate apply`'s full output, one branch per
 * `ConsolidateApplyOutcome` kind. Returns the text plus which stream/exit
 * code it belongs to -- `cultivationRoute.ts` decided the outcome, this
 * decides the Python-exact bytes AND (unlike every prior front-door
 * renderer) the stream/exit code, because `consolidate apply` fans out into
 * more distinct terminal states than any single-outcome command ported so
 * far.
 */
export interface RenderedCommand {
  text: string;
  stderr: boolean;
  exitCode: number;
}

export function renderConsolidateApply(outcome: ConsolidateApplyOutcome): RenderedCommand {
  if (outcome.kind === "not_found") {
    return { text: renderProposalNotFound(outcome.proposalId), stderr: true, exitCode: 1 };
  }
  if (outcome.kind === "already_reviewed") {
    return { text: renderAlreadyReviewed(outcome.consolidation), stderr: false, exitCode: 0 };
  }
  if (outcome.kind === "identity_missing_target") {
    return {
      text: "Error: identity_update proposal has no target_layer/target_key.\n",
      stderr: true,
      exitCode: 1,
    };
  }
  if (outcome.kind === "identity_refused") {
    return { text: `Error: ${outcome.message}\n`, stderr: true, exitCode: 1 };
  }
  if (outcome.kind === "merge_source_not_found") {
    return { text: "Error: source memory not found.\n", stderr: true, exitCode: 1 };
  }

  // outcome.kind === "applied"
  const id8 = outcome.consolidation.id.slice(0, 8);
  let text = "";
  if (outcome.identityUpdate) {
    const { targetLayer, targetKey, sourceMemoryIds } = outcome.identityUpdate;
    text += `✓ Updated identity: ${targetLayer}/${targetKey}\n`;
    text += `  Source memories (${sourceMemoryIds.length}) advanced to 'acknowledged'.\n`;
  } else if (outcome.merge) {
    const { mergedMemoryId, mergedTitle, sourceMemoryIds } = outcome.merge;
    text += `✓ Created merged memory: [${mergedMemoryId.slice(0, 8)}] ${mergedTitle}\n`;
    text += `  Source memories (${sourceMemoryIds.length}) marked as 'integrated'.\n`;
  } else if (outcome.shadowCandidate) {
    text += `✓ Shadow candidate accepted. ${outcome.shadowCandidate.sourceMemoryIds.length} memories advanced to 'candidate'.\n`;
    text += "  Run mm-shadow to surface these in the next shadow review pass.\n";
  }
  // Unrecognized action (Python's silent fallthrough): no branch text above,
  // only the shared trailing line below.
  text += `\nProposal [${id8}] marked as accepted.\n`;
  return { text, stderr: false, exitCode: 0 };
}

const BAR = "─".repeat(60);

/** Port of `_print_proposal` in `consolidate_cmd.py` (the scan-time proposal card). */
function formatProposalBlock(
  proposal: ConsolidationRow,
  cluster: readonly CultivationMemory[],
  index: number,
  total: number,
): string {
  const icon = ACTION_ICON[proposal.action] ?? "•";
  let out = `\n${BAR}\n`;
  out += `Proposal ${index}/${total}  [${proposal.id.slice(0, 8)}]  ${icon} ${proposal.action.toUpperCase()}\n`;
  out += `${BAR}\n`;
  out += "\n**Source memories:**\n";
  for (const memory of cluster) {
    const date = memory.created_at.slice(0, 10);
    out += `  • [${memory.id.slice(0, 8)}] ${memory.title}  (${memory.memory_type}/${memory.layer}, ${date})\n`;
  }
  if (proposal.target_layer && proposal.target_key) {
    out += `\n**Target:** \`${proposal.target_layer}/${proposal.target_key}\`\n`;
  }
  if (proposal.rationale) {
    out += `\n**Rationale:** ${proposal.rationale}\n`;
  }
  out += `\n**Proposed content:**\n${proposal.proposal}\n`;
  out += "\n";
  return out;
}

/**
 * Port of `consolidate scan`'s full output. `threshold` is rendered two
 * different ways in Python -- plain `str(float)` in the opening "Scanning..."
 * line, `:.2f` in the "Try lowering" hint -- both reproduced here. Plain
 * `String(threshold)` matches Python's float-to-str for ordinary decimal
 * thresholds (e.g. the 0.75 default); exotic float inputs are not
 * byte-audited against CPython's `repr` here.
 */
export function renderConsolidateScan(result: ConsolidateScanResult, threshold: number): string {
  if (result.memoriesScanned === 0) {
    return "No memories with embeddings found for the given filters.\n";
  }
  let out = `Scanning ${result.memoriesScanned} memories (threshold=${threshold})...\n`;
  if (result.results.length === 0) {
    out += "No clusters found above the similarity threshold.\n";
    out += `Try lowering --threshold (current: ${threshold.toFixed(2)}).\n`;
    return out;
  }
  out += `Found ${result.results.length} cluster(s). Generating proposals...\n\n`;

  let createdCount = 0;
  for (const { cluster, proposal } of result.results) {
    if (proposal === null) {
      out += `  ⚠ LLM returned no valid proposal for cluster of ${cluster.length} memories.\n`;
      continue;
    }
    createdCount += 1;
    out += formatProposalBlock(proposal, cluster, createdCount, result.results.length);
  }

  if (createdCount === 0) {
    out += "No proposals were generated.\n";
    return out;
  }

  out +=
    `\n${createdCount} proposal(s) created with status='pending'.\n` +
    "Review each proposal above, then:\n" +
    "  Accept:  python -m memory consolidate apply <proposal_id>\n" +
    '  Edit:    python -m memory consolidate apply <proposal_id> --content "revised text"\n' +
    "  Reject:  python -m memory consolidate reject <proposal_id>\n" +
    "  List all: python -m memory consolidate list\n";
  return out;
}
