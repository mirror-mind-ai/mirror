// CV22.DS9.TS1 plateau 2 — the spend decision and what the ledger tells it.
//
// The decision is pure, so the policy is graded against synthetic states with no database
// and no clock. The adapter is graded against a seeded ledger, and the case that matters
// most there is the one that is NOT counted: extraction's embedding rows, written by the
// user's own session close, must never push the agent over its limit.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createSchema } from "#db/schema.ts";
import {
  DEFAULT_SPEND_POLICY,
  decideSpend,
  MCP_LEDGER_SESSION,
  policyFromEnv,
  readSpendState,
  type SpendPolicy,
} from "#mcp/guards.ts";

const POLICY: SpendPolicy = { rateLimit: 30, windowMinutes: 10, dailyUsdCeiling: null };

// --- the pure decision --------------------------------------------------------------

test("a call under the limit is allowed", () => {
  assert.deepEqual(decideSpend("search_memories", { callsInWindow: 29, usdLast24h: 0 }, POLICY), {
    allow: true,
  });
});

test("the call AT the limit is refused — the limit is a ceiling, not a target", () => {
  // 30 calls already made means the 31st is this one. An off-by-one here is the difference
  // between a guard that bounds and a guard that bounds plus one.
  const decision = decideSpend("search_memories", { callsInWindow: 30, usdLast24h: 0 }, POLICY);
  assert.equal(decision.allow, false);
  assert.equal(decision.allow === false && decision.reason, "rate_limit");
});

test("the rate refusal names the bound, the alternative, the human, and forbids retry", () => {
  const decision = decideSpend("search_memories", { callsInWindow: 30, usdLast24h: 0 }, POLICY);
  assert.equal(decision.allow, false);
  if (decision.allow) return;
  assert.match(decision.text, /rate-limited \(30 calls in 10 minutes\)/);
  assert.match(decision.text, /filter/, "an agent needs somewhere to go, not just a wall");
  assert.match(decision.text, /MIRROR_MCP_EMBED_RATE_LIMIT/, "name the human's lever");
  assert.match(decision.text, /Do not retry this tool\.$/, "the instruction goes last");
  // The failure this wording exists to prevent: an agent told when to come back plans to
  // come back, and the retry is the loop the guard is for.
  assert.doesNotMatch(decision.text, /try again|later|wait|minutes? from now|until/i);
});

test("no ceiling by default, however much has been spent", () => {
  assert.deepEqual(decideSpend("mirror_context", { callsInWindow: 0, usdLast24h: 999 }, POLICY), {
    allow: true,
  });
  assert.equal(DEFAULT_SPEND_POLICY.dailyUsdCeiling, null);
});

test("a set ceiling refuses at or above itself, and outranks the rate reason", () => {
  const policy: SpendPolicy = { ...POLICY, dailyUsdCeiling: 0.01 };
  const at = decideSpend("search_memories", { callsInWindow: 0, usdLast24h: 0.01 }, policy);
  assert.equal(at.allow === false && at.reason, "daily_ceiling");
  const under = decideSpend("search_memories", { callsInWindow: 0, usdLast24h: 0.0099 }, policy);
  assert.equal(under.allow, true);
  // Both bounds breached: the money is the more important fact to report.
  const both = decideSpend("search_memories", { callsInWindow: 99, usdLast24h: 1 }, policy);
  assert.equal(both.allow === false && both.reason, "daily_ceiling");
});

test("the ceiling refusal is terminal for the day and points at the user", () => {
  const policy: SpendPolicy = { ...POLICY, dailyUsdCeiling: 0.01 };
  const decision = decideSpend("search_memories", { callsInWindow: 0, usdLast24h: 0.02 }, policy);
  assert.equal(decision.allow, false);
  if (decision.allow) return;
  assert.match(decision.text, /Ask the user/);
  assert.match(decision.text, /Do not retry this tool\.$/);
  // Never quote the spend back: it is the user's figure, and the text lands in agent
  // context and in the client's log.
  assert.doesNotMatch(decision.text, /0\.0/);
});

// --- the tunables -------------------------------------------------------------------

