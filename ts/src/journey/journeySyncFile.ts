// Journey sync-file metadata parity port (CV22.DS7.US2 slice 3c).
//
// A faithful port of `JourneyService.get_sync_file` / `set_sync_file` /
// `get_journey_path` (`src/memory/services/journey.py`). `sync_file` is a
// field inside the "journey" layer identity row's `metadata` JSON — the same
// metadata object `journeyWrite.ts`'s `journeyMetadata` composes for
// `project_path`/`icon`/`color`/`parent_journey` — read and written here with
// its own narrow read-modify-write (Python's `set_sync_file` reads the whole
// metadata object, sets one key, and writes it back; it does NOT go through
// the ordered `journeyMetadata` composer).

import { readFileSync } from "node:fs";
import type { Database, WritableDatabase } from "../db/database.ts";
import { getIdentityContent, getIdentityMetadata } from "../identity/identityRead.ts";
import { updateIdentityMetadata } from "../identity/identityStore.ts";
import { expandHome } from "../util/paths.ts";
import { JOURNEY_PATH_LAYER } from "./journeyStatus.ts";
import { JourneyNotFoundError } from "./journeyWrite.ts";

export const JOURNEY_LAYER = "journey";

/**
 * Port of `get_sync_file`: the configured sync file path for a journey, or
 * `null` when the journey has no identity row, no metadata, no `sync_file`
 * key, or the metadata fails to parse (matching Python's
 * `except (JSONDecodeError, TypeError): return None`).
 */
export function getSyncFile(db: Database, journey: string): string | null {
  const metadataJson = getIdentityMetadata(db, JOURNEY_LAYER, journey);
  if (!metadataJson) return null;
  try {
    const meta = JSON.parse(metadataJson) as Record<string, unknown>;
    return typeof meta.sync_file === "string" ? meta.sync_file : null;
  } catch {
    return null;
  }
}

/**
 * Port of `set_sync_file`: read-modify-write the journey's metadata, setting
 * `sync_file`, preserving every other existing key. Throws `JourneyNotFoundError`
 * when the journey has no "journey"-layer identity row -- Python's own
 * `cmd_sync_config` does not catch this ValueError either (an uncaught
 * exception, exit 1); the front-door route maps it to a clear stderr message
 * instead of fabricating a fake traceback, the same DS7.US1 `init` precedent.
 */
export function setSyncFile(
  db: WritableDatabase,
  journey: string,
  filePath: string,
  nowIso: string,
): void {
  const existingMetadata = getIdentityMetadata(db, JOURNEY_LAYER, journey);
  const exists =
    db
      .prepare("SELECT 1 FROM identity WHERE layer = ? AND key = ? LIMIT 1")
      .get(JOURNEY_LAYER, journey) !== undefined;
  if (!exists) {
    throw new JourneyNotFoundError(journey);
  }
  let meta: Record<string, unknown>;
  try {
    meta = existingMetadata ? (JSON.parse(existingMetadata) as Record<string, unknown>) : {};
  } catch {
    meta = {};
  }
  meta.sync_file = filePath;
  updateIdentityMetadata(db, JOURNEY_LAYER, journey, JSON.stringify(meta), nowIso);
}

/**
 * Port of `get_journey_path`: if a sync file is configured, read its EXTERNAL
 * file content, falling back to the database's `journey_path`-layer content
 * when the file is absent/unreadable (matching Python's
 * `except (FileNotFoundError, PermissionError, OSError): pass`).
 */
export function getJourneyPath(db: Database, journey: string): string | null {
  const syncFile = getSyncFile(db, journey);
  if (syncFile) {
    try {
      return readFileSync(expandHome(syncFile), "utf8");
    } catch {
      // Fall back to the database.
    }
  }
  return getIdentityContent(db, JOURNEY_PATH_LAYER, journey);
}
