// TS journey writes — the write path of create_journey and set_project_path.
//
// A journey is an identity row (layer "journey"). Its metadata is serialized in
// the canonical JSON form (plain JSON.stringify) chosen in CV22.DS6.US1, which
// retired the transition-only Python json.dumps byte-mimicry (pyJson.ts) once TS
// owned schema custody. Existing rows written in the old Python dialects still
// read back fine — every reader JSON.parses — and converge to the canonical form
// on their next write. The project_path is normalized by the caller against the
// real filesystem (Path.resolve equivalent), so we take it pre-normalized
// (injected) — the same way id and now are injected.

import { type WritableDatabase, withTransaction } from "../db/database.ts";
import {
  type IdentityRow,
  updateIdentityMetadata,
  upsertIdentity,
} from "../identity/identityStore.ts";

export const JOURNEY_LAYER = "journey";

/** Raised when a journey slug has no identity row to update. */
export class JourneyNotFoundError extends Error {
  readonly slug: string;
  constructor(slug: string) {
    super(`journey not found: ${slug}`);
    this.slug = slug;
  }
}

export interface JourneyFields {
  /** Already normalized (Path.resolve equivalent) when present. */
  projectPath?: string | null;
  syncFile?: string | null;
  icon?: string | null;
  color?: string | null;
  parentJourney?: string | null;
}

export interface CreateJourneyInput extends JourneyFields {
  id: string;
  slug: string;
  content: string;
}

/**
 * Select the non-empty metadata fields in a fixed order (trim; keep only
 * non-empty), mirroring Python's _metadata_from_fields. The fixed order makes
 * the canonical JSON.stringify output deterministic and gives set_project_path a
 * stable key order to update in place.
 */
export function journeyMetadata(fields: JourneyFields): Record<string, string> {
  const ordered: [string, string | null | undefined][] = [
    ["project_path", fields.projectPath],
    ["sync_file", fields.syncFile],
    ["icon", fields.icon],
    ["color", fields.color],
    ["parent_journey", fields.parentJourney],
  ];
  const metadata: Record<string, string> = {};
  for (const [key, value] of ordered) {
    const clean = (value ?? "").trim();
    if (clean) {
      metadata[key] = clean;
    }
  }
  return metadata;
}

/**
 * Port of create_journey's write: compose metadata, serialize, upsert identity,
 * and atomically mirror `parent_journey` into the first-class column in the
 * SAME transaction (CV22.DS6.US3 rider, activated here). Both statements
 * commit or roll back together — a failure between them must never leave the
 * JSON and the column disagreeing (see reinforcement.ts's `logAccess` for the
 * same `withTransaction` idiom applied to a different two-statement write).
 *
 * This is the only currently-ported live write that can SET `parent_journey`
 * (no `journey set-path`/`update` write in this port touches it). Python's
 * `JourneyService.update_metadata_fields` can still change it and does not
 * know the column exists — that path is reachable only from the web server
 * (src/memory/web/server.py), which is outside this migration's CLI/MCP
 * scope. `resolveParentJourney` (parentJourney.ts) falls back to the JSON when
 * the column is null specifically to tolerate that gap; a column left stale
 * (non-null but outdated) by that unported path is a known, accepted
 * limitation until it is ported or the column is re-synced on read.
 */
export function createJourney(
  db: WritableDatabase,
  input: CreateJourneyInput,
  nowIso: string,
): void {
  const metadata = journeyMetadata(input);
  const metadataJson = Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null;
  const parentJourney = metadata.parent_journey ?? null;
  const row: IdentityRow = {
    id: input.id,
    layer: JOURNEY_LAYER,
    key: input.slug,
    content: input.content,
    version: "1.0.0",
    metadata: metadataJson,
  };
  withTransaction(db, () => {
    upsertIdentity(db, row, nowIso);
    db.prepare("UPDATE identity SET parent_journey = ? WHERE layer = ? AND key = ?").run(
      parentJourney,
      JOURNEY_LAYER,
      input.slug,
    );
  });
}

/**
 * Port of set_project_path's write: read the journey metadata, set project_path
 * (already normalized), re-serialize in the canonical JSON form, update.
 * Preserves the existing key order and updates project_path in place when present.
 */
export function setProjectPath(
  db: WritableDatabase,
  slug: string,
  normalizedProjectPath: string,
  nowIso: string,
): void {
  const row = db
    .prepare("SELECT metadata FROM identity WHERE layer = ? AND key = ?")
    .get(JOURNEY_LAYER, slug);
  if (row === undefined) {
    throw new JourneyNotFoundError(slug);
  }
  const existing =
    typeof row.metadata === "string" && row.metadata.length > 0
      ? (JSON.parse(row.metadata) as Record<string, unknown>)
      : {};
  const meta: Record<string, unknown> = { ...existing, project_path: normalizedProjectPath };
  updateIdentityMetadata(db, JOURNEY_LAYER, slug, JSON.stringify(meta), nowIso);
}
