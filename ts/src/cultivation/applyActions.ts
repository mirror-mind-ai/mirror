// Deterministic `consolidate`/`shadow` apply/reject actions (CV22.DS7.US3).
//
// Ports the non-LLM branches of `cli/consolidate_cmd.py:cmd_apply`/`cmd_reject`
// and `cli/shadow_cmd.py:cmd_apply`/`cmd_reject` -- everything except the
// `merge` action (which needs a fresh embedding and is Slice B, replay-gated;
// see `propose.ts`). Each action is its own small, individually-tested
// function behind `applyConsolidation`'s dispatch, not one branching
// mega-handler.
//
// Security posture: `identity_update` reaches an identity write ONLY through
// `applyConsolidationIdentityUpdate` (the self/ego allowlist gate, AI-23) --
// never the ungated `upsertIdentity`/`setIdentity`. `shadow apply`'s safety is
// the HARDCODED constant `layer: "shadow"`; only the *key* is model-influenced,
// and the port must never let the proposal drive the layer.

import type { WritableDatabase } from "../db/database.ts";
import { applyConsolidationIdentityUpdate } from "../identity/applyConsolidationIdentityUpdate.ts";
import { getIdentityContent } from "../identity/identityRead.ts";
import { upsertIdentity } from "../identity/identityStore.ts";
import {
  type ConsolidationRow,
  updateConsolidationStatus,
  updateMemoryReadinessState,
} from "./consolidationStore.ts";

function sourceMemoryIds(consolidation: ConsolidationRow): string[] {
  return JSON.parse(consolidation.source_memory_ids) as string[];
}

// --- Reject (shared by both families) ----------------------------------------

/**
 * Port of `consolidate reject` / `shadow reject`: `status -> 'rejected'`, no
 * source-memory or identity mutation at all. Both CLIs are byte-identical
 * here, so one function serves both front-door commands.
 */
export function rejectConsolidation(db: WritableDatabase, id: string, nowIso: string): void {
  updateConsolidationStatus(db, id, "rejected", null, nowIso);
}

// --- consolidate apply: identity_update --------------------------------------

export type IdentityUpdateOutcome =
  | { kind: "applied"; targetLayer: string; targetKey: string; sourceMemoryIds: string[] }
  | { kind: "missing_target" }
  | { kind: "refused"; message: string };

/**
 * `consolidate apply` for `action = 'identity_update'`. Routes the write
 * exclusively through `applyConsolidationIdentityUpdate` (the allowlist gate)
 * -- there is no other reachable path to an identity write from this
 * function. A refused layer writes NOTHING: no identity row, no readiness
 * advance, no consolidation status change (mirrors Python's `sys.exit(1)`
 * before any of those side effects run).
 */
export function applyIdentityUpdate(
  db: WritableDatabase,
  consolidation: ConsolidationRow,
  resultContent: string,
  ids: { id: string; nowIso: string },
): IdentityUpdateOutcome {
  if (!consolidation.target_layer || !consolidation.target_key) {
    return { kind: "missing_target" };
  }
  try {
    applyConsolidationIdentityUpdate(db, {
      targetLayer: consolidation.target_layer,
      targetKey: consolidation.target_key,
      content: resultContent,
      id: ids.id,
      nowIso: ids.nowIso,
    });
  } catch (error) {
    return { kind: "refused", message: error instanceof Error ? error.message : String(error) };
  }

  const sourceIds = sourceMemoryIds(consolidation);
  for (const memoryId of sourceIds) {
    updateMemoryReadinessState(db, memoryId, "acknowledged");
  }
  updateConsolidationStatus(db, consolidation.id, "accepted", resultContent, ids.nowIso);
  return {
    kind: "applied",
    targetLayer: consolidation.target_layer,
    targetKey: consolidation.target_key,
    sourceMemoryIds: sourceIds,
  };
}

// --- consolidate apply: shadow_candidate --------------------------------------

export interface ShadowCandidateOutcome {
  sourceMemoryIds: string[];
}

/**
 * `consolidate apply` for `action = 'shadow_candidate'`: advances every
 * source memory's readiness to `'candidate'` for the next `mm-shadow` pass,
 * then records the consolidation as accepted.
 */
export function applyShadowCandidate(
  db: WritableDatabase,
  consolidation: ConsolidationRow,
  resultContent: string,
  nowIso: string,
): ShadowCandidateOutcome {
  const sourceIds = sourceMemoryIds(consolidation);
  for (const memoryId of sourceIds) {
    updateMemoryReadinessState(db, memoryId, "candidate");
  }
  updateConsolidationStatus(db, consolidation.id, "accepted", resultContent, nowIso);
  return { sourceMemoryIds: sourceIds };
}

// --- shadow apply --------------------------------------------------------------

export interface ShadowApplyOutcome {
  targetKey: string;
  sourceMemoryIds: string[];
}

/**
 * `shadow apply`: append (or create) the structural `shadow` identity layer at
 * `target_key` (default `'profile'`), advance source memories to
 * `'acknowledged'`, and record acceptance. SAFETY: `layer` is the HARDCODED
 * constant `"shadow"` -- never read from `consolidation.target_layer` or any
 * other proposal field. Only `target_key` (or the `'profile'` default) is
 * model-influenced; that is the entire allowed surface, matching Python's
 * `mem.store.upsert_identity(Identity(layer="shadow", key=target_key, ...))`.
 */
export function applyShadowApply(
  db: WritableDatabase,
  consolidation: ConsolidationRow,
  resultContent: string,
  ids: { id: string; nowIso: string },
): ShadowApplyOutcome {
  const targetKey = consolidation.target_key ?? "profile";
  const existingContent = getIdentityContent(db, "shadow", targetKey);
  const updatedContent =
    existingContent !== null
      ? `${existingContent.trimEnd()}\n\n---\n\n${resultContent}`
      : resultContent;

  upsertIdentity(
    db,
    {
      id: ids.id,
      layer: "shadow",
      key: targetKey,
      content: updatedContent,
      version: "1.0.0",
      metadata: null,
    },
    ids.nowIso,
  );

  const sourceIds = sourceMemoryIds(consolidation);
  for (const memoryId of sourceIds) {
    updateMemoryReadinessState(db, memoryId, "acknowledged");
  }
  updateConsolidationStatus(db, consolidation.id, "accepted", resultContent, ids.nowIso);
  return { targetKey, sourceMemoryIds: sourceIds };
}
