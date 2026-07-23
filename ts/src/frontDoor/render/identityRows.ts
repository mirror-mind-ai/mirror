// Shared read of `identity`-layer rows for the read renderers.

import type { Database, Row } from "../../db/database.ts";

/**
 * All identity rows for a layer, ordered by key (as the Python oracle reads
 * them). Includes `parent_journey` (the first-class column, CV22.DS6.US2/US3)
 * — additive for every layer other than "journey", where it feeds
 * `resolveParentJourney`'s column-first resolution.
 */
export function identityRows(db: Database, layer: string): Row[] {
  return db
    .prepare(
      "SELECT key, content, metadata, parent_journey FROM identity WHERE layer = ? ORDER BY key",
    )
    .all(layer);
}
