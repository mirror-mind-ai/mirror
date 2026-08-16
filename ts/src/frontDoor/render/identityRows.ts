// Shared read of `identity`-layer rows for the read renderers.

import type { Database, Row } from "#db/database.ts";

/**
 * All identity rows for a layer, ordered by key (as the Python oracle reads
 * them). Includes migration 017's `parent_journey` projection so parity and
 * drift diagnostics can observe it; mixed-engine semantic reads still resolve
 * journey parentage from metadata (CR050).
 */
export function identityRows(db: Database, layer: string): Row[] {
  return db
    .prepare(
      "SELECT key, content, metadata, parent_journey FROM identity WHERE layer = ? ORDER BY key",
    )
    .all(layer);
}
