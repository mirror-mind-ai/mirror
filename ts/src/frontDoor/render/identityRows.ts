// Shared read of `identity`-layer rows for the read renderers.

import type { Database, Row } from "../../db/database.ts";

/** All identity rows for a layer, ordered by key (as the Python oracle reads them). */
export function identityRows(db: Database, layer: string): Row[] {
  return db
    .prepare("SELECT key, content, metadata FROM identity WHERE layer = ? ORDER BY key")
    .all(layer);
}
