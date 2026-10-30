// CV24.DS6: Mirror's context for a host's turn. The doorman's own policy is
// `doorman.test.ts`'s; these are what a host adds: the key as an argument and
// nothing read from the environment, Mirror Mode from the Conversation's first
// turn, a delivering turn refused without a key, and the write behind the same
// snapshot `mirror doorman` takes -- in a home `createHome` made, as Desktop's.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { DatabaseNotCurrentError, ensureConversation } from "#conversation/hostCalls.ts";
import { openDatabaseReadOnly } from "#db/database.ts";
import { regressTo016 } from "#helpers/legacyDb.ts";
import { tempDir } from "#helpers/tempDir.ts";
import { createHome } from "#init/createHome.ts";
import {
  decideHostTurn,
  deliverMirrorContext,
  forgetMirrorContext,
  hostProviderEnv,
  hostProviders,
  MirrorContextRejectedError,
} from "#mirror/deliverContext.ts";
import { DELIVERED_LINE_PREFIX } from "#mirror/doorman.ts";
import {
  resolveLlmMaxRetries,
  resolveLlmTimeoutMs,
  resolveProviderConfig,
} from "#providers/config.ts";
import type { EmbeddingProvider, EmbeddingResult } from "#providers/embedding.ts";
import type { LlmProvider, LlmRequest, LlmResponse } from "#providers/llm.ts";

const SESSION = "/sessions/desktop-0001.jsonl";

class CountingEmbedding implements EmbeddingProvider {
  calls = 0;
  async embed(): Promise<EmbeddingResult> {
    this.calls += 1;
    const vector = Array(1536).fill(0);
    vector[3] = 1;
    return { vector, promptTokens: 5 };
  }
}

/** Reception's classifier, answering with no persona and no Journey. */
class QuietReception implements LlmProvider {
  calls: LlmRequest[] = [];
  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push(request);
    return { content: '{"personas": [], "journey": null}', model: "test/reception" };
  }
}

function desktopHome(): { dbPath: string; journey: string; root: string } {
  const root = tempDir("mirror-deliver-context-");
  const homePath = join(root, "ana-souza");
  createHome({ homePath, userName: "ana-souza" });
  const dbPath = join(homePath, "memory.db");
  const db = openDatabaseReadOnly(dbPath);
  const journey = String(
    db.prepare("SELECT key FROM identity WHERE layer = 'journey' ORDER BY key").get()?.key,
  );
  db.close();
  ensureConversation(dbPath, {
    sessionId: SESSION,
    journeyId: journey,
    title: "First",
    interface: "mirror-desktop-ts",
  });
  return { dbPath, journey, root };
}

function session(dbPath: string): Record<string, unknown> | undefined {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return db.prepare("SELECT * FROM runtime_sessions WHERE session_id = ?").get(SESSION) as
      | Record<string, unknown>
      | undefined;
  } finally {
    db.close();
  }
}

const providers = () => ({ embedding: new CountingEmbedding(), llm: new QuietReception() });

test("the Conversation's first ordinary turn gets the full folder, with its Journey, and enters Mirror Mode", async () => {
  const { dbPath, journey } = desktopHome();
  assert.equal(session(dbPath)?.mirror_active, 0);
  const used = providers();
  const delivered = await deliverMirrorContext(
    dbPath,
    { sessionId: SESSION, prompt: "How should I plan this week?", journeyId: journey },
    { providers: used },
  );
  assert.equal(delivered.kind, "full");
  assert.ok(
    delivered.block.startsWith(`${DELIVERED_LINE_PREFIX}: full`),
    delivered.block.slice(0, 120),
  );
  assert.equal(delivered.journey, journey);
  assert.equal(session(dbPath)?.mirror_active, 1);
  assert.equal(used.llm.calls.length, 1, "reception ran once");
  assert.ok(
    existsSync(join(dbPath, "..", "backups", "frontdoor-pre-write-backup.db")),
    "written behind the snapshot",
  );
});

