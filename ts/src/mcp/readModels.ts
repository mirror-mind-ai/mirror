// Read models the MCP tools need and the TS core did not yet have (CV22.DS9.US2).
//
// Two of the seven tools read shapes no ported command produced. `list_journeys`
// wants `JourneyService.list_journeys()`' dicts -- TS had only
// `listActiveMirrorJourneys`, which renders a string for Mirror Mode -- and
// `journey_status` wants `get_journey_status()`' dict, where TS had only the
// status renderer's projection of `created_at, title`.
//
// Both are ported from the Python services, not reconstructed from renderers.
// What already existed is reused rather than rewritten: `extractStatus` from
// `identity/journeyListing.ts` (so the `**Status:**` regex does not get a third
// copy), and `allJourneyKeys` plus `getJourneyPathContent` from
// `journey/journeyStatus.ts` -- the latter carries the sync-file fallback that
// `get_journey_path` performs before reading the database, which a fresh
// implementation here would have silently dropped.

import type { Database, Row } from "#db/database.ts";
import { optionalString, requireString } from "#db/rowDecode.ts";
import { extractStatus } from "#identity/journeyListing.ts";
import { allJourneyKeys, getJourneyPathContent } from "#journey/journeyStatus.ts";

/** One row of `JourneyService.list_journeys()`. */
export interface JourneyDto {
  id: string;
  name: string;
  description: string;
  status: string;
  metadata: Record<string, unknown>;
}

/** The `_memory_to_dict` shape the tools serialize. */
export interface MemoryDto {
  id: string | null;
  title: string | null;
  memory_type: string | null;
  layer: string | null;
  journey: string | null;
  tags: string | null;
  content: string | null;
}

/** The `_conversation_to_dict` shape (CV22.DS9.US2 D1). */
export interface ConversationDto {
  id: string | null;
  title: string | null;
  started_at: string | null;
  ended_at: string | null;
  interface: string | null;
  persona: string | null;
  journey: string | null;
  summary: string | null;
}

/** One journey's entry in `get_journey_status()`. */
export interface JourneyStatusEntry {
  identity: string | null;
  journey_path: string | null;
  recent_memories: MemoryDto[];
  recent_conversations: ConversationDto[];
}

/** Python's `_metadata_dict`: `{}` for absent, unparseable, or non-object JSON. */
function metadataObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || raw === "") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Port of `list_journeys`' name/description derivation.
 *
 * `name` is the first line with leading `#` and spaces stripped; `description`
 * is the first paragraph under `## Description` (or `## Descrição`), truncated
 * to 150 characters. The description regex needs a blank line or a following
 * heading to terminate on -- a journey whose description runs to end-of-content
 * yields `""`, which is the oracle's behavior and not a bug to fix here.
 */
