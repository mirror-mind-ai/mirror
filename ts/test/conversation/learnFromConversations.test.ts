// CV24.DS7: learn from a host's idle Conversations without ending them, in a
// home `createHome` made, as Mirror Desktop's; providers are fakes.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { DatabaseNotCurrentError, ensureConversation } from "#conversation/hostCalls.ts";
import {
  cutPieces,
  LEARNING_MESSAGE_MAX_CHARS,
  LearningRejectedError,
  learnFromConversations,
  learningProviderEnv,
  type StoredMessage,
} from "#conversation/learnFromConversations.ts";
import { openDatabaseReadOnly } from "#db/database.ts";
import { regressTo016 } from "#helpers/legacyDb.ts";
import { tempDir } from "#helpers/tempDir.ts";
import { createHome } from "#init/createHome.ts";
import type { EmbeddingProvider, EmbeddingResult } from "#providers/embedding.ts";
import type { LlmProvider, LlmRequest, LlmResponse } from "#providers/llm.ts";

const HOST = "nautilus_harness";
const NOW = "2026-10-30T12:00:00.000Z";
const now = () => NOW;
/** Minutes before NOW, as an ISO instant. */
const ago = (minutes: number, second = 0) =>
  new Date(Date.parse(NOW) - minutes * 60_000 + second * 1000).toISOString();

class FakeLlm implements LlmProvider {
  requests: LlmRequest[] = [];
  failExtraction = false;
  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    if (request.role === "extraction") {
      if (this.failExtraction) throw new Error("provider down");
      return {
        content: JSON.stringify([
          { title: "A decision", content: "Chose a path.", memory_type: "decision", layer: "ego" },
        ]),
        model: "test/extraction",
      };
    }
    return { content: "[]", model: "test/tasks" };
  }
  extractions(): LlmRequest[] {
    return this.requests.filter((request) => request.role === "extraction");
  }
}

class FakeEmbedding implements EmbeddingProvider {
  fail = false;
  async embed(): Promise<EmbeddingResult> {
    if (this.fail) throw new Error("embedding down");
    const vector = Array(1536).fill(0);
    vector[1] = 1;
    return { vector, promptTokens: 3 };
  }
}

function home(): { dbPath: string; journey: string } {
  const root = tempDir("mirror-learn-");
  const homePath = join(root, "ana-souza");
  createHome({ homePath, userName: "ana-souza" });
  const dbPath = join(homePath, "memory.db");
  const db = openDatabaseReadOnly(dbPath);
  const journey = String(
    db.prepare("SELECT key FROM identity WHERE layer = 'journey' ORDER BY key").get()?.key,
  );
  db.close();
  return { dbPath, journey };
}

function conversation(dbPath: string, journey: string, session: string, surface = HOST): string {
  const created = ensureConversation(dbPath, {
    sessionId: session,
    journeyId: journey,
    title: `Thread ${session}`,
    interface: surface,
  });
  return created.conversationId;
}

/** Messages as a host appends them, `count` of them, one second apart from `start`. */
function messages(
  dbPath: string,
  conversationId: string,
  start: number,
  count: number,
  tag: string,
) {
  const db = new DatabaseSync(dbPath);
  const insert = db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  for (let index = 0; index < count; index += 1) {
    insert.run(
      `${tag}-${String(index).padStart(3, "0")}`,
      conversationId,
      index % 2 === 0 ? "user" : "assistant",
      `${tag} message ${index}`,
      ago(start, index),
    );
  }
  db.close();
}

function row(dbPath: string, conversationId: string): Record<string, unknown> {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId) as Record<
      string,
      unknown
    >;
  } finally {
    db.close();
  }
}

function metadata(dbPath: string, conversationId: string): Record<string, unknown> {
  const raw = row(dbPath, conversationId).metadata;
  return typeof raw === "string" ? JSON.parse(raw) : {};
}

