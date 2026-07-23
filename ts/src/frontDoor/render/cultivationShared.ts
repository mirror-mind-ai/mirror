// Shared rendering for the `consolidate`/`shadow` proposal-review commands
// (CV22.DS7.US3): the "not found" / "already reviewed" messages are
// byte-identical across both families' `reject`/`apply` commands in Python
// (each CLI module inlines the same two checks independently), so they are
// ported once here instead of copy-pasted into `consolidate.ts`/`shadow.ts`.

import type { ConsolidationRow } from "../../cultivation/consolidationStore.ts";

/** Port of `f"Error: proposal '{proposal_id}' not found."` (stderr, exit 1). */
export function renderProposalNotFound(proposalId: string): string {
  return `Error: proposal '${proposalId}' not found.\n`;
}

/**
 * Port of `f"Proposal {consolidation.id[:8]} is already '{consolidation.status}'."`
 * (stdout, exit 0). Deliberately NO brackets around the id excerpt here --
 * unlike every success message in both families, which wraps it `[id8]`.
 */
export function renderAlreadyReviewed(consolidation: ConsolidationRow): string {
  return `Proposal ${consolidation.id.slice(0, 8)} is already '${consolidation.status}'.\n`;
}
