import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { upsertIdentity } from "../../src/identity/identityStore.ts";
import {
  allJourneyKeys,
  getJourneyPathContent,
  getJourneyStatusEntries,
  getMemoriesByJourney,
  getRecentConversationsByJourney,
  getSyncFile,
} from "../../src/journey/journeyStatus.ts";
import { createConversationTables, insertConversation } from "../helpers/conversationSchema.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

const NOW = "2026-06-23T12:00:00.123000Z";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-journeystatus-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createIdentityTable(db);
  createConversationTables(db);
  db.exec(
    "CREATE TABLE memories (id TEXT PRIMARY KEY, journey TEXT, title TEXT NOT NULL, created_at TEXT NOT NULL)",
  );
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function seedJourney(
  db: WritableDatabase,
  key: string,
  content: string,
  metadata: string | null = null,
): void {
  upsertIdentity(db, { id: key, layer: "journey", key, content, version: "1.0.0", metadata }, NOW);
}

test("getSyncFile reads the journey's own metadata sync_file, tolerating absence/malformed JSON", () => {
  const { db, cleanup } = tempDb();
  try {
    seedJourney(db, "with-sync", "# Demo", '{"sync_file": "/tmp/demo-sync.md"}');
    seedJourney(db, "no-metadata", "# Demo");
    seedJourney(db, "malformed", "# Demo", "{not json");
    assert.equal(getSyncFile(db, "with-sync"), "/tmp/demo-sync.md");
    assert.equal(getSyncFile(db, "no-metadata"), null);
    assert.equal(getSyncFile(db, "malformed"), null);
    assert.equal(getSyncFile(db, "no-such-journey"), null);
  } finally {
    db.close();
    cleanup();
  }
});

test("getJourneyPathContent prefers a readable sync file over the database", () => {
  const { db, cleanup } = tempDb();
  try {
    seedJourney(db, "synced", "# Demo", '{"sync_file": "~/synced-path.md"}');
    upsertIdentity(
      db,
      {
        id: "jp",
        layer: "journey_path",
        key: "synced",
        content: "DB fallback content",
        version: "1.0.0",
        metadata: null,
      },
      NOW,
    );
    const fakeRead = (path: string) => {
      assert.ok(
        path.endsWith("/synced-path.md") && !path.startsWith("~"),
        `expanded path: ${path}`,
      );
      return "External file content.";
    };
    assert.equal(getJourneyPathContent(db, "synced", fakeRead), "External file content.");
  } finally {
    db.close();
    cleanup();
  }
});

test("getJourneyPathContent falls back to the database when the sync file read fails", () => {
  const { db, cleanup } = tempDb();
  try {
    seedJourney(db, "broken-sync", "# Demo", '{"sync_file": "/does/not/exist.md"}');
    upsertIdentity(
      db,
      {
        id: "jp",
        layer: "journey_path",
        key: "broken-sync",
        content: "DB fallback content",
        version: "1.0.0",
        metadata: null,
      },
      NOW,
    );
    const throwingRead = () => {
      throw new Error("ENOENT: no such file");
    };
    assert.equal(getJourneyPathContent(db, "broken-sync", throwingRead), "DB fallback content");
  } finally {
    db.close();
    cleanup();
  }
});

test("getJourneyPathContent reads straight from the database when no sync_file is configured", () => {
  const { db, cleanup } = tempDb();
  try {
    seedJourney(db, "plain", "# Demo");
    upsertIdentity(
      db,
      {
        id: "jp",
        layer: "journey_path",
        key: "plain",
        content: "Plain DB content",
        version: "1.0.0",
        metadata: null,
      },
      NOW,
    );
    assert.equal(getJourneyPathContent(db, "plain"), "Plain DB content");
  } finally {
    db.close();
    cleanup();
  }
});

test("getJourneyPathContent returns null when neither a sync file nor a DB row exists", () => {
  const { db, cleanup } = tempDb();
  try {
    seedJourney(db, "nothing", "# Demo");
    assert.equal(getJourneyPathContent(db, "nothing"), null);
  } finally {
    db.close();
    cleanup();
  }
});

test("getMemoriesByJourney orders newest first and caps at the limit", () => {
  const { db, cleanup } = tempDb();
  try {
    const insert = db.prepare(
      "INSERT INTO memories (id, journey, title, created_at) VALUES (?, ?, ?, ?)",
    );
    insert.run("m1", "demo", "First", "2026-01-01T00:00:00Z");
    insert.run("m2", "demo", "Second", "2026-02-01T00:00:00Z");
    insert.run("m3", "other", "Other journey", "2026-03-01T00:00:00Z");
    assert.deepEqual(
      getMemoriesByJourney(db, "demo").map((m) => m.title),
      ["Second", "First"],
    );
    assert.equal(getMemoriesByJourney(db, "demo", 1).length, 1);
  } finally {
    db.close();
    cleanup();
  }
});

test("getRecentConversationsByJourney orders newest first and caps at the limit", () => {
  const { db, cleanup } = tempDb();
  try {
    insertConversation(db, {
      id: "c1",
      startedAt: "2026-01-01T00:00:00Z",
      journey: "demo",
      title: "First",
    });
    insertConversation(db, {
      id: "c2",
      startedAt: "2026-02-01T00:00:00Z",
      journey: "demo",
      title: "Second",
    });
    insertConversation(db, { id: "c3", startedAt: "2026-03-01T00:00:00Z", journey: "other" });
    assert.deepEqual(
      getRecentConversationsByJourney(db, "demo").map((c) => c.title),
      ["Second", "First"],
    );
    assert.equal(getRecentConversationsByJourney(db, "demo", 1).length, 1);
  } finally {
    db.close();
    cleanup();
  }
});

test("allJourneyKeys returns every journey key, ordered", () => {
  const { db, cleanup } = tempDb();
  try {
    seedJourney(db, "beta", "# Beta");
    seedJourney(db, "alpha", "# Alpha");
    assert.deepEqual(allJourneyKeys(db), ["alpha", "beta"]);
  } finally {
    db.close();
    cleanup();
  }
});

test("getJourneyStatusEntries composes identity/path/memories/conversations per key, even for a nonexistent journey", () => {
  const { db, cleanup } = tempDb();
  try {
    const [entry] = getJourneyStatusEntries(db, ["totally-not-a-journey"]);
    assert.deepEqual(entry, {
      journeyId: "totally-not-a-journey",
      identity: null,
      journeyPath: null,
      recentMemories: [],
      recentConversations: [],
    });
  } finally {
    db.close();
    cleanup();
  }
});
