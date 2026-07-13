// TS journey writes — the write path of create_journey and set_project_path.
//
// A journey is an identity row (layer "journey"). create_journey composes
// metadata from its fields and serializes it with Python's json.dumps
// (sort_keys=True, ensure_ascii=False); set_project_path re-serializes the
// mutated metadata with json.dumps defaults. The project_path is normalized by
// the Python service against the real filesystem (Path.resolve), so for parity we
// take it pre-normalized (injected) — the same way id and now are injected.

import type { WritableDatabase } from "../db/database.ts";
import {
  type IdentityRow,
  updateIdentityMetadata,
  upsertIdentity,
} from "../identity/identityStore.ts";
import { pyJsonDumps } from "../util/pyJson.ts";

export const JOURNEY_LAYER = "journey";

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
 * Select the non-empty metadata fields in the Python order, mirroring
 * _metadata_from_fields (trim; keep only non-empty). Key order here does not
 * affect create_journey (it serializes with sort_keys) but does matter when the
 * dict is later re-serialized without sort_keys.
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
  const metadataJson =
    Object.keys(metadata).length > 0
      ? pyJsonDumps(metadata, { sortKeys: true, ensureAscii: false })
      : null;
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
 * (already normalized), re-serialize with json.dumps defaults, update. Preserves
 * the existing key order and updates project_path in place when present.
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
    throw new Error(`journey not found: ${slug}`);
  }
  const existing =
    typeof row.metadata === "string" && row.metadata.length > 0
      ? (JSON.parse(row.metadata) as Record<string, unknown>)
      : {};
  const meta: Record<string, unknown> = { ...existing, project_path: normalizedProjectPath };
  updateIdentityMetadata(db, JOURNEY_LAYER, slug, pyJsonDumps(meta), nowIso);
}