function count(dbPath: string, sql: string, ...params: string[]): number {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return Number((db.prepare(sql).get(...params) as { n: number }).n);
  } finally {
    db.close();
  }
}

const fakes = () => ({ llm: new FakeLlm(), embedding: new FakeEmbedding() });

test("an idle stretch becomes memories, the watermark moves, and the Conversation stays open", async () => {
  const { dbPath, journey } = home();
  const id = conversation(dbPath, journey, "s-1");
  messages(dbPath, id, 120, 6, "first");
  const before = row(dbPath, id);
  const used = fakes();

  const report = await learnFromConversations(
    dbPath,
    { interface: HOST },
    { providers: used, now },
  );

  assert.deepEqual(report, { pieces: 1, memories: 1, tasks: 0, failed: 0, skipped: 0, waiting: 0 });
  assert.equal(
    count(dbPath, "SELECT COUNT(*) AS n FROM memories WHERE conversation_id = ?", id),
    1,
  );
  const after = row(dbPath, id);
  assert.equal(after.ended_at, null, "never ended");
  assert.equal(after.title, before.title);
  assert.equal(after.summary, before.summary);
  const meta = metadata(dbPath, id);
  assert.deepEqual(meta.learned_through, { created_at: ago(120, 5), id: "first-005" });
  assert.equal(meta.learning_status, "ok");
  assert.equal(meta.extracted, undefined, "the terminal's flag is not written");
  assert.equal(
    count(
      dbPath,
      "SELECT COUNT(*) AS n FROM llm_calls WHERE role = 'extraction' AND conversation_id = ?",
      id,
    ),
    1,
  );
  assert.ok(existsSync(join(dbPath, "..", "backups", "frontdoor-pre-write-backup.db")));
});

test("only what came after the watermark is learned, and nothing new needs no key", async () => {
  const { dbPath, journey } = home();
  const id = conversation(dbPath, journey, "s-1");
  messages(dbPath, id, 180, 6, "old");
  await learnFromConversations(dbPath, { interface: HOST }, { providers: fakes(), now });

  // Nothing new: no provider, no key, nothing written.
  const quiet = await learnFromConversations(dbPath, { interface: HOST }, { now });
  assert.deepEqual(quiet, { pieces: 0, memories: 0, tasks: 0, failed: 0, skipped: 0, waiting: 0 });

  messages(dbPath, id, 60, 4, "new");
  const used = fakes();
  const report = await learnFromConversations(
    dbPath,
    { interface: HOST },
    { providers: used, now },
  );
  assert.equal(report.pieces, 1);
  const prompt = used.llm.extractions()[0]?.prompt ?? "";
  assert.ok(prompt.includes("new message 3"), "the new stretch is in the prompt");
  assert.ok(!prompt.includes("old message"), "the learned stretch is not");
  assert.equal((metadata(dbPath, id).learned_through as { id: string }).id, "new-003");
});

test("a short stretch, a recent one, another host's, an ended one and one with no Journey wait", async () => {
  const { dbPath, journey } = home();
  const short = conversation(dbPath, journey, "s-short");
  messages(dbPath, short, 120, 3, "short");
  const recent = conversation(dbPath, journey, "s-recent");
  messages(dbPath, recent, 120, 5, "recent-a");
  messages(dbPath, recent, 10, 1, "recent-b");
  const other = conversation(dbPath, journey, "s-other", "claude_code");
  messages(dbPath, other, 120, 6, "other");
  const ended = conversation(dbPath, journey, "s-ended");
  messages(dbPath, ended, 120, 6, "ended");
  const loose = conversation(dbPath, journey, "s-loose");
  messages(dbPath, loose, 120, 6, "loose");
  const db = new DatabaseSync(dbPath);
  db.prepare("UPDATE conversations SET ended_at = ? WHERE id = ?").run(ago(100), ended);
  db.prepare("UPDATE conversations SET journey = NULL WHERE id = ?").run(loose);
  db.close();

  const used = fakes();
  const report = await learnFromConversations(
    dbPath,
    { interface: HOST },
    { providers: used, now },
  );
  assert.equal(report.pieces, 0);
  assert.equal(used.llm.requests.length, 0);
  // The idle rule is the host's to set.
  const sooner = await learnFromConversations(
    dbPath,
    { interface: HOST, idleMinutes: 5 },
    { providers: fakes(), now },
  );
  assert.equal(sooner.pieces, 1, "the recent one, once idle enough");
});

