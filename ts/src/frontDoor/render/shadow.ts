// `shadow` command rendering (CV22.DS7.US3) -- the port of
// `cli/shadow_cmd.py`'s print statements. See `consolidate.ts`'s module doc
// for the shared rendering philosophy and blank-line idiom.

import type { ConsolidationRow } from "../../cultivation/consolidationStore.ts";
import type { ShadowScanResult } from "../../cultivation/scan.ts";
import type { RejectOutcome, ShadowApplyRouteOutcome } from "../cultivationRoute.ts";
import type { RenderedCommand } from "./consolidate.ts";
import { renderAlreadyReviewed, renderProposalNotFound } from "./cultivationShared.ts";

const STATUS_ICON: Record<string, string> = {
  pending: "⏳",
  accepted: "✓",
  rejected: "✗",
};

function sourceIds(sourceMemoryIds: string): string[] {
  const parsed: unknown = sourceMemoryIds ? JSON.parse(sourceMemoryIds) : [];
  return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [];
}

/** Port of `shadow list`'s `cmd_list` -- callers pre-filter to `action === 'shadow_observation'`. */
export function renderShadowList(
  items: readonly ConsolidationRow[],
  status: string | null,
): string {
  if (items.length === 0) {
    const label = status ? ` (${status})` : "";
    return `No shadow observations found${label}.\n`;
  }
  const lines: string[] = [];
  for (const c of items) {
    const st = STATUS_ICON[c.status] ?? "?";
    const date = c.created_at.slice(0, 10);
    const count = sourceIds(c.source_memory_ids).length;
    lines.push(
      `${st} [${c.id.slice(0, 8)}] ${date}  🌑 ${c.rationale || "shadow observation"}  (${count} memories)`,
    );
  }
  return lines.map((line) => `${line}\n`).join("");
}

/** Port of `shadow show`'s `cmd_show`. */
export function renderShadowShow(entries: readonly { key: string; content: string }[]): string {
  if (entries.length === 0) {
    return (
      "The structural shadow layer is empty.\n" +
      "Run 'python -m memory shadow scan' to surface candidate observations.\n"
    );
  }
  const lines: string[] = [`Shadow layer (${entries.length} entries):`, ""];
  for (const entry of entries) {
    lines.push(`=== shadow/${entry.key} ===`);
    lines.push(entry.content);
    lines.push("");
  }
  return lines.map((line) => `${line}\n`).join("");
}

/** Port of `shadow reject`'s success message; not-found/already-reviewed are shared. */
export function renderShadowRejected(consolidation: ConsolidationRow): string {
  return `Proposal [${consolidation.id.slice(0, 8)}] rejected. Shadow layer unchanged.\n`;
}

/** Port of `shadow reject`'s full output (not_found/already_reviewed shared, success family-specific). */
export function renderShadowReject(outcome: RejectOutcome): RenderedCommand {
  if (outcome.kind === "not_found") {
    return { text: renderProposalNotFound(outcome.proposalId), stderr: true, exitCode: 1 };
  }
  if (outcome.kind === "already_reviewed") {
    return { text: renderAlreadyReviewed(outcome.consolidation), stderr: false, exitCode: 0 };
  }
  return { text: renderShadowRejected(outcome.consolidation), stderr: false, exitCode: 0 };
}

/** Port of `shadow apply`'s full output. */
export function renderShadowApply(outcome: ShadowApplyRouteOutcome): RenderedCommand {
  if (outcome.kind === "not_found") {
    return { text: renderProposalNotFound(outcome.proposalId), stderr: true, exitCode: 1 };
  }
  if (outcome.kind === "already_reviewed") {
    return { text: renderAlreadyReviewed(outcome.consolidation), stderr: false, exitCode: 0 };
  }
  if (outcome.kind === "wrong_action") {
    const { id, action } = outcome.consolidation;
    return {
      text: `Error: [${id.slice(0, 8)}] has action='${action}'. Use mm-consolidate for non-shadow proposals.\n`,
      stderr: true,
      exitCode: 1,
    };
  }
  // outcome.kind === "applied"
  let text = `✓ Shadow layer updated: shadow/${outcome.targetKey}\n`;
  if (outcome.sourceMemoryIds.length > 0) {
    text += `  ${outcome.sourceMemoryIds.length} source memories advanced to 'acknowledged'.\n`;
  }
  text += `\nProposal [${outcome.consolidation.id.slice(0, 8)}] accepted and recorded with provenance.\n`;
  return { text, stderr: false, exitCode: 0 };
}

const BAR = "─".repeat(60);

/** Port of `_print_proposal` in `shadow_cmd.py` (the scan-time observation card) -- DIFFERENT shape from consolidate's. */
function formatObservationBlock(proposal: ConsolidationRow, index: number, total: number): string {
  const ids = sourceIds(proposal.source_memory_ids);
  let out = `\n${BAR}\n`;
  out += `Observation ${index}/${total}  [${proposal.id.slice(0, 8)}]  🌑 SHADOW_OBSERVATION\n`;
  out += `${BAR}\n`;
  if (proposal.rationale) {
    out += `**Pattern:** ${proposal.rationale}\n`;
  }
  if (ids.length > 0) {
    out += `**Source memories:** ${ids.map((id) => id.slice(0, 8)).join(", ")}\n`;
  }
  out += `\n${proposal.proposal}\n`;
  out += "\n";
  return out;
}

/** Port of `shadow scan`'s full output. */
export function renderShadowScan(result: ShadowScanResult): string {
  if (result.candidatesConsidered === 0) {
    return (
      "No shadow-candidate memories found.\n" +
      "Shadow candidates come from:\n" +
      "  \u2022 memories with layer='shadow'\n" +
      "  \u2022 memories of type 'tension' or 'pattern'\n" +
      "  \u2022 memories advanced to 'candidate' via mm-consolidate\n" +
      "\n"
    );
  }

  let out = `Found ${result.candidatesConsidered} shadow-candidate memories. Generating observations...\n\n`;

  if (result.proposalsCreated.length === 0) {
    out +=
      "No new observations were proposed.\n" +
      "The LLM found nothing new beyond what is already in the structural shadow layer,\n" +
      "or the evidence was insufficient to surface an observation.\n";
    return out;
  }

  result.proposalsCreated.forEach((proposal, index) => {
    out += formatObservationBlock(proposal, index + 1, result.proposalsCreated.length);
  });

  out +=
    `\n${result.proposalsCreated.length} observation(s) created with status='pending'.\n` +
    "Review each observation above, then:\n" +
    "  Accept:  python -m memory shadow apply <proposal_id>\n" +
    '  Edit:    python -m memory shadow apply <proposal_id> --content "revised text"\n' +
    "  Reject:  python -m memory shadow reject <proposal_id>\n";
  return out;
}
