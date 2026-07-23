import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { renderDetectPersona } from "../../src/frontDoor/render/detectPersona.ts";
import { renderJourney } from "../../src/frontDoor/render/journeys.ts";
import { renderMemoryRow, tagsText } from "../../src/frontDoor/render/memories.ts";
import type { MemorySummary } from "../../src/memory/listing.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

test("tagsText handles arrays, non-arrays, malformed JSON, and null", () => {
  assert.equal(tagsText('["a", "b"]'), "a, b");
  assert.equal(tagsText('["a", 2, "b"]'), "a, b"); // non-strings dropped
  assert.equal(tagsText('{"not": "array"}'), "");
  assert.equal(tagsText("{malformed"), "");
  assert.equal(tagsText(null), "");
});

test("renderJourney formats root and child rows with the right icon and indent", () => {
  const root = renderJourney({
    id: "demo",
    name: "Demo",
    status: "active",
    parent_journey: "",
    stage: "E2",
    description: "desc",
  });
  assert.deepEqual(root, ["🚧 **demo** (active)", "  Stage: E2", "  desc", ""]);

  const child = renderJourney(
    {
      id: "kid",
      name: "Kid",
      status: "paused",
      parent_journey: "demo",
      stage: "—",
      description: "",
    },
    true,
  );
  assert.deepEqual(child, ["  └─ ⏸ **kid** (paused)", "       Stage: —", ""]);
});

test("renderMemoryRow truncates content at 200 chars and omits absent fields", () => {
  const memory: MemorySummary = {
    id: "abcdefgh1234",
    memory_type: "insight",
    layer: "ego",
    title: "T",
    content: "x".repeat(250),
    context: null,
    journey: null,
    persona: null,
    tags: null,
    created_at: "2026-07-01T00:00:00Z",
  };
  const lines = renderMemoryRow(memory);
  assert.equal(lines[0], "💡 **T**");
  assert.equal(lines[1], "  2026-07-01 | `abcdefgh` | insight [ego]"); // no journey/persona
  assert.equal(lines[2], `  ${"x".repeat(200)}`); // truncated to 200
  assert.ok(!lines.some((l) => l.startsWith("  🏷"))); // no tags line
});

function personaDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-render-unit-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const db = openDatabaseCopyForWrite(join(tmpDir, "copy.db"));
  createIdentityTable(db);
  db.prepare(
    "INSERT INTO identity (id, layer, key, content, created_at, updated_at, metadata) " +
      "VALUES (?, 'persona', ?, '#', 't', 't', ?)",
  ).run("p1", "engineer", '{"routing_keywords": ["code", "refactor"]}');
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("renderDetectPersona strips --db-path and --mirror-home from the query (leak fix)", () => {
  const { db, cleanup } = personaDb();
  try {
    const out = renderDetectPersona(db, ["code", "--db-path", "/x/y.db", "--mirror-home", "/h"]);
    assert.equal(out, "query: code\n  engineer score=1 match=keyword\n");
  } finally {
    db.close();
    cleanup();
  }
});
