// CV22.DS7.US10 slice F — the conversation-logger composition root.
//
// The runtime is where the plan's live-cutover boundary is enforced on the
// TypeScript side: the LLM tail exists only when BOTH replay fixtures are
// configured, the providers are loaded lazily and once, and the subcommands
// that never cross the tail never cause a load at all.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { runConversationLoggerCommand } from "#conversation/loggerCli.ts";
import {
  createLoggerRuntime,
  LlmTailUnconfiguredError,
  type LoggerRuntimeEnv,
  ReplayFixtureIncompleteError,
} from "#conversation/loggerRuntime.ts";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import {
  resolveExtractionMaxAttempts,
  resolveMaintenanceMaxExtractions,
  resolveSummarizeEnabled,
  resolveTwoPassEnabled,
} from "#providers/config.ts";
import { EMBEDDING_DIMENSIONS } from "#providers/embedding.ts";
import type { LlmProvider } from "#providers/llm.ts";

const deps = { newId: () => "id", nowIso: () => "2026-09-02T12:00:00.000000Z" };

function fixture(env: LoggerRuntimeEnv = {}) {
  const home = mkdtempSync("/tmp/logger-runtime-");
  const db = bootstrapDatabase(join(home, "memory.db"));
  const loads = { llm: 0, embeddings: 0 };
  const llm: LlmProvider = { complete: async () => ({ content: "[]" }) };
  const runtime = createLoggerRuntime({
    db,
    mirrorHome: home,
    homeDir: home,
    env,
    deps,
    loadLlm: async () => {
      loads.llm += 1;
      return llm;
    },
    loadEmbeddings: async () => {
      loads.embeddings += 1;
      return {
        embed: async () => ({
          vector: Array<number>(EMBEDDING_DIMENSIONS).fill(0),
          promptTokens: null,
        }),
      };
    },
  });
  return { db, home, runtime, loads };
}

const CONFIGURED = {
  MIRROR_TS_CONVERSATION_LLM_REPLAY: "/replay/llm.json",
  MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY: "/replay/embedding.json",
};

test("with nothing configured the close tail is LIVE (CV22.DS8.US2 cutover)", async () => {
  // Before US2 an empty environment meant "unconfigured" and fell back to
  // Python. That is now the cutover: an ordinary install reaches the provider
  // through TypeScript, and the replay loaders are never touched.
  const { runtime, loads, db } = fixture({});

  assert.equal(runtime.transportMode, "live");
  assert.equal(runtime.llmTailConfigured, true);
  await runtime.closeHooks();
  assert.deepEqual(loads, { llm: 0, embeddings: 0 }, "no replay fixture is loaded in live mode");
  db.close();
});

test("MIRROR_TS_CONVERSATION_LLM_TAIL=0 reverts the tail to Python", async () => {
  const { runtime, loads, db } = fixture({ MIRROR_TS_CONVERSATION_LLM_TAIL: "0" });

  assert.equal(runtime.transportMode, "python");
  assert.equal(runtime.llmTailConfigured, false);
  // LlmTailUnconfiguredError is what loggerCli turns into the Python fallback,
  // so the revert keeps using the mechanism that already existed.
  await assert.rejects(runtime.closeHooks(), LlmTailUnconfiguredError);
  await assert.rejects(runtime.maintenanceDeps(), LlmTailUnconfiguredError);
  assert.deepEqual(loads, { llm: 0, embeddings: 0 });
  db.close();
});

test("the revert wins over replay fixtures left in the same shell", async () => {
  const { runtime, db } = fixture({ ...CONFIGURED, MIRROR_TS_CONVERSATION_LLM_TAIL: "0" });

  assert.equal(runtime.transportMode, "python");
  db.close();
});

test("half a replay fixture REFUSES by name instead of going live", async () => {
  // The dangerous shape: a developer sets one variable, expects a replayed
  // close tail, and gets a live one. Falling back to Python would be no safer
  // -- Python has no replay transport, so it would spend too, just on the
  // other engine. The only safe answer is to stop and name the missing half.
  for (const [present, missing] of [
    ["MIRROR_TS_CONVERSATION_LLM_REPLAY", "MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY"],
    ["MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY", "MIRROR_TS_CONVERSATION_LLM_REPLAY"],
  ]) {
    const { runtime, loads, db } = fixture({ [present as string]: "/replay/one.json" });

    const error = await runtime.closeHooks().catch((e: unknown) => e);
    assert.ok(error instanceof ReplayFixtureIncompleteError, `${present} alone must refuse`);
    assert.match((error as Error).message, new RegExp(missing as string));
    assert.ok(
      !(error instanceof LlmTailUnconfiguredError),
      "a refusal must not be mistaken for the Python fallback",
    );
    assert.deepEqual(loads, { llm: 0, embeddings: 0 });
    db.close();
  }
});

