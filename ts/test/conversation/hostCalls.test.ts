// CV24.DS2 — Conversations as calls, for a host that embeds the core.
//
// Four calls replace what Mirror Desktop did through Python and the CLI:
// ensure a Conversation for a runtime session, append a batch, rename, and
// rebind its Journey. Each takes an explicit database path, opens only a
// `current` database, never migrates, writes through the narrowed handle (no
// snapshot), and ignores MIRROR_HOME. Append keeps the CLI's contract to the
// byte.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { canonicalJson } from "#conversation/append.ts";
import {
  appendConversationMessages,
  ConversationCallRejectedError,
  DatabaseNotCurrentError,
  ensureConversation,
  rebindConversationJourney,
  renameConversation,
} from "#conversation/hostCalls.ts";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { openDatabaseForBootstrap, openDatabaseReadOnly } from "#db/database.ts";
import { spawnFrontDoor } from "#helpers/frontDoor.ts";
import { regressTo016 } from "#helpers/legacyDb.ts";
import { tempDir } from "#helpers/tempDir.ts";

const CONVERSATION = "conv-desktop-0001";

function home(prefix = "mirror-host-calls-"): string {
  const dbPath = join(tempDir(prefix), "memory.db");
  const db = bootstrapDatabase(dbPath);
  db.prepare(
    "INSERT INTO conversations (id, title, started_at, interface, journey, summary) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    CONVERSATION,
    "First title",
    "2026-10-28T00:00:00Z",
    "desktop",
    "journey-one",
    "kept summary",
  );
  db.close();
  return dbPath;
}

function row(
  dbPath: string,
  sql: string,
  ...params: string[]
): Record<string, unknown> | undefined {
  const db = openDatabaseReadOnly(dbPath);
  try {
    const found = db.prepare(sql).get(...params);
    return found ? { ...found } : undefined;
  } finally {
    db.close();
  }
}

function conversation(dbPath: string, id = CONVERSATION) {
  return row(dbPath, "SELECT * FROM conversations WHERE id = ?", id);
}

function rejection(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof ConversationCallRejectedError) return error.reason;
    throw error;
  }
  throw new Error("expected a rejection");
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0.0",
    conversationId: CONVERSATION,
    journeyId: "journey-one",
    sourceInterface: "desktop",
    messages: [
      { id: "msg-desktop-1", role: "user", content: "olá", createdAt: "2026-10-28T12:00:00Z" },
      { id: "msg-desktop-2", role: "assistant", content: "oi", createdAt: "2026-10-28T12:00:01Z" },
    ],
    ...overrides,
  };
}

// --- ensure ---

test("ensureConversation creates, binds and is idempotent for a live session", () => {
  const dbPath = home();
  const request = {
    sessionId: "pi-session-1",
    journeyId: "journey-two",
    title: "Planning",
    interface: "desktop",
  };
  const first = ensureConversation(dbPath, request);
  assert.equal(first.journeyId, "journey-two");
  assert.deepEqual(
    (({ title, journey, interface: i, ended_at }) => ({ title, journey, i, ended_at }))(
      conversation(dbPath, first.conversationId) as Record<string, unknown>,
    ),
    { title: "Planning", journey: "journey-two", i: "desktop", ended_at: null },
  );
  const session = row(
    dbPath,
    "SELECT * FROM runtime_sessions WHERE session_id = ?",
    "pi-session-1",
  );
  assert.equal(session?.conversation_id, first.conversationId);
  assert.equal(session?.active, 1);
  assert.equal(session?.journey, "journey-two");

  assert.equal(ensureConversation(dbPath, request).conversationId, first.conversationId);
});

test("ensureConversation sets title, Journey and interface on the bound Conversation, as the Python script did", () => {
  const dbPath = home();
  const first = ensureConversation(dbPath, {
    sessionId: "s-1",
    journeyId: "journey-one",
    title: "A",
    interface: "desktop",
  });
  const again = ensureConversation(dbPath, {
    sessionId: "s-1",
    journeyId: "journey-two",
    title: "B",
    interface: "desktop",
  });
  assert.equal(again.conversationId, first.conversationId);
  const after = conversation(dbPath, first.conversationId);
  assert.equal(after?.title, "B");
  assert.equal(after?.journey, "journey-two");
});