test("with work to do and no key, the call is refused before any write", async () => {
  const { dbPath, journey } = home();
  const id = conversation(dbPath, journey, "s-1");
  messages(dbPath, id, 120, 6, "first");
  const before = readFileSync(dbPath);
  await assert.rejects(
    learnFromConversations(dbPath, { interface: HOST }, { apiKey: "  ", now }),
    (error) => error instanceof LearningRejectedError && error.reason === "no_key",
  );
  assert.ok(readFileSync(dbPath).equals(before));
  assert.ok(!existsSync(join(dbPath, "..", "backups", "frontdoor-pre-write-backup.db")));
});

test("a long stretch is cut into pieces, and the budget leaves the rest waiting, oldest first", async () => {
  const { dbPath, journey } = home();
  const older = conversation(dbPath, journey, "s-older");
  messages(dbPath, older, 300, 90, "older");
  const newer = conversation(dbPath, journey, "s-newer");
  messages(dbPath, newer, 120, 6, "newer");

  const used = fakes();
  const report = await learnFromConversations(
    dbPath,
    { interface: HOST, limit: 2 },
    { providers: used, now },
  );
  assert.deepEqual(report, { pieces: 2, memories: 2, tasks: 0, failed: 0, skipped: 0, waiting: 2 });
  assert.equal((metadata(dbPath, older).learned_through as { id: string }).id, "older-079");
  assert.equal(metadata(dbPath, newer).learned_through, undefined);

  const rest = await learnFromConversations(
    dbPath,
    { interface: HOST },
    { providers: fakes(), now },
  );
  assert.deepEqual(rest, { pieces: 2, memories: 2, tasks: 0, failed: 0, skipped: 0, waiting: 0 });
  assert.equal((metadata(dbPath, older).learned_through as { id: string }).id, "older-089");
});

test("a failing piece is counted, then skipped at the third failure so the next can be learned", async () => {
  const { dbPath, journey } = home();
  const id = conversation(dbPath, journey, "s-1");
  messages(dbPath, id, 120, 6, "first");
  const used = fakes();
  used.llm.failExtraction = true;

  for (const attempt of [1, 2]) {
    const report = await learnFromConversations(
      dbPath,
      { interface: HOST },
      { providers: used, now },
    );
    assert.deepEqual(report, {
      pieces: 0,
      memories: 0,
      tasks: 0,
      failed: 1,
      skipped: 0,
      waiting: 1,
    });
    assert.equal(metadata(dbPath, id).learning_attempts, attempt);
    assert.equal(metadata(dbPath, id).learned_through, undefined);
  }
  const third = await learnFromConversations(dbPath, { interface: HOST }, { providers: used, now });
  assert.deepEqual(third, { pieces: 0, memories: 0, tasks: 0, failed: 0, skipped: 1, waiting: 0 });
  const meta = metadata(dbPath, id);
  assert.equal(meta.learning_status, "skipped");
  assert.equal(meta.learning_skipped_messages, 6);
  assert.equal(meta.learning_attempts, undefined);
  assert.equal((meta.learned_through as { id: string }).id, "first-005");

  messages(dbPath, id, 60, 4, "later");
  const next = await learnFromConversations(
    dbPath,
    { interface: HOST },
    { providers: fakes(), now },
  );
  assert.equal(next.pieces, 1, "the bad stretch no longer blocks");
});

