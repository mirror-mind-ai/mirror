// TS identity write surface — the port of IdentityService.set_identity.
//
// set_identity is the deterministic write behind `mm-identity` and `mm-seed`:
// create or update an identity prompt for a (layer, key). It is a thin
// orchestration over the upsertIdentity primitive with one load-bearing rule —
// when metadata is None the existing row's metadata is inherited (read before
// write) rather than overwritten with null. `id` and `now` are injected so parity
// runs match the Python oracle (Python builds an Identity() with a random UUID id
// and stamps a microsecond now inside upsert_identity).

import type { WritableDatabase } from "../db/database.ts";
import { type IdentityRow, upsertIdentity } from "./identityStore.ts";

/** Inputs to set_identity. `version` defaults to "1.0.0"; a null/absent metadata inherits. */
export interface SetIdentityInput {
  id: string;
  layer: string;
  key: string;
  content: string;
  /** Defaults to "1.0.0", matching the Python Identity model default. */
  version?: string;
  /**
   * A pre-serialized JSON string, or null/undefined to inherit the existing row's
   * metadata (Python treats `metadata is None` as "keep what is there"). Unlike
   * journeys, set_identity never serializes JSON itself — the string passes through.
   */
  metadata?: string | null;
}

/**
 * Port of IdentityService.set_identity: resolve the effective metadata (inherit on
 * None), default the version, and upsert. Delegates INSERT/UPDATE semantics —
 * including id/created_at preservation on update — to upsertIdentity.
 */
export function setIdentity(db: WritableDatabase, input: SetIdentityInput, nowIso: string): void {
  const row: IdentityRow = {
    id: input.id,
    layer: input.layer,
    key: input.key,
    content: input.content,
    version: input.version ?? "1.0.0",
    metadata: resolveMetadata(db, input),
  };
  upsertIdentity(db, row, nowIso);
}

/**
 * When metadata is provided, use it verbatim. When it is null or absent, inherit
 * the existing row's metadata (or null when there is no existing row) — mirroring
 * `metadata = existing.metadata if existing else None`.
 */
function resolveMetadata(db: WritableDatabase, input: SetIdentityInput): string | null {
  if (input.metadata !== undefined && input.metadata !== null) {
    return input.metadata;
  }
  const existing = db
    .prepare("SELECT metadata FROM identity WHERE layer = ? AND key = ?")
    .get(input.layer, input.key);
  if (existing === undefined) {
    return null;
  }
  return (existing.metadata as string | null) ?? null;
}
