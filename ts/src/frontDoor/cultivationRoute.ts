// `consolidate`/`shadow` front-door route (CV22.DS7.US3): the testable core
// deciding WHAT happened for `list`/`reject`/`apply`/`scan` across both
// command families. Rendering (HOW it is printed) lives in
// `render/consolidate.ts` / `render/shadow.ts`.

import {
  applyIdentityUpdate,
  applyMerge,
  applyShadowApply,
  applyShadowCandidate,
  rejectConsolidation,
} from "../cultivation/applyActions.ts";
import {
  type ConsolidationRow,
  resolveProposalByIdOrPrefix,
  updateConsolidationStatus,
} from "../cultivation/consolidationStore.ts";
import type { WritableDatabase } from "../db/database.ts";
import type { EmbeddingProvider } from "../providers/embedding.ts";

// --- Shared resolution (both families) ---------------------------------------

export type ResolveProposalOutcome =
  | { kind: "not_found"; proposalId: string }
  | { kind: "already_reviewed"; consolidation: ConsolidationRow }
  | { kind: "pending"; consolidation: ConsolidationRow };

/** Port of the `_resolve_proposal` + "already reviewed" check shared by every
 * `reject`/`apply` command in both `consolidate_cmd.py` and `shadow_cmd.py`. */
export function resolveProposalForReview(
  db: WritableDatabase,
  proposalId: string,
): ResolveProposalOutcome {
  const consolidation = resolveProposalByIdOrPrefix(db, proposalId);
  if (consolidation === null) return { kind: "not_found", proposalId };
  if (consolidation.status !== "pending") return { kind: "already_reviewed", consolidation };
  return { kind: "pending", consolidation };
}

// --- consolidate reject / shadow reject ---------------------------------------

/** `ResolveProposalOutcome` minus its (internal-only) `"pending"` member --
 * no route ever RETURNS `"pending"` to a caller; it is always converted into
 * a more specific outcome first. Narrowing to this excludes `"pending"` from
 * every exposed union below so a renderer's `if (outcome.kind === "applied")`
 * (or equivalent) narrows completely, with no unreachable-but-typed member. */
export type UnresolvedOutcome = Exclude<ResolveProposalOutcome, { kind: "pending" }>;

export type RejectOutcome =
  | UnresolvedOutcome
  | { kind: "rejected"; consolidation: ConsolidationRow };

/** Shared by `consolidate reject` and `shadow reject` -- identical Python logic in both CLIs. */
export function runReject(db: WritableDatabase, proposalId: string, nowIso: string): RejectOutcome {
  const resolved = resolveProposalForReview(db, proposalId);
  if (resolved.kind !== "pending") return resolved;
  rejectConsolidation(db, resolved.consolidation.id, nowIso);
  return { kind: "rejected", consolidation: resolved.consolidation };
}

// --- consolidate apply ---------------------------------------------------------

export type ConsolidateApplyOutcome =
  | UnresolvedOutcome
  | { kind: "identity_missing_target" }
  | { kind: "identity_refused"; message: string }
  | { kind: "merge_source_not_found" }
  | {
      kind: "applied";
      action: string;
      consolidation: ConsolidationRow;
      resultContent: string;
      identityUpdate?: { targetLayer: string; targetKey: string; sourceMemoryIds: string[] };
      merge?: { mergedMemoryId: string; mergedTitle: string; sourceMemoryIds: string[] };
      shadowCandidate?: { sourceMemoryIds: string[] };
    };

export interface ConsolidateApplyIds {
  /** Injected id for a new identity row (only consumed on INSERT; ignored on UPDATE). */
  identityId: string;
  /** Injected id for a freshly merged memory (only consumed by the `merge` action). */
  mergeMemoryId: string;
  nowIso: string;
}

/**
 * Port of `consolidate_cmd.cmd_apply`'s full dispatch, INCLUDING Python's
 * silent fallthrough: an action outside `{identity_update, merge,
 * shadow_candidate}` (never produced by `proposeConsolidation`'s allowlist,
 * but reachable via a hand-crafted/legacy row) still reaches the SHARED
 * "mark accepted" statement Python runs unconditionally after the
 * if/elif chain -- no actual effect, but the consolidation is marked
 * `accepted` regardless. `embeddingProvider` is required only by the `merge`
 * branch; the caller (front door) only reaches this function when the
 * DS7.US3 replay/live embedding gate is already satisfied.
 */
