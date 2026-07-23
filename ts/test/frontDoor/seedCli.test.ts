import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseReadOnly } from "../../src/db/database.ts";
import { spawnFrontDoor } from "../helpers/frontDoor.ts";

function scratchMirrorHome(): { home: string; cleanup: () => void } {
  const home = mkdtempSync(join(tmpdir(), "mirror-core-seedcli-"));
  const identity = join(home, "identity");
  mkdirSync(join(identity, "self"), { recursive: true });
  mkdirSync(join(identity, "ego"), { recursive: true });
  mkdirSync(join(identity, "user"), { recursive: true });
  mkdirSync(join(identity, "personas"), { recursive: true });
  writeFileSync(join(identity, "self", "soul.yaml"), "version: '1.0.0'\nsoul: Soul content.\n");
  writeFileSync(join(identity, "ego", "identity.yaml"), "identity: Ego content.\n");
  writeFileSync(join(identity, "ego", "behavior.yaml"), "behavior: Behavior content.\n");
  writeFileSync(join(identity, "user", "identity.yaml"), "user: User content.\n");
  writeFileSync(
    join(identity, "personas", "engineer.yaml"),
    "persona_id: engineer\nsystem_prompt: Engineer prompt.\nrouting_keywords:\n  - code\n",
  );
  return { home, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

test("front door `seed --mirror-home` creates core identity + personas, reports the summary, exits 0", () => {
  const { home, cleanup } = scratchMirrorHome();
  try {
    // --env pinned explicitly: --mirror-home already forces the db path to
    // <home>/memory.db regardless of --env (verified oracle behavior), so this
    // only fixes the printed "Seeding identity into [...]" text, making the
    // assertion independent of the ambient MEMORY_ENV (CI sets it to "test";
    // a bare local shell typically has it unset, defaulting to "production").
    const result = spawnFrontDoor(["seed", "--mirror-home", home, "--env", "production"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Seeding identity into \[production\]\.\.\./);
    assert.match(result.stdout, /Mirror home: /);
    assert.match(result.stdout, /Identity root: /);
    assert.match(result.stdout, /\u2713 self\/soul/);
    assert.match(result.stdout, /\u2713 persona\/engineer/);
    assert.match(result.stdout, /Result: 5 created, 0 updated, 0 skipped/);

    const db = openDatabaseReadOnly(join(home, "memory.db"));
    const row = db.prepare("SELECT content FROM identity WHERE layer='self' AND key='soul'").get();
    db.close();
    assert.equal(row?.content, "Soul content.");
  } finally {
    cleanup();
  }
});

test("front door `seed` skips existing entries by default and reports them, then --force overwrites", () => {
  const { home, cleanup } = scratchMirrorHome();
  try {
    spawnFrontDoor(["seed", "--mirror-home", home]);
    writeFileSync(join(home, "identity", "self", "soul.yaml"), "soul: Changed soul content.\n");

    const skipped = spawnFrontDoor(["seed", "--mirror-home", home]);
    assert.equal(skipped.status, 0);
    assert.match(skipped.stdout, /Result: 0 created, 0 updated, 5 skipped/);

    const forced = spawnFrontDoor(["seed", "--mirror-home", home, "--force"]);
    assert.equal(forced.status, 0);
    assert.match(forced.stdout, /overwritten from YAML files/);
    assert.match(forced.stdout, /Result: 0 created, 5 updated, 0 skipped/);

    const db = openDatabaseReadOnly(join(home, "memory.db"));
    const row = db.prepare("SELECT content FROM identity WHERE layer='self' AND key='soul'").get();
    db.close();
    assert.equal(row?.content, "Changed soul content.");
  } finally {
    cleanup();
  }
});

test("front door `seed` exits 1 and reports errors when a required core file is missing", () => {
  const { home, cleanup } = scratchMirrorHome();
  try {
    rmSync(join(home, "identity", "ego", "behavior.yaml"));
    const result = spawnFrontDoor(["seed", "--mirror-home", home]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Errors: 1/);
    assert.match(result.stdout, /ego\/behavior: File not found/);
  } finally {
    cleanup();
  }
});

test("front door `seed --mirror-home X --env test` still writes memory.db, not memory_test.db", () => {
  const { home, cleanup } = scratchMirrorHome();
  try {
    const result = spawnFrontDoor(["seed", "--mirror-home", home, "--env", "test"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Seeding identity into \[test\]\.\.\./);
    const db = openDatabaseReadOnly(join(home, "memory.db"));
    const count = db.prepare("SELECT COUNT(*) AS c FROM identity").get()?.c;
    db.close();
    assert.ok(Number(count) > 0, "expected memory.db (not memory_test.db) to hold the seeded rows");
  } finally {
    cleanup();
  }
});