function journeyName(content: string): string {
  return (content.split("\n")[0] ?? "")
    .trim()
    .replace(/^[# ]+/, "")
    .trim();
}

function journeyDescription(content: string): string {
  const match = content.match(/## (?:Description|Descrição)\s*\n+([\s\S]+?)(?:\n\n|\n##)/);
  return match ? match[1].trim().slice(0, 150) : "";
}

/** Port of `JourneyService.list_journeys()`. */
export function listJourneyDtos(db: Database): JourneyDto[] {
  return db
    .prepare("SELECT key, content, metadata FROM identity WHERE layer = 'journey' ORDER BY key")
    .all()
    .map((row: Row) => {
      const content = optionalString(row, "content") ?? "";
      return {
        id: requireString(row, "key"),
        name: journeyName(content),
        description: journeyDescription(content),
        // `list_journeys` uses `\w+` here while `list_journey_options` uses
        // `[^\n]+`: the same service reads the same field two ways, so
        // `**Status:** in progress` is "in" in a card and "in progress" in a
        // selector. Ported as-is; converging them is a product decision.
        status: extractStatus(content),
        metadata: metadataObject(optionalString(row, "metadata")),
      };
    });
}

/** Port of `JourneyService.list_active_journeys()`. */
export function listActiveJourneyDtos(db: Database): JourneyDto[] {
  return listJourneyDtos(db).filter((journey) => journey.status === "active");
}

function memoryDto(row: Row): MemoryDto {
  return {
    id: optionalString(row, "id"),
    title: optionalString(row, "title"),
    memory_type: optionalString(row, "memory_type"),
    layer: optionalString(row, "layer"),
    journey: optionalString(row, "journey"),
    tags: optionalString(row, "tags"),
    content: optionalString(row, "content"),
  };
}

function conversationDto(row: Row): ConversationDto {
  return {
    id: optionalString(row, "id"),
    title: optionalString(row, "title"),
    started_at: optionalString(row, "started_at"),
    ended_at: optionalString(row, "ended_at"),
    interface: optionalString(row, "interface"),
    persona: optionalString(row, "persona"),
    journey: optionalString(row, "journey"),
    summary: optionalString(row, "summary"),
  };
}

/**
 * Port of `get_journey_status()` for one journey or all of them.
 *
 * Python reads `SELECT *` with no LIMIT and slices `[:10]` in memory, loading
 * every memory of the journey -- embedding blobs included -- to render seven
 * fields of ten rows. This reproduces the RESULT with a projection and a LIMIT;
 * the bytes are identical and the read is not. Neither query carries a tie-break
 * beyond its timestamp, so equal timestamps resolve by rowid on both sides.
 */
export function journeyStatus(
  db: Database,
  slug: string | null,
): Record<string, JourneyStatusEntry> {
  const journeyIds = slug ? [slug] : allJourneyKeys(db);

  const result: Record<string, JourneyStatusEntry> = {};
  for (const journeyId of journeyIds) {
    const identityRow = db
      .prepare("SELECT content FROM identity WHERE layer = 'journey' AND key = ?")
      .get(journeyId);
    // Not a plain identity read: `get_journey_path` prefers a configured
    // sync_file on disk and falls back to the database.
    const journeyPath = getJourneyPathContent(db, journeyId);
    const memories = db
      .prepare(
        "SELECT id, title, memory_type, layer, journey, tags, content FROM memories " +
          "WHERE journey = ? ORDER BY created_at DESC LIMIT 10",
      )
      .all(journeyId);
    const conversations = db
      .prepare(
        "SELECT id, title, started_at, ended_at, interface, persona, journey, summary " +
          "FROM conversations WHERE journey = ? ORDER BY started_at DESC LIMIT 5",
      )
      .all(journeyId);

    result[journeyId] = {
      identity: identityRow === undefined ? null : optionalString(identityRow, "content"),
      journey_path: journeyPath,
      recent_memories: memories.map((row) => memoryDto(row as Record<string, unknown>)),
      recent_conversations: conversations.map((row) =>
        conversationDto(row as Record<string, unknown>),
      ),
    };
  }
  return result;
}

/** Memories by journey / layer / type, as the filter paths of `search_memories` read them. */
export function memoriesByFilter(
  db: Database,
  column: "journey" | "layer" | "memory_type",
  value: string,
): MemoryDto[] {
  return db
    .prepare(
      `SELECT id, title, memory_type, layer, journey, tags, content FROM memories ` +
        `WHERE ${column} = ? ORDER BY created_at DESC`,
    )
    .all(value)
    .map((row: Row) => memoryDto(row));
}

/** Messages for `recall_conversation`, which needs `created_at` the recall renderer does not. */
export function recallMessages(
  db: Database,
  conversationId: string,
): { role: string; content: string; created_at: string | null }[] {
  return db
    .prepare(
      "SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at",
    )
    .all(conversationId)
    .map((row: Row) => ({
      role: requireString(row, "role"),
      content: requireString(row, "content"),
      created_at: optionalString(row, "created_at"),
    }));
}