test("ensureConversation starts a new Conversation once the bound one has ended", () => {
  const dbPath = home();
  const first = ensureConversation(dbPath, {
    sessionId: "s-1",
    journeyId: "journey-one",
    title: "A",
    interface: "desktop",
  });
  const db = openDatabaseForBootstrap(dbPath);
  db.prepare("UPDATE conversations SET ended_at = ? WHERE id = ?").run(
    "2026-10-28T13:00:00Z",
    first.conversationId,
  );
  db.close();
  const second = ensureConversation(dbPath, {
    sessionId: "s-1",
    journeyId: "journey-one",
    title: "A",
    interface: "desktop",
  });
  assert.notEqual(second.conversationId, first.conversationId);
});

test("ensureConversation refuses an incomplete request", () => {
  const dbPath = home();
  for (const bad of [
    { sessionId: "", journeyId: "j", title: "t", interface: "desktop" },
    { sessionId: "s", journeyId: "", title: "t", interface: "desktop" },
    { sessionId: "s", journeyId: "j", title: "t", interface: "" },
    { sessionId: "s", journeyId: "j", title: 3, interface: "desktop" },
  ]) {
    assert.equal(
      rejection(() => ensureConversation(dbPath, bad as never)),
      "invalid_request",
      JSON.stringify(bad),
    );
  }
});

// --- append ---

test("appendConversationMessages answers exactly what the CLI answers, byte for byte", () => {
  const viaLibrary = home("mirror-host-append-lib-");
  const viaCli = home("mirror-host-append-cli-");
  const cases: unknown[] = [
    payload(),
    payload(),
    payload({ conversationId: "conv-missing-0001" }),
    payload({ journeyId: "journey-two" }),
    payload({
      messages: [
        {
          id: "msg-desktop-1",
          role: "user",
          content: "changed",
          createdAt: "2026-10-28T12:00:00Z",
        },
      ],
    }),
    { schemaVersion: "9.9.9" },
    { nonsense: true },
  ];
  for (const item of cases) {
    const cli = spawnFrontDoor(
      ["conversations", "append", "--db-path", viaCli],
      {},
      JSON.stringify(item),
    );
    const library = canonicalJson(appendConversationMessages(viaLibrary, item));
    assert.equal(library, cli.stdout.trim(), JSON.stringify(item));
  }
  const count = (dbPath: string) => row(dbPath, "SELECT count(*) AS n FROM messages")?.n;
  assert.equal(count(viaLibrary), 2);
  assert.equal(count(viaCli), 2);
});

// --- rename ---

test("renameConversation sets a manual title and nothing else", () => {
  const dbPath = home();
  const before = conversation(dbPath) as Record<string, unknown>;
  const result = renameConversation(dbPath, {
    conversationId: CONVERSATION,
    journeyId: "journey-one",
    title: "  A   new\ttitle ",
  });
  assert.deepEqual(result, {
    conversationId: CONVERSATION,
    journeyId: "journey-one",
    title: "A new title",
  });
  const after = conversation(dbPath) as Record<string, unknown>;
  assert.equal(after.title, "A new title");
  const metadata = JSON.parse(String(after.metadata));
  assert.equal(metadata.title_status, "manual");
  for (const column of ["journey", "summary", "interface", "started_at", "ended_at"]) {
    assert.equal(after[column], before[column], column);
  }
});

test("renameConversation needs the exact id and its own Journey, and a usable title", () => {
  const dbPath = home();
  const call = (overrides: Record<string, unknown>) => () =>
    renameConversation(dbPath, {
      conversationId: CONVERSATION,
      journeyId: "journey-one",
      title: "T",
      ...overrides,
    } as never);
  assert.equal(rejection(call({ conversationId: "conv-desktop" })), "conversation_unavailable");
  assert.equal(rejection(call({ journeyId: "journey-two" })), "conversation_unavailable");
  assert.equal(rejection(call({ title: "   " })), "invalid_title");
  assert.equal(rejection(call({ title: "x".repeat(161) })), "invalid_title");
  assert.equal(conversation(dbPath)?.title, "First title");
});

