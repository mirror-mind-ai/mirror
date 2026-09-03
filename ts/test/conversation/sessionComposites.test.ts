// CV22.DS7.US10 slice D — session composite report parity.
//
// `session-start` and `session-maintenance` print their report to the user, so
// parity is string-exact in grammar, labels, step order, and warning tails.
//
// Elapsed seconds are the one exception (Navigator decision 2, 2026-09-03): the
// clock is injected so durations are pinnable, and the comparison normalizes a
// timing token only AFTER proving it matches Python's exact grammar. A
// re-worded label, a missing space, or two decimal places instead of one still
// fails; only the wall-clock number is ignored.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createCloseHooks, maybeGenerateTitle } from "#conversation/closeTail.ts";
import { endConversation } from "#conversation/logger.ts";
import {
  closeStaleOrphans,
  retitlePendingConversations,
  sessionMaintenance,
} from "#conversation/sessionComposites.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import type { LlmProvider, LlmRequest, LlmResponse } from "#providers/llm.ts";

const GOLDEN_PATH = new URL("../goldens/session-composite.golden.json", import.meta.url);

interface Golden {
  meta: { timing_grammar: string };
  scenarios: {
    label: string;
    report_normalized: string;
    steps: { label: string; count: number }[];
  }[];
}

const golden: Golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));

const NOW = "2026-09-03T12:00:00.000000Z";

/** Python renders `f"{label}: {count} ({elapsed:.1f}s)"`. */
const TIMING_RE = /^(?<label>[^:]+): (?<count>\d+) \((?<seconds>\d+\.\d)s\)$/;

/**
 * Replace each timing token with a placeholder, but only after it matches the
 * oracle's grammar. Stripping the token unconditionally would let report drift
 * ride through the one check that exists to catch it.
 */
function normalizeReport(report: string): string {
  return report
    .split("\n")
    .map((line) => {
      if (!line.includes("(") || !line.endsWith("s)")) return line;
      const match = TIMING_RE.exec(line);
      assert.ok(
        match?.groups,
        `timing line does not match Python's grammar: ${JSON.stringify(line)}`,
      );
      return `${match.groups.label}: ${match.groups.count} (<elapsed>s)`;
    })
    .join("\n");
}

class StubProvider implements LlmProvider {
  readonly calls: LlmRequest[] = [];
  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push(request);
    const content =
      request.role === "conversation_title"
        ? "A generated title"
        : request.role === "conversation_tags"
          ? '["alpha"]'
          : request.role === "conversation_summary"
            ? "A summary."
            : "[]";
    return { content, model: "fixture-model" };
  }
}

function fixture(): WritableDatabase {
  const dir = mkdtempSync("/tmp/session-composite-");
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createRuntimeTables(db);
  return db;
}

interface SeedOptions {
  ended: boolean;
  title: string | null;
  metadata: string | null;
  messageCount: number;
  lastMessageAt: string;
  journey?: string | null;
}

function seedConversation(db: WritableDatabase, id: string, options: SeedOptions): void {
  db.prepare(
    "INSERT INTO conversations (id, interface, journey, title, metadata, started_at, ended_at) " +
      "VALUES (?, 'pi', ?, ?, ?, ?, ?)",
  ).run(
    id,
    options.journey === undefined ? "mirror-ts-core" : options.journey,
    options.title,
    options.metadata,
    "2026-09-03T10:00:00.000000Z",
    options.ended ? "2026-09-03T10:30:00.000000Z" : null,
  );
  for (let index = 0; index < options.messageCount; index += 1) {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(
      `${id}-m${String(index).padStart(2, "0")}`,
      id,
      index % 2 === 0 ? "user" : "assistant",
      `line ${index}`,
      options.lastMessageAt,
    );
  }
}

/** A monotonic stub: each read advances a tenth of a second. */
function stubClock(): () => number {
  let ticks = 0;
  return () => {
    ticks += 1;
    return ticks / 10;
  };
}

function maintenanceDeps(llm: LlmProvider) {
  return {
    closeConversation: async (database: WritableDatabase, conversationId: string) => {
      await endConversation(
        database,
        conversationId,
        { extract: true },
        { newId: () => "unused", nowIso: () => NOW },
        createCloseHooks({
          llm,
          runExtraction: () => {
            // Mirrors the generator's stubbed extraction: the pipeline runs and
            // marks the conversation, it just produces no memories.
            const metadata = database
              .prepare("SELECT metadata FROM conversations WHERE id = ?")
              .get(conversationId) as Record<string, unknown>;
            const parsed = metadata.metadata ? JSON.parse(String(metadata.metadata)) : {};
            parsed.extracted = true;
            parsed.extraction_status = "no_signal";
            database
              .prepare("UPDATE conversations SET metadata = ? WHERE id = ?")
              .run(JSON.stringify(parsed), conversationId);
          },
        }),
      );
    },
    retitleConversation: (database: WritableDatabase, conversationId: string) =>
      maybeGenerateTitle(database, conversationId, { llm, source: "startup_maintenance" }),
    runExtraction: () => {},
    backfillPiSessions: () => 0,
    monotonic: stubClock(),
    now: () => NOW,
  };
}

