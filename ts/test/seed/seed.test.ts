import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { runSeed } from "../../src/seed/seed.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-seed-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createIdentityTable(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Build a minimal identity template tree: only the 4 required core files by
 * default, so the "missing non-required file is a silent no-op" branch is
 * exercised by construction, not by accident. */
function buildIdentityRoot(root: string, options: { includeOptionalCore?: boolean } = {}): void {
  mkdirSync(join(root, "self"), { recursive: true });
  mkdirSync(join(root, "ego"), { recursive: true });
  mkdirSync(join(root, "user"), { recursive: true });
  writeFileSync(join(root, "self", "soul.yaml"), "version: '1.0.0'\nsoul: Soul content.\n");
  writeFileSync(
    join(root, "ego", "identity.yaml"),
    "version: '1.0.0'\nidentity: Ego identity content.\n",
  );
  writeFileSync(
    join(root, "ego", "behavior.yaml"),
    "version: '1.0.0'\nbehavior: Behavior content.\n",
  );
  writeFileSync(join(root, "user", "identity.yaml"), "version: '1.0.0'\nuser: User content.\n");
  if (options.includeOptionalCore) {
    writeFileSync(
      join(root, "ego", "constraints.yaml"),
      "version: '1.0.0'\nconstraints: Constraints content.\n",
    );
  }
}

function rowContent(db: WritableDatabase, layer: string, key: string): string | undefined {
  return db.prepare("SELECT content FROM identity WHERE layer = ? AND key = ?").get(layer, key)
    ?.content as string | undefined;
}

