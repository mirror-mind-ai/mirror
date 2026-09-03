// CV22.DS7.US10 slice E — journey inference, diagnosis, and the mutating repair.
//
// `repair-journeys --apply` rewrites the `journey` column of conversations the
// user never explicitly assigned, so a false positive silently moves someone's
// conversation into the wrong journey. The inference is therefore graded case
// by case against the Python oracle, and the mutation is graded as before/after
// state on a copy — never against a real database.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  activationText,
  inferJourneyForConversation,
  journeyAliases,
} from "#conversation/journeyInference.ts";
import {
  diagnoseJourneyAssociations,
  type JourneyFinding,
  renderJourneyFindings,
} from "#conversation/journeyRepair.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";

const GOLDEN_PATH = new URL("../goldens/journey-repair.golden.json", import.meta.url);

interface Golden {
  journeys: Record<string, string>;
  aliases: Record<string, string[]>;
  inference: {
    label: string;
    title: string | null;
    first_user: string;
    activation_text: string;
    journey: string | null;
    reason: string | null;
  }[];
  repair: {
    seeds: {
      id: string;
      started_at: string;
      title: string | null;
      first_user: string;
      message_count: number;
    }[];
    journey_before: Record<string, string | null>;
    dry_run_findings: JourneyFinding[];
    journey_after_dry_run: Record<string, string | null>;
    limited_findings: JourneyFinding[];
    applied_findings: JourneyFinding[];
    journey_after_apply: Record<string, string | null>;
    rendered: { dry_run: string; applied: string };
  };
}

const golden: Golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));

function fixture(): WritableDatabase {
  const dir = mkdtempSync("/tmp/journey-repair-");
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createRuntimeTables(db);
  db.exec(
    `CREATE TABLE IF NOT EXISTS identity (
       id TEXT PRIMARY KEY, layer TEXT NOT NULL, key TEXT NOT NULL,
       content TEXT, metadata TEXT, updated_at TEXT
     )`,
  );
  let counter = 0;
  for (const [slug, content] of Object.entries(golden.journeys)) {
    counter += 1;
    db.prepare(
      "INSERT INTO identity (id, layer, key, content, updated_at) VALUES (?, 'journey', ?, ?, ?)",
    ).run(`id-${counter}`, slug, content, "2026-09-03T12:00:00.000000Z");
  }
  return db;
}

function seedRepairCorpus(db: WritableDatabase): void {
  for (const seed of golden.repair.seeds) {
    db.prepare(
      "INSERT INTO conversations (id, interface, journey, title, started_at) VALUES (?, 'pi', NULL, ?, ?)",
    ).run(seed.id, seed.title, seed.started_at);
    for (let index = 0; index < seed.message_count; index += 1) {
      db.prepare(
        "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(
        `${seed.id}-m${String(index).padStart(2, "0")}`,
        seed.id,
        index % 2 === 0 ? "user" : "assistant",
        index === 0 ? seed.first_user : `line ${index}`,
        `2026-09-03T12:00:${String(index).padStart(2, "0")}.000000Z`,
      );
    }
  }
}

function journeyState(db: WritableDatabase): Record<string, string | null> {
  const rows = db.prepare("SELECT id, journey FROM conversations ORDER BY id").all() as Record<
    string,
    unknown
  >[];
  return Object.fromEntries(
    rows.map((row) => [String(row.id), row.journey === null ? null : String(row.journey)]),
  );
}

test("alias table matches the Python oracle", () => {
  const db = fixture();
  assert.deepEqual(journeyAliases(db), golden.aliases);
  db.close();
});

for (const entry of golden.inference) {
  test(`journey inference parity: ${entry.label}`, () => {
    const db = fixture();
    assert.equal(activationText(entry.title, entry.first_user), entry.activation_text);
    const result = inferJourneyForConversation(entry.title, entry.first_user, journeyAliases(db));
    assert.equal(result.journey, entry.journey);
    assert.equal(result.reason, entry.reason);
    db.close();
  });
}

test("an alias sharing a display heading is refused, not guessed", () => {
  // The guard that stops `--apply` writing an arbitrary one of two equally
  // plausible journeys.
  const entry = golden.inference.find((e) => e.label === "ambiguous_shared_alias_refuses");
  assert.ok(entry);
  assert.equal(entry.journey, null);
  const sharing = Object.entries(golden.aliases).filter(([, values]) =>
    values.includes("duplicate title"),
  );
  assert.equal(sharing.length, 2, "the fixture must actually create the tie it claims");
});