function scenario(label: string) {
  const found = golden.scenarios.find((s) => s.label === label);
  assert.ok(found, `missing golden scenario ${label}`);
  return found;
}

test("maintenance on an empty database reports every step at zero", async () => {
  const db = fixture();
  const report = await sessionMaintenance(db, maintenanceDeps(new StubProvider()));
  assert.equal(normalizeReport(report), scenario("maintenance_empty_database").report_normalized);
  db.close();
});

test("maintenance closes a stale orphan; the close tail already extracted it", async () => {
  const db = fixture();
  seedConversation(db, "conv-orphan", {
    ended: false,
    title: "Provisional title",
    metadata: JSON.stringify({ title_status: "provisional" }),
    messageCount: 4,
    lastMessageAt: "2026-09-03T09:00:00.000000Z",
  });
  const report = await sessionMaintenance(db, maintenanceDeps(new StubProvider()));
  assert.equal(
    normalizeReport(report),
    scenario("maintenance_closes_and_extracts_stale_orphan").report_normalized,
  );
  db.close();
});

test("re-running maintenance is idempotent", async () => {
  const db = fixture();
  seedConversation(db, "conv-orphan", {
    ended: false,
    title: "Provisional title",
    metadata: JSON.stringify({ title_status: "provisional" }),
    messageCount: 4,
    lastMessageAt: "2026-09-03T09:00:00.000000Z",
  });
  const llm = new StubProvider();
  await sessionMaintenance(db, maintenanceDeps(llm));
  const callsAfterFirst = llm.calls.length;

  const report = await sessionMaintenance(db, maintenanceDeps(llm));
  assert.equal(
    normalizeReport(report),
    scenario("maintenance_rerun_is_idempotent").report_normalized,
  );
  // The zero-call property the plan assigned to this slice: a second run over
  // an already-processed home does no model work at all.
  assert.equal(llm.calls.length, callsAfterFirst, "idempotent re-run must make no LLM calls");
  db.close();
});

test("maintenance retitles a pending conversation", async () => {
  const db = fixture();
  seedConversation(db, "conv-retitle", {
    ended: true,
    title: "short...",
    metadata: null,
    messageCount: 4,
    lastMessageAt: "2026-09-03T09:00:00.000000Z",
    journey: null,
  });
  const report = await sessionMaintenance(db, maintenanceDeps(new StubProvider()));
  assert.equal(
    normalizeReport(report),
    scenario("maintenance_retitles_pending_conversation").report_normalized,
  );
  db.close();
});

test("maintenance appends the quarantine warning tail", async () => {
  const db = fixture();
  seedConversation(db, "conv-quarantined", {
    ended: true,
    title: "Quarantined",
    metadata: JSON.stringify({ extraction_quarantined: true }),
    messageCount: 4,
    lastMessageAt: "2026-09-03T09:00:00.000000Z",
  });
  const report = await sessionMaintenance(db, maintenanceDeps(new StubProvider()));
  assert.equal(
    normalizeReport(report),
    scenario("maintenance_reports_quarantine_tail").report_normalized,
  );
  db.close();
});

// --- the normalizer itself --------------------------------------------------

test("the timing normalizer validates the grammar before replacing the value", () => {
  assert.equal(
    normalizeReport("Closed stale conversations: 3 (1.2s)"),
    "Closed stale conversations: 3 (<elapsed>s)",
  );
  // Two decimals, a missing space, and a reworded label must all fail rather
  // than be normalized away.
  assert.throws(() => normalizeReport("Closed stale conversations: 3 (1.25s)"), /does not match/);
  assert.throws(() => normalizeReport("Closed stale conversations: 3(1.2s)"), /does not match/);
  assert.throws(
    () => normalizeReport("Closed stale conversations: three (1.2s)"),
    /does not match/,
  );
});

test("every golden step line is normalized, never written through raw", () => {
  // The generator raises if a step line fails the grammar, so a normalized
  // placeholder in the committed golden IS the proof that Python's real output
  // matched. Nothing carrying a wall-clock value is stored, which is what keeps
  // the golden a determinism gate.
  for (const entry of golden.scenarios) {
    for (const step of entry.steps) {
      assert.ok(
        entry.report_normalized.includes(`${step.label}: ${step.count} (<elapsed>s)`),
        `${entry.label}: ${step.label}`,
      );
    }
    assert.ok(
      !/\(\d+\.\d+s\)/.test(entry.report_normalized),
      `${entry.label} still carries a wall-clock value`,
    );
  }
});

