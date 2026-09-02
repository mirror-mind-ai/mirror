// CV22.DS7.US5 slice C — the budgeted extraction driver.
//
// Ports `extract_pending` and the maintenance counters from
// `src/memory/cli/conversation_logger.py`, plus the eligibility query in
// `ConversationStore.get_unextracted_conversations`.
//
// The extraction call is injected rather than imported: it is the DS5
// orchestration (`runConversationExtraction`) behind the replay transport, so
// this module — the part that decides *what* gets extracted and *how failure
// behaves* — stays deterministic and provider-free. Two released properties
// live here and must not regress:
//
//   * AI-05 (CV9.E2.S26): a backlog can never turn one session start into an
//     unbounded spend loop. At most `limit` conversations per call,
//     oldest-ended first, remainder visibly carried over.
//   * CV9.E2.S7: one poison-pill conversation is recorded and skipped, never
//     allowed to crash the batch or block the queue behind it.

import type { WritableDatabase } from "#db/database.ts";

/** Python's `MEMORY_MAINTENANCE_MAX_EXTRACTIONS` default. */
export const DEFAULT_MAINTENANCE_MAX_EXTRACTIONS = 10;

/**
 * Eligibility, byte-for-byte from `ConversationStore._UNEXTRACTED_WHERE`.
 * `json_extract` returns NULL for malformed metadata, and `IS NOT 1` keeps
 * such a row eligible rather than silently dropping it from the queue.
 */
const UNEXTRACTED_WHERE = `
  WHERE c.ended_at IS NOT NULL
    AND c.journey IS NOT NULL
    AND (c.metadata IS NULL OR json_extract(c.metadata, '$.extracted') IS NOT 1)
    AND (c.metadata IS NULL
         OR json_extract(c.metadata, '$.extraction_quarantined') IS NOT 1)
    AND (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) >= 4
`;

export interface UnextractedConversation {
  id: string;
  journey: string | null;
  persona: string | null;
  metadata: string | null;
}

/** Ended, eligible conversations, oldest-ended first (FIFO drain). */
export function selectUnextractedConversations(
  db: WritableDatabase,
  limit: number | null,
): UnextractedConversation[] {
  const base = `SELECT c.id, c.journey, c.persona, c.metadata FROM conversations c${UNEXTRACTED_WHERE}ORDER BY c.ended_at ASC`;
  const rows = limit === null ? db.prepare(base).all() : db.prepare(`${base} LIMIT ?`).all(limit);
  return rows.map((row) => ({
    id: String(row.id),
    journey: typeof row.journey === "string" ? row.journey : null,
    persona: typeof row.persona === "string" ? row.persona : null,
    metadata: typeof row.metadata === "string" ? row.metadata : null,
  }));
}

export interface ExtractPendingOptions {
  /** Defaults to the released maintenance budget. */
  limit?: number;
  /** The DS5 orchestration behind replay; throwing marks this one failed. */
  runExtraction: (db: WritableDatabase, conversationId: string) => void;
}

/**
 * Extract memories from ended conversations not yet processed.
 *
 * Returns the number of conversations successfully extracted. Each is isolated:
 * a failure is skipped so it cannot crash the batch or block the queue behind
 * it, matching Python's bare `except Exception: continue`.
 */
export function extractPending(db: WritableDatabase, options: ExtractPendingOptions): number {
  const limit = options.limit ?? DEFAULT_MAINTENANCE_MAX_EXTRACTIONS;
  if (limit <= 0) return 0;

  let extracted = 0;
  for (const conversation of selectUnextractedConversations(db, limit)) {
    try {
      options.runExtraction(db, conversation.id);
      extracted += 1;
    } catch {}
  }
  return extracted;
}

function countScalar(db: WritableDatabase, sql: string, ...params: string[]): number {
  const row = db.prepare(sql).get(...params);
  const value = row?.n;
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" ? value : 0;
}

/** Conversations quarantined after repeated extraction failure (CV9.E2.S7). */
export function countQuarantinedConversations(db: WritableDatabase): number {
  return countScalar(
    db,
    `SELECT COUNT(*) AS n FROM conversations c
     WHERE json_extract(c.metadata, '$.extraction_quarantined') IS 1`,
  );
}

/** Conversations whose recorded extraction status matches (AI-10). */
export function countConversationsWithExtractionStatus(
  db: WritableDatabase,
  status: string,
): number {
  return countScalar(
    db,
    `SELECT COUNT(*) AS n FROM conversations c
     WHERE json_extract(c.metadata, '$.extraction_status') = ?`,
    status,
  );
}

/** Conversations still eligible after a capped run (CV9.E2.S26, AI-05). */
export function countCarriedOverConversations(db: WritableDatabase): number {
  return countScalar(db, `SELECT COUNT(*) AS n FROM conversations c${UNEXTRACTED_WHERE}`);
}
