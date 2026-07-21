import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { ConsultArgError, parseConsultArgs } from "../../src/consult/args.ts";
import { buildConsultLlmRequest, runConsult, SYSTEM_PREAMBLE } from "../../src/consult/core.ts";
import { resolveConsultModel } from "../../src/consult/modelCatalog.ts";
import { renderConsultAsk, renderCost, renderCredits } from "../../src/consult/render.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { ReplayCreditProvider } from "../../src/providers/credits.ts";
import { ReplayLlmProvider } from "../../src/providers/llm.ts";

const TMP_DIR = join(process.cwd(), "tmp", "test-consult");

async function makeDb(name: string): Promise<{ db: WritableDatabase; path: string }> {
  await mkdir(TMP_DIR, { recursive: true });
  const path = join(TMP_DIR, name);
  await rm(path, { force: true });
  const db = openDatabaseCopyForWrite(path);
  db.exec(`
    CREATE TABLE llm_calls (
      id TEXT PRIMARY KEY, role TEXT NOT NULL, model TEXT NOT NULL,
      prompt TEXT NOT NULL, response TEXT NOT NULL,
      prompt_tokens INTEGER, completion_tokens INTEGER, latency_ms INTEGER,
      cost_usd REAL, conversation_id TEXT, session_id TEXT, called_at TEXT NOT NULL
    );
  `);
  return { db, path };
}

test("resolveConsultModel mirrors Python family/tier semantics", () => {
  assert.equal(resolveConsultModel("anthropic/claude-3"), "anthropic/claude-3");
  assert.equal(resolveConsultModel("gemini", "lite"), "google/gemini-2.5-flash-lite");
  assert.equal(resolveConsultModel("claude", "flagship"), "anthropic/claude-opus-4.6");
  assert.throws(
    () => resolveConsultModel("missing"),
    /Family 'missing' not found. Available: claude, deepseek, gemini, grok, llama, openai/,
  );
  assert.throws(
    () => resolveConsultModel("gemini", "tiny"),
    /Tier 'tiny' does not exist for 'gemini'. Use: lite, mid, flagship/,
  );
});

test("parseConsultArgs handles credits, ask defaults, tiers, and flags", () => {
  assert.deepEqual(parseConsultArgs(["credits"]), { command: "credits" });
  assert.deepEqual(parseConsultArgs(["gemini", "what now?"]), {
    command: "ask",
    modelId: "google/gemini-2.5-flash-lite",
    prompt: "what now?",
    persona: null,
    journey: null,
    org: false,
    query: null,
    mirrorHome: null,
  });
  assert.deepEqual(
    parseConsultArgs([
      "claude",
      "mid",
      "what",
      "now",
      "--persona",
      "engineer",
      "--journey",
      "cv22",
      "--org",
      "--query",
      "roadmap",
      "--mirror-home",
      "/tmp/mirror",
    ]),
    {
      command: "ask",
      modelId: "anthropic/claude-sonnet-4.6",
      prompt: "what now",
      persona: "engineer",
      journey: "cv22",
      org: true,
      query: "roadmap",
      mirrorHome: "/tmp/mirror",
    },
  );
});

test("parseConsultArgs reports Python-compatible missing argument errors", () => {
  assert.throws(() => parseConsultArgs([]), ConsultArgError);
  assert.throws(() => parseConsultArgs(["gemini"]), /Error: question is required./);
  assert.throws(() => parseConsultArgs(["gemini", "lite"]), /Error: question is required./);
});

test("renderCredits and renderCost match Python formatting", () => {
  assert.equal(
    renderCredits({ totalCredits: 10, totalUsage: 4, balance: 6 }),
    "Balance: openrouter: ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░ R$ 34.20",
  );
  assert.equal(
    renderCredits({ totalCredits: 0, totalUsage: 0, balance: 0 }),
    "Balance: openrouter: ░░░░░░░░░░░░░░░░░░░░ R$ 0.00",
  );
  assert.equal(renderCost(0.001234), "Call cost: $0.001234 (R$ 0.0070)");
  assert.equal(renderCost(0.1234), "Call cost: $0.1234 (R$ 0.70)");
});

test("renderConsultAsk preserves response fences, tokens, cost, and credits", () => {
  assert.equal(
    renderConsultAsk(
      "model/a",
      { model: "model/a", content: "answer", promptTokens: 10, completionTokens: 20 },
      { totalCredits: 10, totalUsage: 5, balance: 5 },
      0.02,
    ),
    [
      "Consulting model/a...",
      "--- response via model/a ---",
      "answer",
      "--- end ---",
      "[prompt: 10, completion: 20]",
      "Call cost: $0.0200 (R$ 0.11)",
      "Balance: openrouter: ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░ R$ 28.50",
    ].join("\n"),
  );
});

