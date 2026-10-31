// CV24.DS3 — the reads a host's sidebar is built from.
//
// Three calls, all read-only: the Journey tree, a Journey's Conversations, and
// one Conversation by exact id. Each asks the migration report first and
// refuses a database that is not `current`, opens read-only, never migrates,
// and ignores MIRROR_HOME.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { ConversationCallRejectedError, DatabaseNotCurrentError } from "#conversation/hostCalls.ts";
import {
  inspectConversation,
  listJourneyConversations,
  readJourneyTree,
} from "#conversation/hostReads.ts";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { regressTo016 } from "#helpers/legacyDb.ts";
import { tempDir } from "#helpers/tempDir.ts";

function home(prefix = "mirror-host-reads-"): string {
  const dbPath = join(tempDir(prefix), "memory.db");
  const db = bootstrapDatabase(dbPath);
  const journey = (id: string, key: string, content: string, metadata: object) =>
    db
      .prepare(
        "INSERT INTO identity (id, layer, key, content, version, created_at, updated_at, metadata) VALUES (?, 'journey', ?, ?, '1.0.0', ?, ?, ?)",
      )
      .run(
        id,
        key,
        content,
        "2026-10-01T00:00:00Z",
        "2026-10-02T00:00:00Z",
        JSON.stringify(metadata),
      );
  journey("j1", "journey-one", "# One\n**Status:** active", { sibling_position: 1 });
  journey("j2", "journey-two", "# Two", { sibling_position: 0 });
  journey("j3", "journey-child", "# Child", { parent_journey: "journey-one" });
  const conversation = (
    id: string,
    journeyId: string,
    startedAt: string,
    title: string | null,
    persona: string | null,
  ) =>
    db
      .prepare(
        "INSERT INTO conversations (id, title, started_at, interface, journey, persona) VALUES (?, ?, ?, 'desktop', ?, ?)",
      )
      .run(id, title, startedAt, journeyId, persona);
  conversation("conv-old-000001", "journey-one", "2026-10-01T10:00:00Z", "Older", null);
  conversation("conv-new-000001", "journey-one", "2026-10-03T10:00:00Z", null, "engineer");
  conversation("conv-other-0001", "journey-two", "2026-10-04T10:00:00Z", "Elsewhere", null);
  for (const [id, at] of [
    ["m1", "2026-10-03T10:00:01Z"],
    ["m2", "2026-10-03T10:00:02Z"],
  ]) {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, 'conv-new-000001', 'user', 'x', ?)",
    ).run(id, at);
  }
  db.close();
  return dbPath;
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

test("readJourneyTree reads the home's Journeys in their stored order", () => {
  const tree = readJourneyTree(home());
  assert.deepEqual(tree.findings, []);
  assert.deepEqual(
    tree.roots.map((node) => [node.id, node.name, node.children?.map((child) => child.id) ?? []]),
    [
      ["journey-two", "Two", []],
      ["journey-one", "One", ["journey-child"]],
    ],
  );
  assert.equal(tree.roots[1]?.status, "active");
  assert.equal(tree.roots[1]?.updatedAt, "2026-10-02T00:00:00Z");
});

test("listJourneyConversations lists one Journey's Conversations, newest first", () => {
  const dbPath = home();
  assert.deepEqual(listJourneyConversations(dbPath, { journeyId: "journey-one", limit: 10 }), [
    {
      conversationId: "conv-new-000001",
      title: null,
      startedAt: "2026-10-03T10:00:00Z",
      messageCount: 2,
      persona: "engineer",
    },
    {
      conversationId: "conv-old-000001",
      title: "Older",
      startedAt: "2026-10-01T10:00:00Z",
      messageCount: 0,
      persona: null,
    },
  ]);
  assert.deepEqual(
    listJourneyConversations(dbPath, { journeyId: "journey-one", limit: 1 }).map(
      (entry) => entry.conversationId,
    ),
    ["conv-new-000001"],
  );
  assert.deepEqual(listJourneyConversations(dbPath, { journeyId: "journey-none", limit: 5 }), []);
  for (const limit of [0, 101, 1.5, "5"]) {
    assert.equal(
      rejection(() =>
        listJourneyConversations(dbPath, { journeyId: "journey-one", limit } as never),
      ),
      "invalid_request",
      String(limit),
    );
  }
  assert.equal(
    rejection(() => listJourneyConversations(dbPath, { journeyId: "", limit: 5 })),
    "invalid_request",
  );
});

test("inspectConversation reads one Conversation by exact id", () => {
  const dbPath = home();
  assert.deepEqual(inspectConversation(dbPath, { conversationId: "conv-new-000001" }), {
    conversationId: "conv-new-000001",
    journeyId: "journey-one",
    title: null,
    startedAt: "2026-10-03T10:00:00Z",
    endedAt: null,
    messageCount: 2,
  });
  assert.equal(
    rejection(() => inspectConversation(dbPath, { conversationId: "conv-new" })),
    "conversation_unavailable",
  );
  assert.equal(
    rejection(() => inspectConversation(dbPath, { conversationId: "" })),
    "invalid_request",
  );
});

const EVERY_READ: [string, (dbPath: string) => unknown][] = [
  ["tree", (p) => readJourneyTree(p)],
  ["list", (p) => listJourneyConversations(p, { journeyId: "journey-one", limit: 5 })],
  ["inspect", (p) => inspectConversation(p, { conversationId: "conv-new-000001" })],
];

test("every read refuses a home that is not current, and leaves it as it was", () => {
  const pending = home("mirror-host-reads-pending-");
  regressTo016(pending);
  const hash = createHash("sha256").update(readFileSync(pending)).digest("hex");
  for (const [name, read] of EVERY_READ) {
    assert.throws(
      () => read(pending),
      (error: unknown) => error instanceof DatabaseNotCurrentError && error.state === "pending",
      name,
    );
  }
  assert.equal(createHash("sha256").update(readFileSync(pending)).digest("hex"), hash);
  const missingDir = tempDir("mirror-host-reads-missing-");
  for (const [name, read] of EVERY_READ) {
    assert.throws(
      () => read(join(missingDir, "memory.db")),
      (error: unknown) => error instanceof DatabaseNotCurrentError && error.state === "missing",
      name,
    );
  }
  assert.deepEqual(readdirSync(missingDir), []);
});

test("the reads write nothing", () => {
  const dbPath = home();
  const hash = createHash("sha256").update(readFileSync(dbPath)).digest("hex");
  for (const [, read] of EVERY_READ) read(dbPath);
  assert.equal(createHash("sha256").update(readFileSync(dbPath)).digest("hex"), hash);
  assert.ok(!existsSync(join(dbPath, "..", "backups")));
});

test("the reads use the path they are given, never MIRROR_HOME", () => {
  const canary = home("mirror-host-reads-canary-");
  const target = home("mirror-host-reads-target-");
  const saved = {
    home: process.env.MIRROR_HOME,
    user: process.env.MIRROR_USER,
    db: process.env.DB_PATH,
  };
  process.env.MIRROR_HOME = join(canary, "..");
  process.env.MIRROR_USER = "tmp";
  process.env.DB_PATH = canary;
  const before = readdirSync(join(canary, "..")).sort();
  try {
    for (const [, read] of EVERY_READ) read(target);
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
  assert.deepEqual(readdirSync(join(canary, "..")).sort(), before, "the canary home was opened");
});
