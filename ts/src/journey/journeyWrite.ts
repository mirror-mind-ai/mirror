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

import type { WritableDatabase } from "../db/database.ts";
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

/** Port of create_journey's write: compose metadata, serialize, upsert identity. */
export function createJourney(
  db: WritableDatabase,
  input: CreateJourneyInput,
  nowIso: string,
): void {
  const metadata = journeyMetadata(input);
  const metadataJson = Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null;
  const row: IdentityRow = {
    id: input.id,
    layer: JOURNEY_LAYER,
    key: input.slug,
    content: input.content,
    version: "1.0.0",
    metadata: metadataJson,
  };
  upsertIdentity(db, row, nowIso);
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
