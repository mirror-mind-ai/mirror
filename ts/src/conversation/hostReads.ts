// The reads a host's sidebar is built from — CV24.DS3.
//
// Three calls for a host that embeds this core (Mirror Desktop 0.3), each
// replacing a route it took through Python:
//
//   - `readJourneyTree`: every Journey as a tree (was `journey export-registry`,
//     retired; this is a new contract, see `journey/journeyTree.ts`);
//   - `listJourneyConversations`: one Journey's Conversations, newest first
//     (was the catalog script's `catalog`);
//   - `inspectConversation`: one Conversation by EXACT id (was its `inspect`).
//
// Like the Conversation calls (`hostCalls.ts`), each asks the migration report
// first and refuses a database that is not `current`, never migrates, and reads
// only the path it is given. Unlike them, each opens read-only: on a WAL
// database the only trace is the `-wal` and `-shm` every reader leaves.

import { listRecentConversationSummaries } from "#conversation/listing.ts";
import { type Database, openDatabaseReadOnly } from "#db/database.ts";
import { inspectMigrationState } from "#db/migrationReport.ts";
import { buildJourneyTree, type JourneyTree, type JourneyTreeRow } from "#journey/journeyTree.ts";
import { ConversationCallRejectedError, DatabaseNotCurrentError } from "./hostCalls.ts";

/** The catalog's bound, as Mirror Desktop's catalog script set it. */
const MAX_LIST_LIMIT = 100;

function withRead<T>(dbPath: string, read: (db: Database) => T): T {
  const report = inspectMigrationState(dbPath);
  if (report.state !== "current") throw new DatabaseNotCurrentError(report);
  const db = openDatabaseReadOnly(dbPath);
  try {
    return read(db);
  } finally {
    db.close();
  }
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ConversationCallRejectedError("invalid_request");
  }
  return value;
}

/** Every Journey in the home, as a tree in its stored sibling order. */
export function readJourneyTree(dbPath: string): JourneyTree {
  return withRead(dbPath, (db) =>
    buildJourneyTree(
      db
        .prepare(
          "SELECT key, content, updated_at, metadata FROM identity WHERE layer = 'journey' ORDER BY key",
        )
        .all() as unknown as JourneyTreeRow[],
    ),
  );
}

export interface JourneyConversationEntry {
  conversationId: string;
  title: string | null;
  startedAt: string | null;
  messageCount: number;
  persona: string | null;
}

/** A Journey's Conversations, newest first, at most `limit` (1 to 100). */
export function listJourneyConversations(
  dbPath: string,
  request: { journeyId: string; limit: number },
): JourneyConversationEntry[] {
  const journeyId = text(request?.journeyId);
  const limit = request?.limit;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIST_LIMIT
  ) {
    throw new ConversationCallRejectedError("invalid_request");
  }
  return withRead(dbPath, (db) =>
    listRecentConversationSummaries(db, { journey: journeyId, limit }).map((summary) => ({
      conversationId: summary.id,
      title: summary.title,
      startedAt: summary.started_at,
      messageCount: summary.message_count,
      persona: summary.persona,
    })),
  );
}

export interface ConversationInspection {
  conversationId: string;
  journeyId: string | null;
  title: string | null;
  startedAt: string | null;
  endedAt: string | null;
  messageCount: number;
}

/** One Conversation by exact id; a prefix is never resolved. */
export function inspectConversation(
  dbPath: string,
  request: { conversationId: string },
): ConversationInspection {
  const conversationId = text(request?.conversationId);
  return withRead(dbPath, (db) => {
    const found = db
      .prepare(
        "SELECT id, journey, title, started_at, ended_at, " +
          "(SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) AS message_count " +
          "FROM conversations c WHERE id = ?",
      )
      .get(conversationId);
    if (!found) throw new ConversationCallRejectedError("conversation_unavailable");
    const nullable = (value: unknown): string | null => (typeof value === "string" ? value : null);
    return {
      conversationId: String(found.id),
      journeyId: nullable(found.journey),
      title: nullable(found.title),
      startedAt: nullable(found.started_at),
      endedAt: nullable(found.ended_at),
      messageCount: Number(found.message_count),
    };
  });
}
