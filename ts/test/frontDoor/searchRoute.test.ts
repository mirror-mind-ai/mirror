import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  formatSearchResults,
  resolveSearchEmbeddingProvider,
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
