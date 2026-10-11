// CV22.DS9.TS2 plateau 1 — the narrow ledger connection.
//
// The MCP server holds a driver-level read-only handle for its tools (US2's
// decision (d)) and needs exactly one write: the `llm_calls` row Python records
// for an agent-initiated search. `openDatabaseForLedgerAppend` is that seam.
//
// Unlike `openDatabaseForWrite` it takes no BackupRecord, and the reason is a
// decision, not an omission: the DS4 gate is a last-write undo for a
// snapshot-write-exit CLI, and this process lives for a whole client session, so
// a snapshot taken at launch is not the state before a row written later. What
// replaces the gate is the narrowing proven here — a handle that can form no
// statement but the ledger insert. These tests are that guarantee.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, openDatabaseForLedgerAppend } from "#db/database.ts";
import { createSchema } from "#db/schema.ts";

function liveDatabase(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-ledger-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  // Seed through the copy-legal opener, then rename to the live basename so the
  // test proves the ledger seam accepts what the copy guard refuses.
  const seedPath = join(tmpDir, "seed.db");
  const seeded = openDatabaseCopyForWrite(seedPath);
  createSchema(seeded);
  seeded.close();
  const livePath = join(tmpDir, "memory.db");
  renameSync(seedPath, livePath);
  return { path: livePath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const LEDGER_INSERT = `INSERT INTO llm_calls (
        id, role, model, prompt, response,
        prompt_tokens, completion_tokens, latency_ms, cost_usd,
        conversation_id, session_id, called_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

test("the ledger handle appends an llm_calls row to a live database, ungated", () => {
  const live = liveDatabase();
  try {
    const db = openDatabaseForLedgerAppend(live.path);
    db.prepare(LEDGER_INSERT).run(
      "call-1",
      "embedding",
      "openai/text-embedding-3-small",
      "",
      "",
      12,
      null,
      42,
      0.00001,
      null,
      null,
      "2026-01-01T00:00:00Z",
    );
    const row = db.prepare("SELECT role, prompt FROM llm_calls").get();
    assert.equal(row?.role, "embedding");
    assert.equal(row?.prompt, "");
    db.close();
  } finally {
    live.cleanup();
  }
});

test("the ledger handle refuses every statement that is not the ledger insert", () => {
  const live = liveDatabase();
  try {
    const db = openDatabaseForLedgerAppend(live.path);
    // Each of these is a write the MCP server must never be able to form. BEGIN
    // is in the list because transaction control is itself a write capability:
    // a holder that can open a transaction can hold a lock the rest of the
    // system waits on, and the database-architect lens asked for it explicitly.
    for (const sql of [
      "DELETE FROM llm_calls",
      "UPDATE llm_calls SET role = 'x'",
      "INSERT INTO memories (id) VALUES ('x')",
      "DROP TABLE llm_calls",
      "BEGIN IMMEDIATE",
      "INSERT INTO llm_calls (id) VALUES ('x'); DELETE FROM memories",
    ]) {
      assert.throws(
        () => db.prepare(sql),
        /only the llm_calls append/i,
        `expected refusal for: ${sql}`,
      );
    }
    db.close();
  } finally {
    live.cleanup();
  }
});

test("the ledger handle exposes no exec, so no DDL or multi-statement path exists", () => {
  const live = liveDatabase();
  try {
    const db = openDatabaseForLedgerAppend(live.path);
    assert.equal(
      (db as unknown as { exec?: unknown }).exec,
      undefined,
      "an exec on this handle would reopen every statement the allowlist refuses",
    );
    db.close();
  } finally {
    live.cleanup();
  }
});

test("reads are allowed, so the ledger row can be verified by its writer", () => {
  const live = liveDatabase();
  try {
    const db = openDatabaseForLedgerAppend(live.path);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM llm_calls").get()?.c, 0);
    db.close();
  } finally {
    live.cleanup();
  }
});
