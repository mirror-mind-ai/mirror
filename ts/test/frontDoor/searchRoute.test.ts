import assert from "node:assert/strict";
import test from "node:test";

import { formatSearchResults, type SearchMemoryRow } from "../../src/frontDoor/searchRoute.ts";

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
