// Conversations as calls — CV24.DS2.
//
// A host that embeds this core (Mirror Desktop 0.3) records Conversations
// through four calls instead of the CLI and Python's `MemoryClient`:
//
//   - `ensureConversation`: the Conversation bound to a runtime session,
//     created and bound when none is live. A port of Mirror Desktop's
//     `provision_mirror_conversation.py`, step for step:
//     `get_or_create_conversation`, `upsert_runtime_session`, then
//     `update_conversation(title, journey, interface)`.
//   - `appendConversationMessages`: the `conversations append` contract, the
//     same request and the same receipts, byte for byte.
//   - `renameConversation`: a manual title, locked against the close tail.
//   - `rebindConversationJourney`: move a Conversation to another Journey.
//
// Every call:
//
//   - takes an explicit database path and never reads the environment;
//   - asks the migration report first (CV24.DS1), and refuses a database that
//     is not `current` without opening it for writing, so it never migrates;
//   - writes through `openDatabaseForConversationWrites`, the narrowed handle,
//     instead of the CLI's per-write snapshot (see the decision "A host's
//     Conversation writes are narrowed, not snapshotted").
//
// The caller names the `interface`; this module does not know which host it
// serves.

import {
  type AppendReceipt,
  AppendRejectedError,
  appendConversationMessages as appendBatch,
  parseAppendRequest,
} from "#conversation/append.ts";
import { cleanTitle, updateConversation, writeTitle } from "#conversation/lifecycleWrites.ts";
import { getOrCreateSessionConversation } from "#conversation/logger.ts";
import { openDatabaseForConversationWrites, type WritableDatabase } from "#db/database.ts";
import {
  inspectMigrationState,
  type MigrationReport,
  type MigrationState,
} from "#db/migrationReport.ts";
import { upsertRuntimeSession } from "#mirror/runtimeSession.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";

/** The database is not one these calls may write: anything but `current`. */
export class DatabaseNotCurrentError extends Error {
  readonly state: MigrationState;
  readonly report: MigrationReport;

  constructor(report: MigrationReport) {
    super(`database is ${report.state}, not current; no Conversation was written`);
    this.state = report.state;
    this.report = report;
  }
}

export type ConversationCallRejection =
  | "invalid_request"
  | "conversation_unavailable"
  | "invalid_title";

/** A call's own refusal, named as Mirror Desktop's catalog script named it. */
export class ConversationCallRejectedError extends Error {
  readonly reason: ConversationCallRejection;

  constructor(reason: ConversationCallRejection) {
    super(reason);
    this.reason = reason;
  }
}

function withConversationWrites<T>(dbPath: string, write: (db: WritableDatabase) => T): T {
  const report = inspectMigrationState(dbPath);
  if (report.state !== "current") throw new DatabaseNotCurrentError(report);
  const db = openDatabaseForConversationWrites(dbPath);
  try {
    return write(db);
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

/** The Conversation row by EXACT id: a host names one, never a prefix. */
function exactConversation(
  db: WritableDatabase,
  conversationId: unknown,
): { id: string; journey: unknown } {
  const id = text(conversationId);
  const found = db.prepare("SELECT id, journey FROM conversations WHERE id = ?").get(id);
  if (!found) throw new ConversationCallRejectedError("conversation_unavailable");
  return { id: String(found.id), journey: found.journey };
}

export interface EnsureConversationRequest {
  sessionId: string;
  journeyId: string;
  title: string;
  interface: string;
}

/** The live Conversation bound to `sessionId`, created and bound if there is none. */
export function ensureConversation(
  dbPath: string,
  request: EnsureConversationRequest,
): { conversationId: string; journeyId: string } {
  const sessionId = text(request?.sessionId);
  const journeyId = text(request?.journeyId);
  const title = text(request?.title);
  const surface = text(request?.interface);
  return withConversationWrites(dbPath, (db) => {
    const conversationId = getOrCreateSessionConversation(
      db,
      sessionId,
      { interface: surface, journey: journeyId, title },
      { newId, nowIso },
    );
    upsertRuntimeSession(
      db,
      sessionId,
      { conversationId, interface: surface, journey: journeyId, active: true, closedAt: null },
      nowIso(),
    );
    updateConversation(db, conversationId, { title, journey: journeyId, interface: surface });
    return { conversationId, journeyId };
  });
}

/** What `conversations append` would print as its rejection. */
type AppendRejectionReceipt = ReturnType<AppendRejectedError["receipt"]>;

/**
 * Append one batch under the `conversations append` contract. Returns the
 * receipt the CLI would print, accepted or rejected; a database that is not
 * `current` throws `DatabaseNotCurrentError` instead, because the CLI would
 * have migrated it and these calls never do.
 */
export function appendConversationMessages(
  dbPath: string,
  payload: unknown,
): AppendReceipt | AppendRejectionReceipt {
  let request: ReturnType<typeof parseAppendRequest>;
  try {
    request = parseAppendRequest(payload);
  } catch (error) {
    if (error instanceof AppendRejectedError) return error.receipt();
    return new AppendRejectedError("malformed_request").receipt();
  }
  try {
    return withConversationWrites(dbPath, (db) => appendBatch(db, request));
  } catch (error) {
    if (error instanceof DatabaseNotCurrentError) throw error;
    if (error instanceof AppendRejectedError) return error.receipt();
    return new AppendRejectedError("persistence_failure").receipt();
  }
}

/** Give a Conversation of `journeyId` a manual title, which the close tail will not replace. */
export function renameConversation(
  dbPath: string,
  request: { conversationId: string; journeyId: string; title: string },
): { conversationId: string; journeyId: string; title: string } {
  const journeyId = text(request?.journeyId);
  let title: string;
  try {
    title = cleanTitle(typeof request?.title === "string" ? request.title : "");
  } catch {
    throw new ConversationCallRejectedError("invalid_title");
  }
  return withConversationWrites(dbPath, (db) => {
    const conversation = exactConversation(db, request?.conversationId);
    if (conversation.journey !== journeyId)
      throw new ConversationCallRejectedError("conversation_unavailable");
    writeTitle(db, conversation.id, title, "manual");
    return { conversationId: conversation.id, journeyId, title };
  });
}

/** Move a Conversation to `journeyId`; a no-op when it is already there. */
export function rebindConversationJourney(
  dbPath: string,
  request: { conversationId: string; journeyId: string },
): {
  conversationId: string;
  journeyId: string;
  rebound: boolean;
  previousJourneyId: string | null;
} {
  const journeyId = text(request?.journeyId);
  return withConversationWrites(dbPath, (db) => {
    const conversation = exactConversation(db, request?.conversationId);
    const previousJourneyId =
      typeof conversation.journey === "string" ? conversation.journey : null;
    const rebound = previousJourneyId !== journeyId;
    if (rebound) updateConversation(db, conversation.id, { journey: journeyId });
    return { conversationId: conversation.id, journeyId, rebound, previousJourneyId };
  });
}
