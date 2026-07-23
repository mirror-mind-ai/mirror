// `journey status` read primitives — the port of JourneyService.get_journey_status,
// get_journey_path, get_sync_file, and the store reads it composes
// (get_memories_by_journey, get_recent_conversations_by_journey).

import { readFileSync } from "node:fs";
import type { Database } from "../db/database.ts";
import { optionalString, requireString } from "../db/rowDecode.ts";
import { getIdentityContent, getIdentityMetadata } from "../identity/identityRead.ts";
import { expandHome } from "../util/paths.ts";

const JOURNEY_LAYER = "journey";
/** The `journey_path` identity layer, also the write target of `journey update`. */
export const JOURNEY_PATH_LAYER = "journey_path";

export interface JourneyStatusMemoryRow {
  created_at: string;
  title: string;
}

export interface JourneyStatusConversationRow {
  started_at: string;
  title: string | null;
}

export interface JourneyStatusEntry {
  journeyId: string;
  identity: string | null;
  journeyPath: string | null;
  recentMemories: JourneyStatusMemoryRow[];
  recentConversations: JourneyStatusConversationRow[];
}

/** Reads a file as utf8 text; injectable so tests never touch the real filesystem. */
export type ReadTextFile = (path: string) => string;

const defaultReadTextFile: ReadTextFile = (path) => readFileSync(path, "utf8");

/** Port of `get_sync_file`: the journey's own metadata `sync_file`, or null. */
export function getSyncFile(db: Database, journeyKey: string): string | null {
  const metadata = getIdentityMetadata(db, JOURNEY_LAYER, journeyKey);
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const value = (parsed as Record<string, unknown>).sync_file;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Port of `get_journey_path`: prefer the external sync file (expanduser'd) when
 * configured and readable; on ANY read failure (missing, permission, or other
 * I/O error — matching Python's broad `OSError` catch), fall back to the
 * database's `journey_path` identity content.
 */
export function getJourneyPathContent(
  db: Database,
  journeyKey: string,
  readTextFile: ReadTextFile = defaultReadTextFile,
): string | null {
  const syncFile = getSyncFile(db, journeyKey);
  if (syncFile) {
    try {
      return readTextFile(expandHome(syncFile));
    } catch {
      // Fall through to the database.
    }
  }
  return getIdentityContent(db, JOURNEY_PATH_LAYER, journeyKey);
}

/** Port of `store.get_memories_by_journey(journey)[:10]`, LIMIT pushed down to SQL. */
export function getMemoriesByJourney(
  db: Database,
  journeyKey: string,
  limit = 10,
): JourneyStatusMemoryRow[] {
  return db
    .prepare(
      "SELECT created_at, title FROM memories WHERE journey = ? ORDER BY created_at DESC LIMIT ?",
    )
    .all(journeyKey, limit)
    .map((row) => ({
      created_at: requireString(row, "created_at"),
      title: requireString(row, "title"),
    }));
}

/** Port of `store.get_recent_conversations_by_journey(journey, limit=5)`. */
export function getRecentConversationsByJourney(
  db: Database,
  journeyKey: string,
  limit = 5,
): JourneyStatusConversationRow[] {
  return db
    .prepare(
      "SELECT started_at, title FROM conversations WHERE journey = ? ORDER BY started_at DESC LIMIT ?",
    )
    .all(journeyKey, limit)
    .map((row) => ({
      started_at: requireString(row, "started_at"),
      title: optionalString(row, "title"),
    }));
}

/** Port of `_get_journey_identities()` keys only: every journey key, ordered. */
export function allJourneyKeys(db: Database): string[] {
  return db
    .prepare("SELECT key FROM identity WHERE layer = 'journey' ORDER BY key")
    .all()
    .map((row) => requireString(row, "key"));
}

/** Port of `get_journey_status` for an explicit, pre-resolved list of journey keys. */
export function getJourneyStatusEntries(
  db: Database,
  journeyKeys: readonly string[],
  readTextFile: ReadTextFile = defaultReadTextFile,
): JourneyStatusEntry[] {
  return journeyKeys.map((journeyId) => ({
    journeyId,
    identity: getIdentityContent(db, JOURNEY_LAYER, journeyId),
    journeyPath: getJourneyPathContent(db, journeyId, readTextFile),
    recentMemories: getMemoriesByJourney(db, journeyId, 10),
    recentConversations: getRecentConversationsByJourney(db, journeyId, 5),
  }));
}
