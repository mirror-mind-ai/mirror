import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { getLlmCallSummary, logLlmCall } from "../../src/observability/llmCalls.ts";

const TMP_DIR = join(process.cwd(), "tmp", "test-llm-calls");
const IDENTITY_BEARING_PROMPT = JSON.stringify([
  { role: "system", content: "=== self/soul ===\nSECRET IDENTITY CONTEXT, never leak this" },
  { role: "user", content: "what should I do?" },
]);

function rows(db: WritableDatabase): Record<string, unknown>[] {
  return db.prepare("SELECT * FROM llm_calls ORDER BY called_at").all() as Record<
    string,
    unknown
  >[];
}

test("logLlmCall withholds prompt/response bodies by default (metadata mode) -- security-critical (AI-09)", async () => {
  const { db, path } = await makeDb("withhold-default.db");
  try {
    logLlmCall(db, {
      role: "consult",
      model: "x-ai/grok-test",
      prompt: IDENTITY_BEARING_PROMPT,
      response: "the reply, which could also leak context back",
      promptTokens: 1200,
      completionTokens: 300,
      costUsd: 0.0123,
    });

    const [row] = rows(db);
    assert.equal(row?.prompt, "");
    assert.equal(row?.response, "");
    // Not just an empty fixture -- prove the actual identity-bearing text never
    // reached the row, even truncated/partial.
    assert.ok(!String(row?.prompt ?? "").includes("SECRET IDENTITY CONTEXT"));
    assert.equal(row?.role, "consult");
    assert.equal(row?.model, "x-ai/grok-test");
    assert.equal(row?.cost_usd, 0.0123);
    assert.equal(row?.prompt_tokens, 1200);
    assert.equal(row?.completion_tokens, 300);
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("logLlmCall persists bodies only under an explicit full-mode opt-in, never by default (AI-09)", async () => {
  const { db, path } = await makeDb("withhold-full-optin.db");
  try {
    logLlmCall(
      db,
      { role: "consult", model: "x-ai/grok-test", prompt: IDENTITY_BEARING_PROMPT, response: "r" },
      { mode: "full" },
    );

    const [row] = rows(db);
    assert.equal(row?.prompt, IDENTITY_BEARING_PROMPT);
    assert.equal(row?.response, "r");
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("logLlmCall writes nothing when the mode is off", async () => {
  const { db, path } = await makeDb("off-mode.db");
  try {
    logLlmCall(
      db,
      { role: "consult", model: "x-ai/grok-test", prompt: "p", response: "r" },
      { mode: "off" },
    );
    assert.equal(rows(db).length, 0);
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("logLlmCall is fail-soft: a write failure never throws out of the caller (AI-09)", async () => {
  const { db, path } = await makeDb("fail-soft.db");
  try {
    db.exec("DROP TABLE llm_calls"); // force the INSERT to fail
    assert.doesNotThrow(() => {
      logLlmCall(db, { role: "consult", model: "m", prompt: "p", response: "r" });
    });
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("getLlmCallSummary aggregates by role and by week, skipping NULL cost from the sum, not summing as zero (AI-09)", async () => {
  const { db, path } = await makeDb("summary.db");
  try {
    logLlmCall(db, {
      role: "consult",
      model: "m",
      prompt: "p",
      response: "r",
      promptTokens: 100,
      completionTokens: 50,
      costUsd: 0.01,
    });
    logLlmCall(db, {
      role: "consult",
      model: "m",
      prompt: "p",
      response: "r",
      promptTokens: 200,
      completionTokens: 0,
      costUsd: null, // unpriced -- must not be counted as $0
    });

    const summary = getLlmCallSummary(db);

    assert.equal(summary.total.calls, 2);
    assert.equal(summary.total.promptTokens, 300);
    assert.equal(summary.total.costUsd, 0.01); // sum skips the NULL, not 0.01 averaged/zeroed
    assert.equal(summary.total.unpriced, 1);
    assert.equal(summary.byRole.length, 1);
    assert.equal(summary.byRole[0]?.bucket, "consult");
    assert.equal(summary.byRole[0]?.calls, 2);
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

async function makeDb(name: string): Promise<{ db: WritableDatabase; path: string }> {
  await mkdir(TMP_DIR, { recursive: true });
  const path = join(TMP_DIR, name);
  await rm(path, { force: true });
  const db = openDatabaseCopyForWrite(path);
  db.exec(`
    CREATE TABLE llm_calls (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      response TEXT NOT NULL,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      latency_ms INTEGER,
      cost_usd REAL,
      conversation_id TEXT,
      session_id TEXT,
      called_at TEXT NOT NULL
    );
  `);
  return { db, path };
}
