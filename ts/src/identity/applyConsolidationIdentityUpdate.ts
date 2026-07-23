// TS port of `IdentityService.apply_consolidation_identity_update` (AI-23,
// CV9.E2.S23) -- the identity-write allowlist gate behind `consolidate apply`'s
// `identity_update` action (CV22.DS7.US3).
//
// Unlike `setIdentity` (general-purpose, unconditional write used for seeding,
// Soul Mode integration, `identity set`, etc.), this is narrowly for the
// propose_consolidation() -> mm-consolidate accept flow: `target_layer` is
// model-chosen and untrusted, so it is checked against
// `VALID_IDENTITY_UPDATE_LAYERS` before anything is written. A rejected layer
// throws -- it never silently no-ops, never redirects, and never writes a
// partial row. This is the ONE path `consolidate apply`'s `identity_update`
// action may reach an identity write through; it must never call the ungated
// `upsertIdentity`/`setIdentity` directly for that action.
//
// Preserves the accept flow's existing append semantics for an allowed write:
// new content is appended after a blank line, never replaces existing content
// outright -- the same shape as Python's `f"{existing.content.rstrip()}\n\n{content}"`.

import type { WritableDatabase } from "../db/database.ts";
import { getIdentityContent } from "./identityRead.ts";
import { type IdentityRow, upsertIdentity } from "./identityStore.ts";

/** Mirrors `models.VALID_IDENTITY_UPDATE_LAYERS = frozenset({"self", "ego"})`. */
export const VALID_IDENTITY_UPDATE_LAYERS: ReadonlySet<string> = new Set(["self", "ego"]);

export interface ApplyConsolidationIdentityUpdateParams {
  targetLayer: string;
  targetKey: string;
  content: string;
  /** Injected id/now, the DS4 determinism idiom -- used only on INSERT. */
  id: string;
  nowIso: string;
}

/**
 * Refuse a non-allowlisted `targetLayer` with the exact Python message and no
 * write at all (no row, no partial row); otherwise append-or-create at parity.
 *
 * The thrown message is byte-identical to Python's:
 * `Refusing identity_update to layer {target_layer!r}: not in the
 * consolidation allowlist {sorted(VALID_IDENTITY_UPDATE_LAYERS)}.` --
 * `sorted({"self", "ego"})` is `['ego', 'self']`, and Python's `!r` repr of a
 * str is single-quoted.
 */
export function applyConsolidationIdentityUpdate(
  db: WritableDatabase,
  params: ApplyConsolidationIdentityUpdateParams,
): void {
  if (!VALID_IDENTITY_UPDATE_LAYERS.has(params.targetLayer)) {
    throw new Error(
      `Refusing identity_update to layer '${params.targetLayer}': not in ` +
        "the consolidation allowlist ['ego', 'self'].",
    );
  }
  const existingContent = getIdentityContent(db, params.targetLayer, params.targetKey);
  const updatedContent =
    existingContent !== null ? `${existingContent.trimEnd()}\n\n${params.content}` : params.content;
  const row: IdentityRow = {
    id: params.id,
    layer: params.targetLayer,
    key: params.targetKey,
    content: updatedContent,
    version: "1.0.0",
    metadata: null,
  };
  upsertIdentity(db, row, params.nowIso);
}
