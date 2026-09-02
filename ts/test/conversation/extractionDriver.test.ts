// CV22.DS7.US5 slice C — the budgeted extraction driver.
//
// Characterizes `extract_pending` and the maintenance counters in
// `src/memory/cli/conversation_logger.py`, plus the eligibility query in
// `ConversationStore.get_unextracted_conversations`.
//
// The extraction call itself is injected: it is the DS5 orchestration behind
// the replay transport, so the driver's own contract — eligibility, ordering,
// budget, failure isolation, counters — is provable without a provider.
// Two properties here were required by the DS7.US5 plan review: AI-05's spend
// bound and CV9.E2.S7's per-conversation isolation.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  countCarriedOverConversations,
  countConversationsWithExtractionStatus,
  countQuarantinedConversations,
  DEFAULT_MAINTENANCE_MAX_EXTRACTIONS,
  extractPending,
  selectUnextractedConversations,
} from "#conversation/extractionDriver.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";

function fixture(): WritableDatabase {
  const dir = mkdtempSync("/tmp/extraction-driver-");
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createRuntimeTables(db);
  return db;
}

interface SeedOptions {
  id: string;
  endedAt?: string | null;
  journey?: string | null;
  messages?: number;
  metadata?: string | null;
}

function seedConversation(db: WritableDatabase, options: SeedOptions): void {
  const {
    id,
    endedAt = "2026-09-02T12:00:00.000000Z",
    journey = "mirror-ts-core",
    messages = 4,
    metadata = null,
  } = options;
  db.prepare(
    `INSERT INTO conversations (id, started_at, ended_at, interface, journey, metadata)
     VALUES (?, '2026-09-02T11:00:00.000000Z', ?, 'pi', ?, ?)`,
  ).run(id, endedAt, journey, metadata);
  for (let index = 0; index < messages; index += 1) {
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      `${id}-m${index}`,
      id,
      index % 2 === 0 ? "user" : "assistant",
      `message ${index}`,
      "2026-09-02T11:30:00.000000Z",
    );
  }
}

// --- eligibility ---

test("selectUnextractedConversations applies every eligibility rule", () => {
  const db = fixture();
  seedConversation(db, { id: "eligible" });
  seedConversation(db, { id: "still-open", endedAt: null });
  seedConversation(db, { id: "no-journey", journey: null });
  seedConversation(db, { id: "too-short", messages: 3 });
  seedConversation(db, { id: "already-extracted", metadata: '{"extracted": 1}' });
  seedConversation(db, { id: "quarantined", metadata: '{"extraction_quarantined": 1}' });

  assert.deepEqual(
    selectUnextractedConversations(db, null).map((row) => row.id),
    ["eligible"],
  );
  db.close();
});

test("selectUnextractedConversations drains oldest-ended first", () => {
  const db = fixture();
  seedConversation(db, { id: "newest", endedAt: "2026-09-02T15:00:00.000000Z" });
  seedConversation(db, { id: "oldest", endedAt: "2026-09-02T09:00:00.000000Z" });
  seedConversation(db, { id: "middle", endedAt: "2026-09-02T12:00:00.000000Z" });

  assert.deepEqual(
    selectUnextractedConversations(db, null).map((row) => row.id),
    ["oldest", "middle", "newest"],
  );
  db.close();
});

test("malformed conversation metadata makes the eligibility query raise, as in Python", () => {
  // Characterization, not endorsement: SQLite's json_extract raises
  // "malformed JSON" rather than returning NULL, and Python's
  // get_unextracted_conversations does the same. One corrupt metadata row
  // therefore fails the whole maintenance scan for every conversation — a
  // product-level fragility recorded for Debt Review, reproduced here so the
  // port cannot drift from the released behavior by accident.
  const db = fixture();
  seedConversation(db, { id: "broken-json", metadata: "{not json" });

  assert.throws(() => selectUnextractedConversations(db, null), /malformed JSON/);
  db.close();
});

// --- AI-05: the spend bound ---

test("extractPending never exceeds its budget and carries the remainder over", () => {
  const db = fixture();
  for (let index = 0; index < 7; index += 1) {
    seedConversation(db, {
      id: `conv-${index}`,
      endedAt: `2026-09-02T1${index}:00:00.000000Z`,
    });
  }
  const attempted: string[] = [];

  const extracted = extractPending(db, {
    limit: 3,
    runExtraction: (_db, conversationId) => {
      attempted.push(conversationId);
      db.prepare("UPDATE conversations SET metadata = '{\"extracted\": 1}' WHERE id = ?").run(
        conversationId,
      );
    },
  });

  assert.equal(extracted, 3);
  // Oldest-first, and exactly `limit` attempts — not one more.
  assert.deepEqual(attempted, ["conv-0", "conv-1", "conv-2"]);
  // The remainder stays visible rather than being silently dropped.
  assert.equal(countCarriedOverConversations(db), 4);
  db.close();
});

