import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openDatabaseCopyForWrite } from "#db/database.ts";
import { createSchema } from "#db/schema.ts";
import {
  formatSearchResults,
  resolveSearchEmbeddingProvider,
  runMemorySearchRoute,
  type SearchMemoryRow,
} from "#frontDoor/searchRoute.ts";
import { LiveEmbeddingProvider, ReplayEmbeddingProvider } from "#providers/embedding.ts";

const DEGRADED_NOTE =
  "⚠ Degraded: lexical-only search (embedding unavailable — offline or no API key).";

function row(overrides: Partial<SearchMemoryRow> = {}): SearchMemoryRow {
  return {
    id: "m1",
    memory_type: "insight",
    layer: "ego",
    title: "Test Memory",
    content: "some content here",
    created_at: "2026-01-01T00:00:00Z",
    journey: null,
    tags: null,
    ...overrides,
  };
}

test("formatSearchResults: no results, not degraded -> unchanged legacy message", () => {
  const output = formatSearchResults("q", [], new Map(), false);
  assert.equal(output, "No memories found.\n");
});

test("formatSearchResults: no results, degraded -> the degraded note stands alone (AI-04)", () => {
  const output = formatSearchResults("q", [], new Map(), true);
  assert.equal(output, `${DEGRADED_NOTE}\n`);
});

test("formatSearchResults: results + degraded -> degraded note precedes the results header", () => {
  const results = [{ id: "m1", score: 0.5 }];
  const rows = new Map([["m1", row()]]);

  const output = formatSearchResults("q", results, rows, true);

  const notePos = output.indexOf(DEGRADED_NOTE);
  const headerPos = output.indexOf('🔍 Search: "q"');
  assert.ok(notePos >= 0 && headerPos > notePos);
  assert.match(output, /Ranked by keyword match\./);
  assert.match(output, /Test Memory/);
});

test("formatSearchResults: results + not degraded -> no degraded text at all (unchanged shape)", () => {
  const results = [{ id: "m1", score: 0.5 }];
  const rows = new Map([["m1", row()]]);

  const output = formatSearchResults("q", results, rows, false);

  assert.ok(!output.includes("Degraded"));
  assert.ok(!output.includes("Ranked by keyword match"));
  assert.match(output, /🔍 Search: "q" \(1 results\)/);
  assert.match(output, /Test Memory/);
});

// --- CV22.DS8.US1: the route must pick the transport the router announced ---

test("with nothing configured the search route builds the LIVE provider", async () => {
  // The router says engine=ts/live and the route builds the provider. Those
  // are two decisions in two files reading the same variables, and nothing
  // before this test made them agree -- a route that kept loading a replay
  // fixture while the router reported "live" would have been invisible.
  const provider = await resolveSearchEmbeddingProvider({} as NodeJS.ProcessEnv);

  assert.ok(provider instanceof LiveEmbeddingProvider);
});

test("a replay fixture makes the search route build the REPLAY provider", async () => {
  const fixture = join(tmpdir(), `ds8-us1-replay-${process.pid}.json`);
  await writeFile(
    fixture,
    JSON.stringify({ kind: "embedding", response: { embedding: [0.1, 0.2, 0.3] } }),
  );
  try {
    const provider = await resolveSearchEmbeddingProvider({
      MIRROR_TS_SEARCH_EMBEDDING_REPLAY: fixture,
    } as NodeJS.ProcessEnv);

    assert.ok(provider instanceof ReplayEmbeddingProvider);
    assert.deepEqual((await provider.embed("x")).vector, [0.1, 0.2, 0.3]);
  } finally {
    await rm(fixture, { force: true });
  }
});

test("the live provider is built even with no API key, so the route can degrade", async () => {
  // Construction must not throw: the missing-key failure has to happen inside
  // the search, where it becomes a lexical-only degrade instead of a crash.
  const provider = await resolveSearchEmbeddingProvider({
    OPENROUTER_API_KEY: "",
  } as NodeJS.ProcessEnv);

  assert.ok(provider instanceof LiveEmbeddingProvider);
});

test("memories --search does not reinforce retrieval (AI-12 parity)", async () => {
  // Python's cli/memories.py passes log_access=False; this port did not, and
  // reinforced on every exploratory search from the DS5 flip (2026-07-16) until
  // CV22.DS9.US2 measured it against the oracle. access_count feeds
  // reinforcement_score and the hybrid ranker, so the ranker was learning from
  // its own exhaust — the exact defect AI-12 fixed in Python.
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-search-reinforce-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  try {
    createSchema(db);
    db.prepare(
      "INSERT INTO memories (id, title, content, memory_type, layer, created_at, embedding) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "m-reinforce",
      "Nomad freedom",
      "digital nomad freedom content",
      "insight",
      "ego",
      "2026-01-01T00:00:00Z",
      Buffer.from(new Float32Array(Array.from({ length: 1536 }, (_, i) => (i % 7) / 10)).buffer),
    );

    const accessRows = () =>
      Number(db.prepare("SELECT COUNT(*) AS n FROM memory_access_log").get()?.n ?? -1);
    const before = accessRows();

    await runMemorySearchRoute(db, ["--search", "nomad", "--limit", "5"]);

    assert.equal(accessRows(), before, "memories --search reinforced retrieval");
    const stamped = Number(
      db.prepare("SELECT COUNT(*) AS n FROM memories WHERE last_accessed_at IS NOT NULL").get()
        ?.n ?? -1,
    );
    assert.equal(stamped, 0, "memories --search stamped last_accessed_at");
  } finally {
    db.close();
  }
});