test("policyFromEnv defaults, parses, and fails loudly on nonsense", () => {
  assert.deepEqual(policyFromEnv({}), DEFAULT_SPEND_POLICY);
  assert.deepEqual(
    policyFromEnv({
      MIRROR_MCP_EMBED_RATE_LIMIT: "5",
      MIRROR_MCP_EMBED_RATE_WINDOW_MINUTES: "2",
      MIRROR_MCP_DAILY_USD_CEILING: "0.25",
    }),
    { rateLimit: 5, windowMinutes: 2, dailyUsdCeiling: 0.25 },
  );
  // A typo in .env must take the surface down with a named reason in the client's log,
  // not silently leave it unguarded while the user believes otherwise (the DS8 rule).
  for (const bad of [
    { MIRROR_MCP_EMBED_RATE_LIMIT: "thirty" },
    { MIRROR_MCP_DAILY_USD_CEILING: "" },
    { MIRROR_MCP_EMBED_RATE_WINDOW_MINUTES: "0" },
  ]) {
    assert.throws(
      () => policyFromEnv(bad),
      /MIRROR_MCP_/,
      `expected a loud failure for ${JSON.stringify(bad)}`,
    );
  }
});

// --- the ledger adapter -------------------------------------------------------------

function ledgerDatabase(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-guard-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp, { recursive: true });
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createSchema(db);
  return {
    db,
    cleanup: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function insertCall(
  db: WritableDatabase,
  {
    id,
    session,
    minutesAgo,
    cost,
  }: { id: string; session: string | null; minutesAgo: number; cost: number | null },
): void {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString().replace("Z", "000Z");
  db.prepare(
    "INSERT INTO llm_calls (id, role, model, prompt, response, cost_usd, session_id, called_at) " +
      "VALUES (?, 'embedding', 'openai/text-embedding-3-small', '', '', ?, ?, ?)",
  ).run(id, cost, session, at);
}

test("only this surface's calls inside the window are counted", () => {
  const fixture = ledgerDatabase();
  try {
    insertCall(fixture.db, { id: "a", session: MCP_LEDGER_SESSION, minutesAgo: 1, cost: 0.000002 });
    insertCall(fixture.db, { id: "b", session: MCP_LEDGER_SESSION, minutesAgo: 9, cost: 0.000002 });
    // Outside the window.
    insertCall(fixture.db, {
      id: "c",
      session: MCP_LEDGER_SESSION,
      minutesAgo: 30,
      cost: 0.000002,
    });
    // Extraction at a session close: the row that must never refuse the agent.
    insertCall(fixture.db, { id: "d", session: null, minutesAgo: 1, cost: 0.000002 });

    const state = readSpendState(fixture.db, POLICY);
    assert.equal(state.callsInWindow, 2, "two attributed rows inside ten minutes");
  } finally {
    fixture.cleanup();
  }
});

test("the daily sum covers 24h, counts unpriced rows as zero, and excludes other callers", () => {
  const fixture = ledgerDatabase();
  try {
    insertCall(fixture.db, { id: "a", session: MCP_LEDGER_SESSION, minutesAgo: 60, cost: 0.01 });
    insertCall(fixture.db, { id: "b", session: MCP_LEDGER_SESSION, minutesAgo: 600, cost: 0.02 });
    // A failed attempt: money may have been spent, but nothing came back to price it.
    insertCall(fixture.db, { id: "c", session: MCP_LEDGER_SESSION, minutesAgo: 10, cost: null });
    // Older than a day, and someone else's.
    insertCall(fixture.db, { id: "d", session: MCP_LEDGER_SESSION, minutesAgo: 60 * 25, cost: 5 });
    insertCall(fixture.db, { id: "e", session: null, minutesAgo: 5, cost: 7 });

    const state = readSpendState(fixture.db, POLICY);
    assert.ok(Math.abs(state.usdLast24h - 0.03) < 1e-9, `expected 0.03, got ${state.usdLast24h}`);
  } finally {
    fixture.cleanup();
  }
});

test("an empty ledger allows the first call", () => {
  const fixture = ledgerDatabase();
  try {
    const state = readSpendState(fixture.db, POLICY);
    assert.deepEqual(state, { callsInWindow: 0, usdLast24h: 0 });
    assert.deepEqual(decideSpend("search_memories", state, POLICY), { allow: true });
  } finally {
    fixture.cleanup();
  }
});