// --- step behavior ----------------------------------------------------------

test("closeStaleOrphans skips conversations bound to an active session", async () => {
  const db = fixture();
  seedConversation(db, "conv-bound", {
    ended: false,
    title: null,
    metadata: null,
    messageCount: 2,
    lastMessageAt: "2026-09-03T09:00:00.000000Z",
  });
  db.prepare(
    "INSERT INTO runtime_sessions (session_id, conversation_id, active, started_at, updated_at) " +
      "VALUES ('s1', 'conv-bound', 1, ?, ?)",
  ).run(NOW, NOW);

  const closed: string[] = [];
  const count = await closeStaleOrphans(db, {
    closeConversation: (_db, id) => {
      closed.push(id);
    },
    now: () => NOW,
  });
  assert.equal(count, 0);
  assert.deepEqual(closed, []);
  db.close();
});

test("closeStaleOrphans pins the 30-minute threshold from both sides", async () => {
  // Without a fixture either side of the boundary, the threshold constant is
  // free to drift: a 3-hour-idle fixture passes at 30 minutes and at 60.
  const db = fixture();
  const minutesAgo = (minutes: number) =>
    new Date(Date.parse(NOW) - minutes * 60_000).toISOString().replace("Z", "000Z");

  seedConversation(db, "conv-29-min-idle", {
    ended: false,
    title: null,
    metadata: null,
    messageCount: 2,
    lastMessageAt: minutesAgo(29),
  });
  seedConversation(db, "conv-31-min-idle", {
    ended: false,
    title: null,
    metadata: null,
    messageCount: 2,
    lastMessageAt: minutesAgo(31),
  });

  const closed: string[] = [];
  const count = await closeStaleOrphans(db, {
    closeConversation: (_db, id) => {
      closed.push(id);
    },
    now: () => NOW,
  });

  assert.equal(count, 1);
  assert.deepEqual(closed, ["conv-31-min-idle"], "only the conversation past 30 minutes closes");
  db.close();
});

test("closeStaleOrphans counts an orphan whose close tail throws", async () => {
  // `ended_at` is written before the tail, so the orphan IS closed; a failing
  // tail must neither stop the loop nor under-report the work.
  const db = fixture();
  seedConversation(db, "conv-a", {
    ended: false,
    title: null,
    metadata: null,
    messageCount: 2,
    lastMessageAt: "2026-09-03T09:00:00.000000Z",
  });
  seedConversation(db, "conv-b", {
    ended: false,
    title: null,
    metadata: null,
    messageCount: 2,
    lastMessageAt: "2026-09-03T09:00:00.000000Z",
  });

  const count = await closeStaleOrphans(db, {
    closeConversation: () => {
      throw new Error("tail failed");
    },
    now: () => NOW,
  });
  assert.equal(count, 2);
  db.close();
});

test("retitlePendingConversations honours its limit and skips clean titles", async () => {
  const db = fixture();
  for (let index = 0; index < 4; index += 1) {
    seedConversation(db, `conv-${index}`, {
      ended: true,
      title: "weak...",
      metadata: null,
      messageCount: 2,
      lastMessageAt: "2026-09-03T09:00:00.000000Z",
    });
  }
  const attempted: string[] = [];
  const changed = await retitlePendingConversations(db, {
    limit: 2,
    retitleConversation: (_db, id) => {
      attempted.push(id);
      return true;
    },
  });
  assert.equal(changed, 2);
  assert.equal(attempted.length, 2, "the loop stops once the limit is reached");

  assert.equal(
    await retitlePendingConversations(db, { limit: 0, retitleConversation: () => true }),
    0,
  );
  db.close();
});

test("retitlePendingConversations swallows a per-conversation failure", async () => {
  const db = fixture();
  seedConversation(db, "conv-a", {
    ended: true,
    title: "weak...",
    metadata: null,
    messageCount: 2,
    lastMessageAt: "2026-09-03T09:00:00.000000Z",
  });
  seedConversation(db, "conv-b", {
    ended: true,
    title: "weak...",
    metadata: null,
    messageCount: 2,
    lastMessageAt: "2026-09-03T09:00:00.000000Z",
  });

  let seen = 0;
  const changed = await retitlePendingConversations(db, {
    retitleConversation: () => {
      seen += 1;
      if (seen === 1) throw new Error("provider outage");
      return true;
    },
  });
  assert.equal(changed, 1, "the batch continues past a failed conversation");
  db.close();
});
