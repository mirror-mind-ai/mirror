// TS reinforcement writes — the port of the Python core's log_access / log_use.
//
// log_access records a retrieval: it appends a memory_access_log row and caches
// last_accessed_at on the memory. log_use records the stronger "actually drawn on
// in a response" signal by incrementing use_count. Both mirror
// src/memory/storage/memories.py exactly. The timestamp is injected (`nowIso`) so
// a parity run can freeze the clock and match the Python oracle byte-for-byte;
// the two statements in log_access share the one `nowIso`, as in Python.

import { type WritableDatabase, withTransaction } from "../db/database.ts";

/**
 * Record a retrieval: append to memory_access_log and cache last_accessed_at.
 * The two statements commit as one transaction, matching Python's single
 * `conn.commit()` — a failure between them must never leave the access row
 * without the cached timestamp (or vice versa).
 */
export function logAccess(
  db: WritableDatabase,
  memoryId: string,
  nowIso: string,
  context: string | null,
): void {
  withTransaction(db, () => {
    db.prepare(
      "INSERT INTO memory_access_log (memory_id, accessed_at, access_context) VALUES (?, ?, ?)",
    ).run(memoryId, nowIso, context);
    db.prepare("UPDATE memories SET last_accessed_at = ? WHERE id = ?").run(nowIso, memoryId);
  });
}

/** Record a use: increment use_count (the stronger reinforcement signal). */
export function logUse(db: WritableDatabase, memoryId: string): void {
  db.prepare("UPDATE memories SET use_count = use_count + 1 WHERE id = ?").run(memoryId);
}