test("extractPending defaults to the released maintenance budget", () => {
  assert.equal(DEFAULT_MAINTENANCE_MAX_EXTRACTIONS, 10);
  const db = fixture();
  for (let index = 0; index < 12; index += 1) {
    seedConversation(db, {
      id: `conv-${String(index).padStart(2, "0")}`,
      endedAt: `2026-09-02T${String(index).padStart(2, "0")}:00:00.000000Z`,
    });
  }
  let attempts = 0;

  extractPending(db, {
    runExtraction: (_db, conversationId) => {
      attempts += 1;
      db.prepare("UPDATE conversations SET metadata = '{\"extracted\": 1}' WHERE id = ?").run(
        conversationId,
      );
    },
  });

  assert.equal(attempts, DEFAULT_MAINTENANCE_MAX_EXTRACTIONS);
  db.close();
});

test("a non-positive budget attempts nothing", () => {
  const db = fixture();
  seedConversation(db, { id: "conv-1" });
  let attempts = 0;

  const extracted = extractPending(db, {
    limit: 0,
    runExtraction: () => {
      attempts += 1;
    },
  });

  assert.equal(extracted, 0);
  assert.equal(attempts, 0);
  db.close();
});

// --- CV9.E2.S7: per-conversation isolation ---

test("a poison-pill conversation cannot block the ones queued behind it", () => {
  const db = fixture();
  seedConversation(db, { id: "poison", endedAt: "2026-09-02T09:00:00.000000Z" });
  seedConversation(db, { id: "healthy-1", endedAt: "2026-09-02T10:00:00.000000Z" });
  seedConversation(db, { id: "healthy-2", endedAt: "2026-09-02T11:00:00.000000Z" });
  const attempted: string[] = [];

  const extracted = extractPending(db, {
    limit: 10,
    runExtraction: (_db, conversationId) => {
      attempted.push(conversationId);
      if (conversationId === "poison") {
        throw new Error("provider outage on a poison-pill transcript");
      }
      db.prepare("UPDATE conversations SET metadata = '{\"extracted\": 1}' WHERE id = ?").run(
        conversationId,
      );
    },
  });

  // The batch continued past the failure; only successes are counted.
  assert.deepEqual(attempted, ["poison", "healthy-1", "healthy-2"]);
  assert.equal(extracted, 2);
  db.close();
});

test("extractPending reports zero when every conversation fails", () => {
  const db = fixture();
  seedConversation(db, { id: "conv-1" });
  seedConversation(db, { id: "conv-2", endedAt: "2026-09-02T13:00:00.000000Z" });

  const extracted = extractPending(db, {
    limit: 10,
    runExtraction: () => {
      throw new Error("provider unconfigured");
    },
  });

  assert.equal(extracted, 0);
  // Nothing was marked extracted, so the work is still queued for next time.
  assert.equal(countCarriedOverConversations(db), 2);
  db.close();
});

test("extractPending re-entry is idempotent once conversations are extracted", () => {
  const db = fixture();
  seedConversation(db, { id: "conv-1" });
  const run = () =>
    extractPending(db, {
      limit: 10,
      runExtraction: (_db, conversationId) => {
        db.prepare("UPDATE conversations SET metadata = '{\"extracted\": 1}' WHERE id = ?").run(
          conversationId,
        );
      },
    });

  assert.equal(run(), 1);
  assert.equal(run(), 0);
  assert.equal(countCarriedOverConversations(db), 0);
  db.close();
});

// --- maintenance counters ---

test("the maintenance counters report quarantine, parse failures, and carry-over", () => {
  const db = fixture();
  seedConversation(db, { id: "queued" });
  seedConversation(db, { id: "quarantined", metadata: '{"extraction_quarantined": 1}' });
  seedConversation(db, {
    id: "parse-failed",
    metadata: '{"extracted": 1, "extraction_status": "parse_failed"}',
  });

  assert.equal(countQuarantinedConversations(db), 1);
  assert.equal(countConversationsWithExtractionStatus(db, "parse_failed"), 1);
  assert.equal(countConversationsWithExtractionStatus(db, "ok"), 0);
  // Carry-over excludes quarantined and already-extracted conversations.
  assert.equal(countCarriedOverConversations(db), 1);
  db.close();
});
