// Atomic closed-session import (CV22.DS7.US10 slice E).
//
// Ports `RuntimeSessionService.import_closed_conversation` from
// `src/memory/services/runtime_session.py`, the seam both backfills write
// through. It is the sibling of `getOrCreateSessionConversation` in
// `logger.ts` and shares its transaction discipline for the same reason:
// a backfill imports against the SAME `runtime_sessions` key a live hook
// binds (Pi's live session id is the session file path), and the two can
// interleave.
//
// Resolved decision 4B (plan.md): the binding check runs INSIDE the
// `BEGIN IMMEDIATE` transaction, so a binding a concurrent hook committed
// while this import waited for the write lock is seen and honored -- the
// import returns null instead of clobbering a live session with
// `active=0`/`closed_at`. The same atomicity removes the crash-window
// duplicate-import path: either the conversation, every message, and the
// binding all land, or nothing does.
//
// Titles are deliberately NOT set here. The two callers title differently
// (Pi through `setProvisionalTitle`, Codex through a bare column write) and
// Python applies both after commit; reproducing that asymmetry is the
// callers' job.

import type { LoggerDeps } from "#conversation/logger.ts";
import { type WritableDatabase, withTransaction } from "#db/database.ts";

export interface ImportedMessage {
  role: string;
  content: string;
  createdAt: string;
}

export interface ClosedSessionImport {
  interface: string;
  messages: readonly ImportedMessage[];
  endedAt: string;
}

/**
 * Import a closed session transcript as one conversation bound to
 * `sessionId`. Returns the new conversation id, or null when the session is
 * already tracked -- including by a writer that won the binding while this
 * call waited for the lock.
 */
export function importClosedConversation(
  db: WritableDatabase,
  sessionId: string,
  session: ClosedSessionImport,
  deps: LoggerDeps,
): string | null {
  return withTransaction(db, () => {
    const tracked = db
      .prepare("SELECT 1 FROM runtime_sessions WHERE session_id = ?")
      .get(sessionId);
    if (tracked) return null;

    // Python's Conversation(...) draws its id before its started_at; keep the
    // same generator order so injected sequences line up with the oracle.
    const conversationId = deps.newId();
    const startedAt = deps.nowIso();
    db.prepare(
      `INSERT INTO conversations
         (id, title, started_at, ended_at, interface, persona, journey, summary, tags, metadata)
       VALUES (?, NULL, ?, ?, ?, NULL, NULL, NULL, NULL, NULL)`,
    ).run(conversationId, startedAt, session.endedAt, session.interface);

    const insertMessage = db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at, token_count, metadata)
       VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
    );
    for (const message of session.messages) {
      insertMessage.run(
        deps.newId(),
        conversationId,
        message.role,
        message.content,
        message.createdAt,
      );
    }

    db.prepare(
      `INSERT INTO runtime_sessions
         (session_id, conversation_id, interface, mirror_active, persona, journey,
          hook_injected, active, started_at, updated_at, closed_at, metadata)
       VALUES (?, ?, ?, 0, NULL, NULL, 0, 0, ?, ?, ?, NULL)`,
    ).run(sessionId, conversationId, session.interface, startedAt, startedAt, session.endedAt);

    return conversationId;
  });
}