test("a failed embedding writes no memory and leaves the watermark", async () => {
  const { dbPath, journey } = home();
  const id = conversation(dbPath, journey, "s-1");
  messages(dbPath, id, 120, 6, "first");
  const used = fakes();
  used.embedding.fail = true;
  const report = await learnFromConversations(
    dbPath,
    { interface: HOST },
    { providers: used, now },
  );
  assert.equal(report.failed, 1);
  assert.equal(
    count(dbPath, "SELECT COUNT(*) AS n FROM memories WHERE conversation_id = ?", id),
    0,
  );
  assert.equal(metadata(dbPath, id).learned_through, undefined);
});

test("pieces are bounded by messages and characters, and a short remainder joins the last", () => {
  const make = (n: number, size = 10): StoredMessage[] =>
    Array.from({ length: n }, (_, index) => ({
      id: `m-${index}`,
      role: "user",
      content: "x".repeat(size),
      createdAt: `t-${index}`,
    }));
  assert.deepEqual(
    cutPieces(make(100)).map((piece) => piece.length),
    [40, 40, 20],
  );
  assert.deepEqual(
    cutPieces(make(43)).map((piece) => piece.length),
    [43],
  );
  assert.deepEqual(
    cutPieces(make(3)).map((piece) => piece.length),
    [],
  );
  assert.deepEqual(
    cutPieces(make(4)).map((piece) => piece.length),
    [4],
  );
  // 20,000 characters count each: three fill 60,000.
  assert.deepEqual(
    cutPieces(make(8, 30_000)).map((piece) => piece.length),
    [3, 5],
  );
});

test("a message longer than the bound is cut in the prompt, not in the database", async () => {
  const { dbPath, journey } = home();
  const id = conversation(dbPath, journey, "s-1");
  messages(dbPath, id, 120, 3, "first");
  const db = new DatabaseSync(dbPath);
  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES ('long', ?, 'assistant', ?, ?)",
  ).run(id, "y".repeat(LEARNING_MESSAGE_MAX_CHARS + 500), ago(119));
  db.close();
  const used = fakes();
  await learnFromConversations(dbPath, { interface: HOST }, { providers: used, now });
  const prompt = used.llm.extractions()[0]?.prompt ?? "";
  assert.ok(prompt.includes("y".repeat(LEARNING_MESSAGE_MAX_CHARS)));
  assert.ok(!prompt.includes("y".repeat(LEARNING_MESSAGE_MAX_CHARS + 1)));
  assert.equal(
    count(dbPath, "SELECT LENGTH(content) AS n FROM messages WHERE id = 'long'"),
    LEARNING_MESSAGE_MAX_CHARS + 500,
  );
});

test("an invalid request is refused, and a database that is not current is never opened for writing", async () => {
  const { dbPath, journey } = home();
  for (const request of [
    { interface: "Bad Interface" },
    { interface: HOST, limit: 0 },
    { interface: HOST, limit: 51 },
    { interface: HOST, idleMinutes: 0 },
    { interface: HOST, idleMinutes: 1.5 },
  ]) {
    await assert.rejects(
      learnFromConversations(dbPath, request, { providers: fakes(), now }),
      (error) => error instanceof LearningRejectedError && error.reason === "invalid_request",
      JSON.stringify(request),
    );
  }
  const id = conversation(dbPath, journey, "s-1");
  messages(dbPath, id, 120, 6, "first");
  regressTo016(dbPath);
  const before = readFileSync(dbPath);
  await assert.rejects(
    learnFromConversations(dbPath, { interface: HOST }, { providers: fakes(), now }),
    DatabaseNotCurrentError,
  );
  assert.ok(readFileSync(dbPath).equals(before));
});

test("the providers get the key and one retry, nothing else", () => {
  assert.deepEqual(learningProviderEnv("k"), {
    OPENROUTER_API_KEY: "k",
    MEMORY_LLM_MAX_RETRIES: "1",
  });
});