test("runSeed creates the 4 required core entries and silently skips missing optional ones", () => {
  const { db, cleanup } = tempDb();
  const root = mkdtempSync(join(tmpdir(), "mirror-core-seedroot-"));
  try {
    buildIdentityRoot(root); // no optional core files, no personas/, no journeys/
    const result = runSeed(db, root);
    assert.equal(result.created, 4);
    assert.equal(result.updated, 0);
    assert.equal(result.skipped, 0);
    // Missing, non-required files (ego/constraints, ego/expression,
    // organization/*, shadow/profile) produce NO error and NO line at all.
    assert.deepEqual(result.errors, []);
    assert.equal(result.lines.length, 4);
    assert.equal(rowContent(db, "self", "soul"), "Soul content.");
    assert.equal(rowContent(db, "ego", "behavior"), "Behavior content.");
  } finally {
    db.close();
    cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test("runSeed records a required-file miss as an error, but stays silent for a non-required miss", () => {
  const { db, cleanup } = tempDb();
  const root = mkdtempSync(join(tmpdir(), "mirror-core-seedroot2-"));
  try {
    mkdirSync(join(root, "self"), { recursive: true });
    // Only self/soul.yaml exists; ego/identity, ego/behavior, user/identity
    // (all required) are missing, alongside the non-required ones.
    writeFileSync(join(root, "self", "soul.yaml"), "soul: Soul content.\n");
    const result = runSeed(db, root);
    assert.equal(result.created, 1);
    assert.equal(result.errors.length, 3);
    assert.ok(result.errors.every((e) => e.includes("File not found")));
    assert.ok(result.errors.some((e) => e.startsWith("ego/identity:")));
    assert.ok(result.errors.some((e) => e.startsWith("ego/behavior:")));
    assert.ok(result.errors.some((e) => e.startsWith("user/identity:")));
    // Only required misses get a printed line; non-required misses (ego/
    // constraints, ego/expression, organization/*, shadow/profile) do not.
    assert.equal(result.lines.length, 1 + 3);
  } finally {
    db.close();
    cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test("runSeed skips an existing entry by default, but overwrites with force", () => {
  const { db, cleanup } = tempDb();
  const root = mkdtempSync(join(tmpdir(), "mirror-core-seedroot3-"));
  try {
    buildIdentityRoot(root);
    runSeed(db, root); // first pass: creates
    writeFileSync(
      join(root, "self", "soul.yaml"),
      "version: '1.0.0'\nsoul: Changed soul content.\n",
    );

    const skipped = runSeed(db, root);
    assert.equal(skipped.created, 0);
    assert.equal(skipped.updated, 0);
    assert.equal(skipped.skipped, 4);
    assert.equal(rowContent(db, "self", "soul"), "Soul content.", "skip must not overwrite");

    const forced = runSeed(db, root, { force: true });
    assert.equal(forced.updated, 4);
    assert.equal(forced.skipped, 0);
    assert.equal(rowContent(db, "self", "soul"), "Changed soul content.");
  } finally {
    db.close();
    cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test("runSeed records empty-content as an error without a printed line, and continues", () => {
  const { db, cleanup } = tempDb();
  const root = mkdtempSync(join(tmpdir(), "mirror-core-seedroot4-"));
  try {
    mkdirSync(join(root, "self"), { recursive: true });
    mkdirSync(join(root, "ego"), { recursive: true });
    mkdirSync(join(root, "user"), { recursive: true });
    writeFileSync(join(root, "self", "soul.yaml"), "soul: ''\n"); // present but empty
    writeFileSync(join(root, "ego", "identity.yaml"), "identity: Ego content.\n");
    writeFileSync(join(root, "ego", "behavior.yaml"), "behavior: Behavior content.\n");
    writeFileSync(join(root, "user", "identity.yaml"), "user: User content.\n");
    const result = runSeed(db, root);
    assert.equal(result.created, 3);
    assert.deepEqual(result.errors, ["self/soul: empty content"]);
    // The empty-content branch has NO print line (only 3 create lines total).
    assert.equal(result.lines.length, 3);
  } finally {
    db.close();
    cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test("runSeed scans personas/ sorted by filename, creates from YAML, and skips a persona with no personas/ dir", () => {
  const { db, cleanup } = tempDb();
  const root = mkdtempSync(join(tmpdir(), "mirror-core-seedroot5-"));
  try {
    buildIdentityRoot(root);
    mkdirSync(join(root, "personas"), { recursive: true });
    writeFileSync(
      join(root, "personas", "writer.yaml"),
      "persona_id: writer\nsystem_prompt: Writer prompt.\nrouting_keywords:\n  - prose\n",
    );
    writeFileSync(
      join(root, "personas", "engineer.yaml"),
      "persona_id: engineer\nsystem_prompt: Engineer prompt.\n",
    );
    const result = runSeed(db, root);
    assert.equal(result.created, 4 + 2);
    // Scanned in filename order (engineer.yaml before writer.yaml), not
    // declaration order.
    const personaLines = result.lines.filter((l) => l.includes("persona/"));
    assert.deepEqual(personaLines, ["  \u2713 persona/engineer", "  \u2713 persona/writer"]);
    const metadata = JSON.parse(
      db.prepare("SELECT metadata FROM identity WHERE layer='persona' AND key='writer'").get()
        ?.metadata as string,
    );
    assert.deepEqual(metadata.routing_keywords, ["prose"]);
  } finally {
    db.close();
    cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test("runSeed scans journeys/ and skips entirely when the directory is absent", () => {
  const { db, cleanup } = tempDb();
  const root = mkdtempSync(join(tmpdir(), "mirror-core-seedroot6-"));
  try {
    buildIdentityRoot(root);
    mkdirSync(join(root, "journeys"), { recursive: true });
    writeFileSync(
      join(root, "journeys", "personal-growth.yaml"),
      "journey_id: personal-growth\nname: Personal Growth\nstatus: active\n",
    );
    const withJourneys = runSeed(db, root);
    assert.equal(withJourneys.created, 4 + 1);
    assert.ok(rowContent(db, "journey", "personal-growth")?.includes("Personal Growth"));
  } finally {
    db.close();
    cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test("runSeed records a persona-scan error against that persona only, without aborting the batch", () => {
  const { db, cleanup } = tempDb();
  const root = mkdtempSync(join(tmpdir(), "mirror-core-seedroot7-"));
  try {
    buildIdentityRoot(root);
    mkdirSync(join(root, "personas"), { recursive: true });
    // Malformed YAML (unterminated flow mapping) throws inside the parser.
    writeFileSync(join(root, "personas", "broken.yaml"), "persona_id: [unterminated\n");
    writeFileSync(join(root, "personas", "fine.yaml"), "persona_id: fine\nsystem_prompt: OK.\n");
    const result = runSeed(db, root);
    assert.equal(result.created, 4 + 1); // fine.yaml still creates
    assert.equal(result.errors.length, 1);
    assert.ok(result.errors[0].startsWith("persona/broken:"));
  } finally {
    db.close();
    cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});