test("the full folder takes the Journey the host names, over the one the session remembers", async () => {
  const { dbPath, journey } = desktopHome();
  // A second Journey, as a person makes one; the session remembers the first.
  const other = "work-and-craft";
  const db = new DatabaseSync(dbPath);
  db.prepare(
    "INSERT INTO identity (id, layer, key, content, created_at, updated_at) VALUES ('j-2', 'journey', ?, 'Work.', 't', 't')",
  ).run(other);
  db.close();
  assert.equal(session(dbPath)?.journey, journey);
  const delivered = await deliverMirrorContext(
    dbPath,
    { sessionId: SESSION, prompt: "Where am I?", journeyId: other },
    { providers: providers() },
  );
  assert.equal(delivered.journey, other);
  assert.equal(session(dbPath)?.journey, other);
});

test("the next turn is the doorman's delta, and a compaction makes the one after full again", async () => {
  const { dbPath, journey } = desktopHome();
  const used = providers();
  await deliverMirrorContext(
    dbPath,
    { sessionId: SESSION, prompt: "First question", journeyId: journey },
    { providers: used },
  );
  const delta = await deliverMirrorContext(
    dbPath,
    { sessionId: SESSION, prompt: "And the second one?", journeyId: journey },
    { providers: used },
  );
  assert.equal(delta.kind, "delta");
  assert.ok(delta.block.startsWith(`${DELIVERED_LINE_PREFIX}: delta`));
  assert.ok(delta.block.includes(`journey: ${journey}`), delta.block.split("\n")[0]);
  assert.equal(used.embedding.calls >= 1, true);

  forgetMirrorContext(dbPath, { sessionId: SESSION });
  const again = await deliverMirrorContext(
    dbPath,
    { sessionId: SESSION, prompt: "After the summary", journeyId: journey },
    { providers: used },
  );
  assert.equal(again.kind, "full");
});

test("a command turn gets nothing, needs no key, and writes nothing", async () => {
  const { dbPath, journey } = desktopHome();
  const before = readFileSync(dbPath);
  const nothing = await deliverMirrorContext(dbPath, {
    sessionId: SESSION,
    prompt: "/mm-journeys",
    journeyId: journey,
  });
  assert.deepEqual(nothing, { kind: "nothing", block: "", persona: null, journey: null });
  assert.ok(readFileSync(dbPath).equals(before));
  assert.ok(
    !existsSync(join(dbPath, "..", "backups")),
    "no snapshot for a turn that delivers nothing",
  );
});

