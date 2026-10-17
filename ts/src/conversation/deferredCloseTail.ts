// The deferred close tail (CV21.DS4.TS2).
//
// A session's close tail is two things: the state writes (`ended_at`, the
// runtime session inactive, the transcript backfill) and the LLM work
// (extraction, then title/summary/tags). Some runtimes give a SessionEnd hook
// less time than one model call: Codex runs it synchronously under a 1 s
// default (DS12.TS2 L2; DS2's live `/hooks` table), Grok under 1.5 s
// (DS12.TS4). Pi and Gemini CLI already close without extraction at exit and
// let the next session start extract (`session-end-pi`). On a runtime that
// bounds the hook, the shared Claude-family `session-end` does the same, and a
// little more: it also skips the metadata finalization, and flags the
// conversation so the next start's maintenance finishes it.
//
// The flag lives in `conversations.metadata` beside `extracted`,
// `extraction_status`, and `extraction_quarantined`: same table, same
// `json_extract` predicate, no migration. It is written and cleared through
// the two helpers here and nowhere else, read-modify-write on the blob, and
// cleared by deleting the key: the sibling predicates read `IS 1`/`IS NOT 1`,
// and a `false` left behind is noise every later reader has to think about.
//
// The maintenance step runs AFTER `extractPending`, so a conversation's stored
// summary is kept by `finalizeMetadataOnClose` ("summary already exists")
// rather than generated twice, and takes only conversations already extracted
// or ineligible for extraction: one still waiting on the extraction budget is
// left, flag intact, so finalization never precedes its extraction. It is
// bounded like its siblings (`RETITLE_LIMIT`, the extraction budget), FIFO by
// `ended_at`, and carries the rest over. Two runtimes started at once both run
// maintenance with no lock and can both pick the same conversation; that race
// is `extractPending`'s and `retitlePending`'s today, and is not solved here.

import { metadataDict } from "#conversation/closeTail.ts";
import type { WritableDatabase } from "#db/database.ts";
import { pythonJsonDumps } from "#util/pyGenerators.ts";

/**
 * Whether a runtime's SessionEnd hook has the time to run the LLM tail at exit,
 * by the label US8 stamps on the session row (`claude_code`, `codex`,
 * `grok_build`). Measured bounds, with the evidence:
 *
 *   claude_code  the plugin registers the hook `async`; Claude Code runs it in
 *                the background after exit, unbounded by the user's wait.
 *   codex        synchronous ("running async SessionEnd hook synchronously",
 *                DS12.TS2 L2), 1 s for a handler with no `timeout` (DS2's live
 *                `/hooks` table, 2026-10-13, Codex 0.162.1).
 *   grok_build   1.5 s for a handler with no `timeout` (DS12.TS4, Grok 1.0.52).
 *                DS10 re-measures it and may flip this entry.
 *
 * Any other label, and no label, keeps today's behavior: the tail runs.
 */
export function sessionEndRunsLlmTail(interfaceName: string | null | undefined): boolean {
  switch (interfaceName) {
    case "codex":
    case "grok_build":
      return false;
    default:
      return true;
  }
}

export const CLOSE_TAIL_PENDING_KEY = "close_tail_pending";

/** The sibling budgets: extraction 10 per run, retitle 5. Finalization is up to three calls. */
export const DEFERRED_CLOSE_TAIL_LIMIT = 5;

function readMetadata(
  db: WritableDatabase,
  conversationId: string,
): Record<string, unknown> | null {
  const row = db.prepare("SELECT metadata FROM conversations WHERE id = ?").get(conversationId);
  if (!row) return null;
  return metadataDict(typeof row.metadata === "string" ? row.metadata : null);
}

function writeMetadata(
  db: WritableDatabase,
  conversationId: string,
  metadata: Record<string, unknown>,
): void {
  db.prepare("UPDATE conversations SET metadata = ? WHERE id = ?").run(
    pythonJsonDumps(metadata),
    conversationId,
  );
}

/** Flag the conversation as owing its finalization. A missing conversation is left alone. */
export function markCloseTailPending(db: WritableDatabase, conversationId: string): void {
  const metadata = readMetadata(db, conversationId);
  if (metadata === null) return;
  metadata[CLOSE_TAIL_PENDING_KEY] = true;
  writeMetadata(db, conversationId, metadata);
}

/** Clear the flag by deleting the key, never by writing `false`. */
export function clearCloseTailPending(db: WritableDatabase, conversationId: string): void {
  const metadata = readMetadata(db, conversationId);
  if (metadata === null || !(CLOSE_TAIL_PENDING_KEY in metadata)) return;
  delete metadata[CLOSE_TAIL_PENDING_KEY];
  writeMetadata(db, conversationId, metadata);
}

export function isCloseTailPending(db: WritableDatabase, conversationId: string): boolean {
  return readMetadata(db, conversationId)?.[CLOSE_TAIL_PENDING_KEY] === true;
}

const PENDING_WHERE = `
  WHERE c.ended_at IS NOT NULL
    AND json_extract(c.metadata, '$.${CLOSE_TAIL_PENDING_KEY}') IS 1
`;

/**
 * Already extracted, or not eligible for extraction (the orchestration's own
 * gate: a journey and four messages), so finalization follows extraction and
 * never precedes it.
 */
const READY_WHERE = `
    AND (json_extract(c.metadata, '$.extracted') IS 1
         OR c.journey IS NULL
         OR (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) < 4)
`;

export interface DeferredCloseTail {
  id: string;
  endedAt: string;
}

/** Flagged conversations ready to finalize, oldest-ended first, bounded. */
export function selectDeferredCloseTails(
  db: WritableDatabase,
  limit: number | null,
): DeferredCloseTail[] {
  const base = `SELECT c.id, c.ended_at FROM conversations c${PENDING_WHERE}${READY_WHERE}ORDER BY c.ended_at ASC`;
  const rows = limit === null ? db.prepare(base).all() : db.prepare(`${base} LIMIT ?`).all(limit);
  return rows.map((row) => ({ id: String(row.id), endedAt: String(row.ended_at) }));
}

/** Every flagged conversation, ready or not, and the oldest: what `runtime diagnose` reads. */
export function countDeferredCloseTails(db: WritableDatabase): {
  count: number;
  oldestEndedAt: string | null;
} {
  const row = db
    .prepare(`SELECT COUNT(*) AS n, MIN(c.ended_at) AS oldest FROM conversations c${PENDING_WHERE}`)
    .get();
  const count = Number(row?.n ?? 0);
  return { count, oldestEndedAt: count > 0 && row?.oldest ? String(row.oldest) : null };
}

export interface FinishDeferredCloseTailsDeps {
  /** The close-time finalization (title, summary, tags). Throwing is isolated. */
  finalizeCloseTail: (db: WritableDatabase, conversationId: string) => Promise<void> | void;
  limit?: number;
}

/**
 * The maintenance step: finalize each ready, flagged conversation and clear
 * its flag. A finalization that throws leaves its flag for the next run and
 * does not stop the loop. Returns how many were finished.
 */
export async function finishDeferredCloseTails(
  db: WritableDatabase,
  deps: FinishDeferredCloseTailsDeps,
): Promise<number> {
  const limit = deps.limit ?? DEFERRED_CLOSE_TAIL_LIMIT;
  let count = 0;
  for (const tail of selectDeferredCloseTails(db, limit)) {
    try {
      await deps.finalizeCloseTail(db, tail.id);
    } catch {
      continue;
    }
    clearCloseTailPending(db, tail.id);
    count += 1;
  }
  return count;
}