// --- rebind ---

test("rebindConversationJourney moves the Journey and reports where it was", () => {
  const dbPath = home();
  const before = conversation(dbPath) as Record<string, unknown>;
  assert.deepEqual(
    rebindConversationJourney(dbPath, { conversationId: CONVERSATION, journeyId: "journey-two" }),
    {
      conversationId: CONVERSATION,
      journeyId: "journey-two",
      rebound: true,
      previousJourneyId: "journey-one",
    },
  );
  const after = conversation(dbPath) as Record<string, unknown>;
  assert.equal(after.journey, "journey-two");
  for (const column of ["title", "summary", "interface", "metadata"])
    assert.equal(after[column], before[column], column);
  assert.equal(
    rebindConversationJourney(dbPath, { conversationId: CONVERSATION, journeyId: "journey-two" })
      .rebound,
    false,
  );
  assert.equal(
    rejection(() =>
      rebindConversationJourney(dbPath, { conversationId: "conv-unknown-01", journeyId: "j" }),
    ),
    "conversation_unavailable",
  );
});

// --- custody ---

const EVERY_CALL: [string, (dbPath: string) => unknown][] = [
  [
    "ensure",
    (p) =>
      ensureConversation(p, {
        sessionId: "s",
        journeyId: "journey-one",
        title: "t",
        interface: "desktop",
      }),
  ],
  ["append", (p) => appendConversationMessages(p, payload())],
  [
    "rename",
    (p) =>
      renameConversation(p, { conversationId: CONVERSATION, journeyId: "journey-one", title: "t" }),
  ],
  [
    "rebind",
    (p) => rebindConversationJourney(p, { conversationId: CONVERSATION, journeyId: "journey-two" }),
  ],
];

test("every call refuses a home that is not current, and leaves it as it was", () => {
  const pending = home("mirror-host-pending-");
  regressTo016(pending);
  const hash = createHash("sha256").update(readFileSync(pending)).digest("hex");
  for (const [name, call] of EVERY_CALL) {
    assert.throws(
      () => call(pending),
      (error: unknown) => error instanceof DatabaseNotCurrentError && error.state === "pending",
      name,
    );
  }
  assert.equal(createHash("sha256").update(readFileSync(pending)).digest("hex"), hash);
  assert.ok(!existsSync(join(pending, "..", "backups")), "a backup was taken");

  const missingDir = tempDir("mirror-host-missing-");
  for (const [name, call] of EVERY_CALL) {
    assert.throws(
      () => call(join(missingDir, "memory.db")),
      (error: unknown) => error instanceof DatabaseNotCurrentError && error.state === "missing",
      name,
    );
  }
  assert.deepEqual(readdirSync(missingDir), []);
});

test("the calls write no snapshot", () => {
  const dbPath = home();
  for (const [, call] of EVERY_CALL) call(dbPath);
  assert.ok(!existsSync(join(dbPath, "..", "backups")), "a backups directory appeared");
});

test("the calls use the path they are given, never MIRROR_HOME", () => {
  const canary = home("mirror-host-canary-");
  const canaryHash = createHash("sha256").update(readFileSync(canary)).digest("hex");
  const target = home("mirror-host-target-");
  const saved = {
    home: process.env.MIRROR_HOME,
    user: process.env.MIRROR_USER,
    db: process.env.DB_PATH,
  };
  process.env.MIRROR_HOME = join(canary, "..");
  process.env.MIRROR_USER = "tmp";
  process.env.DB_PATH = canary;
  try {
    for (const [, call] of EVERY_CALL) call(target);
  } finally {
    for (const [key, value] of [
      ["MIRROR_HOME", saved.home],
      ["MIRROR_USER", saved.user],
      ["DB_PATH", saved.db],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  assert.equal(createHash("sha256").update(readFileSync(canary)).digest("hex"), canaryHash);
  assert.equal(conversation(target)?.journey, "journey-two");
});
