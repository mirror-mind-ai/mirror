import type { WritableDatabase } from "#db/database.ts";

/** Python's `llm_calls` DDL, column for column, for tests that assert the ledger. */
export function createLlmCallsTable(db: WritableDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS llm_calls (
      id TEXT PRIMARY KEY, role TEXT NOT NULL, model TEXT NOT NULL,
      prompt TEXT NOT NULL, response TEXT NOT NULL,
      prompt_tokens INTEGER, completion_tokens INTEGER, latency_ms INTEGER,
      cost_usd REAL, conversation_id TEXT, session_id TEXT, called_at TEXT NOT NULL
    );
  `);
}

export interface LedgerRow {
  role: string;
  model: string;
  prompt: string;
  response: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number | null;
  conversation_id: string | null;
  session_id: string | null;
}

/** Every row in insertion order — the order every cross-engine comparison uses. */
export function ledgerRows(db: WritableDatabase): LedgerRow[] {
  return db
    .prepare(
      `SELECT role, model, prompt, response, prompt_tokens, completion_tokens,
              cost_usd, conversation_id, session_id
       FROM llm_calls ORDER BY rowid`,
    )
    .all() as unknown as LedgerRow[];
}
