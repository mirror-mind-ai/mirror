import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { loadMirrorContext } from "#mirror/context.ts";
import { listActiveMirrorJourneys, titleFromSummary } from "#mirror/orchestration.ts";
import { renderMirrorModeTransition } from "#mirror/render.ts";

interface Golden {
  identities: { layer: string; key: string; content: string }[];
  context: string;
  transition: string;
  active_journeys: { id: string; name: string; description: string }[];
  titles: { summary: string; expected: string }[];
}

const golden = JSON.parse(
  readFileSync(new URL("../goldens/mirror-mode.golden.json", import.meta.url), "utf8"),
) as Golden;

function fixture() {
  const dir = mkdtempSync("/tmp/mirror-golden-");
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createIdentityTable(db);
  const insert = db.prepare(
    "INSERT INTO identity (id, layer, key, content, created_at, updated_at) VALUES (?, ?, ?, ?, 't', 't')",
  );
  golden.identities.forEach((row, index) => {
    insert.run(String(index), row.layer, row.key, row.content);
  });
  return db;
}

test("TS context composition reproduces the committed Python Mirror oracle", async () => {
  const db = fixture();
  assert.equal(
    await loadMirrorContext(db, {
      persona: "engineer",
      journey: "selected",
      touchesIdentity: true,
      touchesShadow: true,
    }),
    golden.context,
  );
  db.close();
});

test("TS Mirror transition reproduces the committed Python surface byte-for-byte", () => {
  assert.equal(
    renderMirrorModeTransition({
      identity: "mirror-dev",
      journey: "selected",
      personas: ["writer", "engineer"],
    }),
    golden.transition,
  );
});

test("TS active journey rendering and title rules reproduce Python", () => {
  const db = fixture();
  const expected = golden.active_journeys
    .map((row) => `- **${row.id}** — ${row.name}: ${row.description}\n`)
    .join("");
  assert.equal(listActiveMirrorJourneys(db), expected);
  for (const probe of golden.titles) assert.equal(titleFromSummary(probe.summary), probe.expected);
  db.close();
});
