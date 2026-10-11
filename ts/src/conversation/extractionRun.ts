// Extraction failure accounting (CV22.DS7.US10 slice F).
//
// Ports `ConversationService._run_extraction` -- the wrapper around the DS5
// orchestration that Python's `extract_conversation` and `end_conversation`
// both go through -- and `_record_failed_extraction_attempt` (CV9.E2.S7).
//
// The orchestration itself (`runConversationExtraction`) is DS5's; what it
// lacked was the accounting Python keeps OUTSIDE it: every failed attempt
// increments `extraction_attempts`, stamps `extraction_status=llm_failed`,
// and quarantines the conversation at `EXTRACTION_MAX_ATTEMPTS` so a
// poison-pill transcript stops being retried at every session start. Without
// this wrapper a conversation whose extraction failed under TypeScript would
// be retried forever and the maintenance report's quarantine tail would never
// appear -- a divergence `session-maintenance` parity cannot tolerate.
//
// The metadata key ORDER is part of the stored bytes: Python appends
// `extraction_attempts` before `extraction_status` when neither exists yet, so
// the write happens here, once, rather than partly inside the orchestration.

import { metadataDict } from "#conversation/closeTail.ts";
import type { WritableDatabase } from "#db/database.ts";
import { pythonJsonDumps } from "#util/pyGenerators.ts";

/** Python's `MEMORY_EXTRACTION_MAX_ATTEMPTS` default. */
export const DEFAULT_EXTRACTION_MAX_ATTEMPTS = 3;

/**
 * Python `_record_failed_extraction_attempt`: bump the counter in the
 * conversation's metadata JSON, mark the failure, quarantine at the max.
 * Returns the new attempt count (0 when the conversation does not exist).
 */
export function recordFailedExtractionAttempt(
  db: WritableDatabase,
  conversationId: string,
  maxAttempts: number = DEFAULT_EXTRACTION_MAX_ATTEMPTS,
): number {
  const row = db.prepare("SELECT metadata FROM conversations WHERE id = ?").get(conversationId);
  if (!row) return 0;
  const metadata = metadataDict(typeof row.metadata === "string" ? row.metadata : null);
  // Python: `int(meta.get("extraction_attempts", 0)) + 1`.
  const attempts = Math.trunc(Number(metadata.extraction_attempts ?? 0)) + 1;
  metadata.extraction_attempts = attempts;
  metadata.extraction_status = "llm_failed";
  if (attempts >= maxAttempts) metadata.extraction_quarantined = true;
  db.prepare("UPDATE conversations SET metadata = ? WHERE id = ?").run(
    pythonJsonDumps(metadata),
    conversationId,
  );
  return attempts;
}

/**
 * Python `_run_extraction`: run the orchestration; on ANY failure record the
 * attempt and re-raise, so the caller's per-conversation loop can isolate it.
 * The eligibility gate (journey, four messages) lives in the orchestration and
 * returns before touching the row, exactly as Python's does.
 */
export async function runExtractionWithAccounting(
  db: WritableDatabase,
  conversationId: string,
  run: (db: WritableDatabase, conversationId: string) => Promise<unknown> | unknown,
  maxAttempts: number = DEFAULT_EXTRACTION_MAX_ATTEMPTS,
): Promise<void> {
  try {
    await run(db, conversationId);
  } catch (error) {
    recordFailedExtractionAttempt(db, conversationId, maxAttempts);
    throw error;
  }
}