test("both replay fixtures select the replay transport", async () => {
  const { runtime, db } = fixture(CONFIGURED);

  assert.equal(runtime.transportMode, "replay");
  assert.equal(runtime.llmTailConfigured, true);
  db.close();
});

test("providers load lazily, and once per runtime across both entry points", async () => {
  const { runtime, loads, db } = fixture(CONFIGURED);
  assert.deepEqual(loads, { llm: 0, embeddings: 0 });
  await runtime.closeHooks();
  await runtime.maintenanceDeps();
  await runtime.closeHooks();
  assert.deepEqual(loads, { llm: 1, embeddings: 1 });
  db.close();
});

test("deterministic subcommands never load a provider, configured or not", async () => {
  const { runtime, loads, db, home } = fixture(CONFIGURED);
  for (const argv of [
    ["status"],
    ["session-start", "--fast"],
    ["diagnose-journeys"],
    ["repair-journeys"],
    ["backfill-codex-session", join(home, "absent.jsonl")],
    ["log-user", "s1", "hello"],
  ]) {
    const result = await runConversationLoggerCommand(db, argv, runtime);
    assert.equal(result.handled, true, argv.join(" "));
  }
  assert.deepEqual(loads, { llm: 0, embeddings: 0 });
  db.close();
});

test("the runtime resolves session and transcript inputs the way Python's hooks do", () => {
  const { runtime, db } = fixture({
    MIRROR_SESSION_ID: "  env-session  ",
    CLAUDE_PROJECT_DIR: "/work/project",
    PI_SESSIONS_DIR: "/pi/sessions",
  });
  assert.equal(runtime.environmentSessionId, "env-session");
  assert.equal(runtime.claudeProjectDir, "/work/project");
  assert.equal(runtime.piSessionsDir, "/pi/sessions");
  db.close();

  const blank = fixture({ MIRROR_SESSION_ID: "   ", CLAUDE_PROJECT_DIR: "" });
  assert.equal(blank.runtime.environmentSessionId, null);
  assert.equal(blank.runtime.claudeProjectDir, null);
  assert.equal(blank.runtime.piSessionsDir, join(blank.home, ".pi", "agent", "sessions"));
  blank.db.close();
});

test("the pipeline switches mirror Python's os.getenv reads, including int() strictness", () => {
  assert.equal(resolveSummarizeEnabled({ env: {} }), false);
  assert.equal(resolveSummarizeEnabled({ env: { MEMORY_SUMMARIZE: "1" } }), true);
  assert.equal(resolveSummarizeEnabled({ env: { MEMORY_SUMMARIZE: "true" } }), false);
  assert.equal(resolveTwoPassEnabled({ env: { MEMORY_TWO_PASS: "1" } }), true);
  assert.equal(resolveMaintenanceMaxExtractions({ env: {} }), 10);
  assert.equal(
    resolveMaintenanceMaxExtractions({ env: { MEMORY_MAINTENANCE_MAX_EXTRACTIONS: " 3 " } }),
    3,
  );
  assert.equal(resolveExtractionMaxAttempts({ env: {} }), 3);
  assert.equal(resolveExtractionMaxAttempts({ env: { MEMORY_EXTRACTION_MAX_ATTEMPTS: "+5" } }), 5);
  // Python: `int("3.0")` and `int("")` both raise ValueError at import.
  assert.throws(
    () => resolveExtractionMaxAttempts({ env: { MEMORY_EXTRACTION_MAX_ATTEMPTS: "3.0" } }),
    /invalid literal/,
  );
  assert.throws(
    () => resolveMaintenanceMaxExtractions({ env: { MEMORY_MAINTENANCE_MAX_EXTRACTIONS: "" } }),
    /invalid literal/,
  );
});
