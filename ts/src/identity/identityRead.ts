// Identity read primitives — the port of Store.get_all_identity,
// get_identity_by_layer, and get_identity (read side only; the write side
// lives in identityStore.ts / setIdentity.ts).

import type { Database } from "../db/database.ts";
import { requireString } from "../db/rowDecode.ts";

/** The projection `identity list` needs: layer, key, and content for the preview. */
export interface IdentityListRow {
  layer: string;
  key: string;
  content: string;
}

function toListRow(row: Record<string, unknown>): IdentityListRow {
  return {
    layer: requireString(row, "layer"),
    key: requireString(row, "key"),
    content: requireString(row, "content"),
  };
}

/** Port of `get_all_identity`: every identity row, ordered by (layer, key). */
export function listAllIdentity(db: Database): IdentityListRow[] {
  return db
    .prepare("SELECT layer, key, content FROM identity ORDER BY layer, key")
    .all()
    .map(toListRow);
}

/** Port of `get_identity_by_layer`: rows for one layer, ordered by key. */
export function listIdentityByLayer(db: Database, layer: string): IdentityListRow[] {
  return db
    .prepare("SELECT layer, key, content FROM identity WHERE layer = ? ORDER BY key")
    .all(layer)
    .map(toListRow);
}

/** Port of `get_identity` (content only): null when the (layer, key) row is absent. */
export function getIdentityContent(db: Database, layer: string, key: string): string | null {
  const row = db
    .prepare("SELECT content FROM identity WHERE layer = ? AND key = ?")
    .get(layer, key);
  if (row === undefined) return null;
  return requireString(row, "content");
}