test("buildConsultLlmRequest injects system preamble and user prompt", () => {
  const request = buildConsultLlmRequest("model/a", "question", "=== ego ===\ncontext");
  assert.equal(request.role, "consult");
  assert.equal(request.model, "model/a");
  const messages = JSON.parse(request.prompt) as Array<{ role: string; content: string }>;
  assert.deepEqual(messages, [
    { role: "system", content: `${SYSTEM_PREAMBLE}=== ego ===\ncontext` },
    { role: "user", content: "question" },
  ]);
});

test("runConsult uses replayed LLM, cost, credits, and context seams", async () => {
  const llm = new ReplayLlmProvider({
    kind: "llm",
    responses: {
      consult: {
        model: "google/gemini-2.5-flash-lite",
        content: "synthetic answer",
        generationId: "gen-1",
        promptTokens: 7,
      },
    },
  });
  const credits = new ReplayCreditProvider({
    kind: "credits",
    credits: { totalCredits: 10, totalUsage: 8, balance: 2 },
    generationCosts: { "gen-1": 0.001 },
  });

  const output = await runConsult(parseConsultArgs(["gemini", "hello", "--persona", "engineer"]), {
    llm,
    credits,
    loadContext: (request) => {
      assert.equal(request.persona, "engineer");
      return "context";
    },
  });

  assert.match(output, /Consulting google\/gemini-2.5-flash-lite/);
  assert.match(output, /synthetic answer/);
  assert.match(output, /\[prompt: 7\]/);
  assert.match(output, /Call cost: \$0.001000 \(R\$ 0.0057\)/);
  assert.equal(llm.calls[0]?.model, "google/gemini-2.5-flash-lite");
});

test("runConsult logs consult's real fetched cost to the ledger when a db is provided (AI-09)", async () => {
  const { db, path } = await makeDb("logs-cost.db");
  try {
    const llm = new ReplayLlmProvider({
      kind: "llm",
      responses: {
        consult: {
          model: "x-ai/grok-test",
          content: "synthetic answer",
          generationId: "gen-1",
          promptTokens: 7,
          completionTokens: 3,
        },
      },
    });
    const credits = new ReplayCreditProvider({
      kind: "credits",
      credits: { totalCredits: 10, totalUsage: 8, balance: 2 },
      generationCosts: { "gen-1": 0.0123 },
    });

    await runConsult(parseConsultArgs(["gemini", "hello"]), {
      llm,
      credits,
      loadContext: () => "context",
      db,
    });

    const rows = db.prepare("SELECT * FROM llm_calls").all() as Record<string, unknown>[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.role, "consult");
    assert.equal(rows[0]?.model, "x-ai/grok-test");
    assert.equal(rows[0]?.cost_usd, 0.0123); // the real fetched cost, not a static estimate
    assert.equal(rows[0]?.prompt_tokens, 7);
    assert.equal(rows[0]?.completion_tokens, 3);
    // Default metadata mode: bodies withheld even though a db was provided.
    assert.equal(rows[0]?.prompt, "");
    assert.equal(rows[0]?.response, "");
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("runConsult does not log when no db is provided (existing callers unaffected, AI-09)", async () => {
  const llm = new ReplayLlmProvider({
    kind: "llm",
    responses: { consult: { model: "m", content: "a", generationId: "gen-1" } },
  });
  const credits = new ReplayCreditProvider({
    kind: "credits",
    credits: { totalCredits: 1, totalUsage: 0, balance: 1 },
    generationCosts: { "gen-1": 0.01 },
  });

  // No db in options -- must behave exactly as before, no throw, no logging attempt.
  const output = await runConsult(parseConsultArgs(["gemini", "hi"]), {
    llm,
    credits,
    loadContext: () => "",
  });
  assert.match(output, /synthetic|a/);
});

test("runConsult credits does not write to the ledger (Python does not log credits either, AI-09)", async () => {
  const { db, path } = await makeDb("credits-no-log.db");
  try {
    const credits = new ReplayCreditProvider({
      kind: "credits",
      credits: { totalCredits: 10, totalUsage: 4, balance: 6 },
    });

    await runConsult(parseConsultArgs(["credits"]), {
      llm: new ReplayLlmProvider({ kind: "llm", responses: {} }),
      credits,
      loadContext: () => "",
      db,
    });

    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM llm_calls").get()?.n, 0);
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});
