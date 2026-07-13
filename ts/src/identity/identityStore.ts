// TS identity-table writes — the port of storage/identity.py upsert_identity and
// update_identity_metadata. These are the deterministic write primitives behind
// journey and identity management. `id` and `now` are injected so parity runs
// match the Python oracle (Python generates a random UUID id and a microsecond
// now).

import type { WritableDatabase } from "../db/database.ts";

/** The writable columns of an identity row (version is TEXT, e.g. "1.0.0"). */
export interface IdentityRow {
  id: string;
  layer: string;
  key: string;
  content: string;
  version: string;
  metadata: string | null;
}

/**
 * INSERT the identity when (layer, key) is absent, else UPDATE it — mirroring
 * upsert_identity. On INSERT, created_at and updated_at are both the injected
 * now; on UPDATE only updated_at changes and the existing id and created_at are
 * preserved (the WHERE is on the unique (layer, key), so the injected id is
 * ignored for an update, exactly as Python reuses existing.id).
 */
export function upsertIdentity(db: WritableDatabase, identity: IdentityRow, nowIso: string): void {
  const existing = db
    .prepare("SELECT id FROM identity WHERE layer = ? AND key = ?")
    .get(identity.layer, identity.key);
  if (existing !== undefined) {
    db.prepare(
      "UPDATE identity SET content = ?, version = ?, updated_at = ?, metadata = ? " +
        "WHERE layer = ? AND key = ?",
    ).run(
      identity.content,
      identity.version,
      nowIso,
      identity.metadata,
      identity.layer,
      identity.key,
    );
  } else {
    db.prepare(
      "INSERT INTO identity (id, layer, key, content, version, created_at, updated_at, metadata) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      identity.id,
      identity.layer,
      identity.key,
      identity.content,
      identity.version,
      nowIso,
      nowIso,
      identity.metadata,
    );
  }
}

/** UPDATE only metadata and updated_at — mirrors update_identity_metadata. */
export function updateIdentityMetadata(
  db: WritableDatabase,
  layer: string,
  key: string,
  metadata: string,
  nowIso: string,
): void {
  db.prepare("UPDATE identity SET metadata = ?, updated_at = ? WHERE layer = ? AND key = ?").run(
    metadata,
    nowIso,
    layer,
    key,
  );
}