test("diagnosis is read-only and matches the oracle findings", () => {
  const db = fixture();
  seedRepairCorpus(db);
  assert.deepEqual(journeyState(db), golden.repair.journey_before);

  const findings = diagnoseJourneyAssociations(db, { apply: false });
  assert.deepEqual(findings, golden.repair.dry_run_findings);
  // The dry run must not have touched a single row.
  assert.deepEqual(journeyState(db), golden.repair.journey_after_dry_run);
  db.close();
});

test("the limit is applied to the scan, matching the oracle", () => {
  const db = fixture();
  seedRepairCorpus(db);
  assert.deepEqual(
    diagnoseJourneyAssociations(db, { apply: false, limit: 2 }),
    golden.repair.limited_findings,
  );
  db.close();
});

test("apply writes exactly the dry-run findings, proven before and after", () => {
  const db = fixture();
  seedRepairCorpus(db);

  const preview = diagnoseJourneyAssociations(db, { apply: false });
  const before = journeyState(db);
  assert.deepEqual(before, golden.repair.journey_before);

  let backups = 0;
  const applied = diagnoseJourneyAssociations(db, {
    apply: true,
    backup: () => {
      backups += 1;
      return "/tmp/fixture-backup.zip";
    },
  });

  assert.equal(backups, 1, "the repair must take a backup before mutating");
  assert.deepEqual(applied, golden.repair.applied_findings);
  // The dry run was a trustworthy preview: same conversations, same journeys.
  assert.deepEqual(
    preview.map((f) => [f.conversation_id, f.journey]),
    applied.map((f) => [f.conversation_id, f.journey]),
  );
  assert.deepEqual(journeyState(db), golden.repair.journey_after_apply);

  // Only the matched conversations moved; everything else is untouched.
  for (const [id, journey] of Object.entries(before)) {
    const matched = applied.find((f) => f.conversation_id === id);
    if (!matched) assert.equal(journeyState(db)[id], journey, `${id} must not change`);
  }
  db.close();
});

test("apply refuses when the backup fails", () => {
  const db = fixture();
  seedRepairCorpus(db);
  const before = journeyState(db);

  assert.throws(
    () => diagnoseJourneyAssociations(db, { apply: true, backup: () => null }),
    /Database backup failed; refusing to repair conversations\./,
  );
  assert.deepEqual(journeyState(db), before, "a failed backup must leave the database untouched");

  // Same refusal when no backup mechanism was wired at all: the gate is not
  // optional just because a caller forgot it.
  assert.throws(
    () => diagnoseJourneyAssociations(db, { apply: true }),
    /Database backup failed; refusing to repair conversations\./,
  );
  assert.deepEqual(journeyState(db), before);
  db.close();
});

test("apply with no findings neither backs up nor writes", () => {
  const db = fixture();
  db.prepare(
    "INSERT INTO conversations (id, interface, journey, title, started_at) VALUES ('lonely', 'pi', NULL, NULL, ?)",
  ).run("2026-09-03T12:00:00.000000Z");

  let backups = 0;
  const findings = diagnoseJourneyAssociations(db, {
    apply: true,
    backup: () => {
      backups += 1;
      return "/tmp/unused.zip";
    },
  });
  assert.deepEqual(findings, []);
  assert.equal(backups, 0, "Python only backs up when there is something to repair");
  db.close();
});

test("findings render exactly like Python", () => {
  assert.equal(
    renderJourneyFindings(golden.repair.dry_run_findings, false),
    golden.repair.rendered.dry_run,
  );
  assert.equal(
    renderJourneyFindings(golden.repair.applied_findings, true),
    golden.repair.rendered.applied,
  );
});

test("an alias on a non-final activation line never matches standalone", () => {
  // Python's `$` without MULTILINE means end of string, not end of every line.
  // A JavaScript `m` flag here would widen the rule that decides what `--apply`
  // rewrites, so this pins the distinction with the one shape that separates
  // them: the alias as the TITLE, with a different first user line after it.
  //
  // (Note `_activation_text` keeps only the title and the first user line, so a
  // long message's later lines are never scanned at all -- which is why the
  // discriminating case has to be built this way.)
  const db = fixture();
  const aliases = journeyAliases(db);

  assert.equal(activationText("alpha-one", "some other text"), "alpha-one\nsome other text");
  assert.equal(
    inferJourneyForConversation("alpha-one", "some other text", aliases).journey,
    null,
    "an alias on a non-final line must not match; an `m` flag would match it",
  );
  // The same alias as the final line does match.
  assert.equal(inferJourneyForConversation(null, "alpha-one", aliases).journey, "alpha-one");
  db.close();
});