test("a delivering turn without a key is refused before anything is written; the environment's key is never read", async () => {
  const { dbPath, journey } = desktopHome();
  const saved = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "sk-or-from-the-environment";
  try {
    for (const apiKey of [undefined, null, "", "   "]) {
      await assert.rejects(
        deliverMirrorContext(
          dbPath,
          { sessionId: SESSION, prompt: "Help me think", journeyId: journey },
          { apiKey },
        ),
        (error: unknown) =>
          error instanceof MirrorContextRejectedError && error.reason === "no_key",
      );
    }
  } finally {
    if (saved === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = saved;
  }
  assert.equal(session(dbPath)?.mirror_active, 0);
  assert.ok(!existsSync(join(dbPath, "..", "backups")));
});

test("a request it cannot read is refused", async () => {
  const { dbPath } = desktopHome();
  const bad: unknown[] = [
    { prompt: "x" },
    { sessionId: "", prompt: "x" },
    { sessionId: SESSION, prompt: "" },
    { sessionId: SESSION, prompt: "   " },
    { sessionId: SESSION, prompt: "x", journeyId: 7 },
    { sessionId: SESSION, prompt: "x".repeat(200_001) },
  ];
  for (const request of bad) {
    await assert.rejects(
      deliverMirrorContext(dbPath, request as never, { providers: providers() }),
      (error: unknown) =>
        error instanceof MirrorContextRejectedError && error.reason === "invalid_request",
      JSON.stringify(request).slice(0, 60),
    );
  }
  assert.throws(() => forgetMirrorContext(dbPath, { sessionId: "" }), MirrorContextRejectedError);
});

test("a home that is not current is refused and left as it was", async () => {
  const { dbPath, journey } = desktopHome();
  regressTo016(dbPath);
  const before = readFileSync(dbPath);
  await assert.rejects(
    deliverMirrorContext(
      dbPath,
      { sessionId: SESSION, prompt: "Hello", journeyId: journey },
      { providers: providers() },
    ),
    (error: unknown) => error instanceof DatabaseNotCurrentError && error.state === "pending",
  );
  assert.throws(() => forgetMirrorContext(dbPath, { sessionId: SESSION }), DatabaseNotCurrentError);
  assert.ok(readFileSync(dbPath).equals(before));
});

test("forgetting an unknown session writes nothing", () => {
  const { dbPath } = desktopHome();
  forgetMirrorContext(dbPath, { sessionId: "/sessions/never-seen.jsonl" });
  assert.ok(!existsSync(join(dbPath, "..", "backups")));
});

test("writes nothing outside the home", async () => {
  const { dbPath, journey, root } = desktopHome();
  await deliverMirrorContext(
    dbPath,
    { sessionId: SESSION, prompt: "Hello", journeyId: journey },
    { providers: providers() },
  );
  assert.deepEqual(readdirSync(root), ["ana-souza"]);
});

test("a host's decision: Mirror Mode from the first turn, the doorman's after", () => {
  const personas = [{ key: "writer", routing_keywords: ["draft"] }];
  const off = { active: false, persona: null, journey: null };
  const on = { active: true, persona: null, journey: "j" };
  assert.deepEqual(decideHostTurn({ prompt: "Hello", state: null, personas }), {
    kind: "full",
    query: "Hello",
  });
  assert.deepEqual(decideHostTurn({ prompt: "Hello", state: off, personas }), {
    kind: "full",
    query: "Hello",
  });
  assert.deepEqual(decideHostTurn({ prompt: "/mm-build x", state: off, personas }), {
    kind: "nothing",
  });
  assert.deepEqual(decideHostTurn({ prompt: "/mm-build x", state: on, personas }), {
    kind: "nothing",
  });
  assert.equal(decideHostTurn({ prompt: "a draft", state: on, personas }).kind, "delta");
});

test("a host's providers get the key, one attempt and a 10 s bound each, and nothing else", () => {
  const env = hostProviderEnv("sk-or-test");
  assert.equal(resolveProviderConfig("openrouter", { env }).apiKey, "sk-or-test");
  assert.equal(resolveLlmMaxRetries({ env }), 0);
  assert.equal(resolveLlmTimeoutMs("reception", { env }), 10_000);
  assert.equal(resolveLlmTimeoutMs("embedding", { env }), 10_000);
  assert.deepEqual(Object.keys(env).sort(), [
    "MEMORY_LLM_MAX_RETRIES",
    "MEMORY_LLM_TIMEOUT_EMBEDDING",
    "MEMORY_LLM_TIMEOUT_RECEPTION",
    "OPENROUTER_API_KEY",
  ]);
});

test("the providers a key builds send it, once per call, within 10 s", async () => {
  const sent: { apiKey: string; path: string; timeoutMs: number; maxRetries?: number }[] = [];
  const { llm, embedding } = hostProviders("sk-or-built", (config) => ({
    async postJson(path, _body, options) {
      sent.push({
        apiKey: config.apiKey,
        path,
        timeoutMs: options.timeoutMs,
        maxRetries: options.maxRetries,
      });
      return path === "/embeddings"
        ? { data: [{ embedding: [0.1, 0.2] }], usage: { prompt_tokens: 1 } }
        : { choices: [{ message: { content: "{}" } }], usage: {} };
    },
    async getJson() {
      throw new Error("not used");
    },
  }));
  await llm.complete({ role: "reception", prompt: "hello" });
  await embedding.embed("hello");
  assert.deepEqual(sent, [
    { apiKey: "sk-or-built", path: "/chat/completions", timeoutMs: 10_000, maxRetries: 0 },
    { apiKey: "sk-or-built", path: "/embeddings", timeoutMs: 10_000, maxRetries: 0 },
  ]);
});