export async function runConsolidateApply(
  db: WritableDatabase,
  proposalId: string,
  overrideContent: string | null,
  ids: ConsolidateApplyIds,
  embeddingProvider: EmbeddingProvider,
): Promise<ConsolidateApplyOutcome> {
  const resolved = resolveProposalForReview(db, proposalId);
  if (resolved.kind !== "pending") return resolved;
  const consolidation = resolved.consolidation;
  const resultContent = overrideContent ?? consolidation.proposal;

  if (consolidation.action === "identity_update") {
    const outcome = applyIdentityUpdate(db, consolidation, resultContent, {
      id: ids.identityId,
      nowIso: ids.nowIso,
    });
    if (outcome.kind === "missing_target") return { kind: "identity_missing_target" };
    if (outcome.kind === "refused") return { kind: "identity_refused", message: outcome.message };
    return {
      kind: "applied",
      action: "identity_update",
      consolidation,
      resultContent,
      identityUpdate: {
        targetLayer: outcome.targetLayer,
        targetKey: outcome.targetKey,
        sourceMemoryIds: outcome.sourceMemoryIds,
      },
    };
  }

  if (consolidation.action === "merge") {
    const outcome = await applyMerge(db, consolidation, resultContent, {
      embeddingProvider,
      id: ids.mergeMemoryId,
      nowIso: ids.nowIso,
    });
    if (outcome.kind === "source_not_found") return { kind: "merge_source_not_found" };
    return {
      kind: "applied",
      action: "merge",
      consolidation,
      resultContent,
      merge: {
        mergedMemoryId: outcome.mergedMemoryId,
        mergedTitle: outcome.mergedTitle,
        sourceMemoryIds: outcome.sourceMemoryIds,
      },
    };
  }

  if (consolidation.action === "shadow_candidate") {
    const outcome = applyShadowCandidate(db, consolidation, resultContent, ids.nowIso);
    return {
      kind: "applied",
      action: "shadow_candidate",
      consolidation,
      resultContent,
      shadowCandidate: outcome,
    };
  }

  // Unknown action: Python's fallthrough -- the if/elif chain has no `else`,
  // so an unrecognized action performs NO actual write, yet the shared
  // post-chain statement still runs and marks the proposal accepted.
  updateConsolidationStatus(db, consolidation.id, "accepted", resultContent, ids.nowIso);
  return { kind: "applied", action: consolidation.action, consolidation, resultContent };
}

// --- shadow apply ---------------------------------------------------------------

export type ShadowApplyRouteOutcome =
  | UnresolvedOutcome
  | { kind: "wrong_action"; consolidation: ConsolidationRow }
  | {
      kind: "applied";
      consolidation: ConsolidationRow;
      targetKey: string;
      sourceMemoryIds: string[];
    };

/**
 * Port of `shadow_cmd.cmd_apply`'s full dispatch: resolve, then refuse any
 * `action !== 'shadow_observation'` loudly (Python's own guard, separate from
 * -- and checked BEFORE -- the allowlist gate), then apply.
 */
export function runShadowApply(
  db: WritableDatabase,
  proposalId: string,
  overrideContent: string | null,
  ids: { id: string; nowIso: string },
): ShadowApplyRouteOutcome {
  const resolved = resolveProposalForReview(db, proposalId);
  if (resolved.kind !== "pending") return resolved;
  const consolidation = resolved.consolidation;
  if (consolidation.action !== "shadow_observation") {
    return { kind: "wrong_action", consolidation };
  }
  const resultContent = overrideContent ?? consolidation.proposal;
  const outcome = applyShadowApply(db, consolidation, resultContent, ids);
  return {
    kind: "applied",
    consolidation,
    targetKey: outcome.targetKey,
    sourceMemoryIds: outcome.sourceMemoryIds,
  };
}
