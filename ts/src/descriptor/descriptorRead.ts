// Descriptor read primitives — the port of Store.get_descriptors_by_layer and
// the `get_all_identity`-driven "all layers" iteration in
// memory.cli.descriptor._cmd_list (`generate`, which calls the LLM, stays on
// Python; see routing.ts).

import type { Database } from "../db/database.ts";
import { requireString } from "../db/rowDecode.ts";

export interface DescriptorRow {
  layer: string;
  key: string;
  descriptor: string;
}

function toDescriptorRow(row: Record<string, unknown>): DescriptorRow {
  return {
    layer: requireString(row, "layer"),
    key: requireString(row, "key"),
    descriptor: requireString(row, "descriptor"),
  };
}

/** Port of `get_descriptors_by_layer`: descriptors for one layer, ordered by key. */
export function descriptorsByLayer(db: Database, layer: string): DescriptorRow[] {
  return db
    .prepare("SELECT layer, key, descriptor FROM identity_descriptors WHERE layer = ? ORDER BY key")
    .all(layer)
    .map(toDescriptorRow);
}

/**
 * Port of the "all layers" default path in `_cmd_list`: Python iterates
 * `get_all_identity()` (ordered by layer, key) and keeps only the identity rows
 * that have a matching descriptor row — an inner join driven by `identity`'s
 * order, not a direct scan of `identity_descriptors`. An orphaned descriptor row
 * with no identity row is silently excluded, exactly as the Python loop skips it.
 * Pushed down to SQL per the database-seam philosophy (listing.ts precedent).
 */
export function allDescriptors(db: Database): DescriptorRow[] {
  return db
    .prepare(
      `SELECT i.layer as layer, i.key as key, d.descriptor as descriptor
       FROM identity i
       JOIN identity_descriptors d ON d.layer = i.layer AND d.key = i.key
       ORDER BY i.layer, i.key`,
    )
    .all()
    .map(toDescriptorRow);
}
