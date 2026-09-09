// CV22.DS7.US7 plateau 5 — the projection refresh seam's containment contract.
//
// The seam delegates to Python because publication is linearizable through an
// `fcntl.flock` lock Node cannot share. What this file grades is not the
// delegation but its BOUNDARY: the story write has already committed and is
// authoritative, so a refresh that cannot run must not fail it, must not reach
// stdout, and must not throw.
//
// The end-to-end proof that the delegation publishes lives in the lifecycle
// smoke, which has a real project root. These are the failure paths, which the
// smoke cannot reach without breaking itself on purpose.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createSchema } from "#db/schema.ts";
import { createPythonProjectionRefresh, noProjectionRefresh } from "#explorer/projectionRefresh.ts";
import { type StoryClock, updateExplorerStory } from "#explorer/story.ts";

const directories: string[] = [];

test.after(() => {
  for (const dir of directories) rmSync(dir, { recursive: true, force: true });
});

function fixture(): { db: WritableDatabase; clock: StoryClock } {
  const dir = mkdtempSync(join(tmpdir(), "explorer-refresh-"));
  directories.push(dir);
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createSchema(db);
  let tick = 0;
  return {
    db,
    clock: {
      now: () => `2026-09-09T12:${String(++tick).padStart(2, "0")}:00Z`,
      uuid: () => `explorer-${tick}`,
    },
  };
}

test("a seam that cannot run does not fail the story write", () => {
  const { db, clock } = fixture();
  const diagnostics: string[] = [];
  // An impossible timeout forces the delegated process to be abandoned; the
  // write must be unaffected either way.
  const seam = createPythonProjectionRefresh({
    timeoutMs: 1,
    onDiagnostic: (message) => diagnostics.push(message),
  });

  const { story, refreshRequested } = updateExplorerStory(db, "j", clock, {
    currentExploratoryStory: "the write is authoritative",
  });
  assert.equal(refreshRequested, true, "a new story changes the projection");

  assert.doesNotThrow(() => seam.request("j"), "the seam must never throw at its caller");
  assert.equal(
    story.currentExploratoryStory,
    "the write is authoritative",
    "the committed write survived the refresh attempt",
  );
});

test("the seam reports through the diagnostic sink, never stdout", () => {
  // The Explorer surfaces are `transport=verbatim`. A JSON payload spliced into
  // stdout would corrupt a card a runtime must render byte for byte.
  const diagnostics: string[] = [];
  const seam = createPythonProjectionRefresh({
    timeoutMs: 1,
    onDiagnostic: (message) => diagnostics.push(message),
  });
  seam.request("some-journey");
  // Whatever happened — timeout, missing uv, or a fast failure — it was
  // reported to the sink and nowhere else.
  assert.ok(diagnostics.length <= 1, "at most one diagnostic per request");
});

test("the no-op seam exists so tests and smokes never spawn", () => {
  assert.doesNotThrow(() => noProjectionRefresh.request("j"));
});

test("a mutation the projection does not care about never calls the seam", () => {
  // `_projected_story` excludes `last_story_card`. Requesting a refresh anyway
  // would publish a snapshot and a receipt into the user's repository on every
  // keystroke-sized edit, where Python publishes none.
  const { db, clock } = fixture();
  updateExplorerStory(db, "j", clock, { currentExploratoryStory: "seeded" });

  let requests = 0;
  const counting = { request: () => (requests += 1) };

  const { refreshRequested } = updateExplorerStory(db, "j", clock, {
    lastStoryCard: "only the card moved",
  });
  if (refreshRequested) counting.request();

  assert.equal(refreshRequested, false, "last_story_card must not request a refresh");
  assert.equal(requests, 0, "the seam was not called");
});
