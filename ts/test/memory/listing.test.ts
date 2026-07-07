import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database, PreparedQuery, Row, SqlValue } from "../../src/db/database.ts";
import {
  buildListRecentQuery,
  countMemoriesByType,
  listRecentMemorySummaries,
} from "../../src/memory/listing.ts";

// A minimal in-memory Database stub. It captures the SQL/params the read model
// issues and returns canned rows, so the query builder and row mapper are tested
// without a real SQLite file (per US3 option B: ordering realism lives in the
// real-DB-copy harness, not the CI unit suite).
function stubDatabase(rows: Row[], capture: { sql?: string; params?: SqlValue[] } = {}): Database {
  return {
    prepare(sql: string): PreparedQuery {
      capture.sql = sql;
      return {
        all: (...params: SqlValue[]): Row[] => {
          capture.params = params;
          return rows;
        },
        get: () => undefined,
      };
    },
    close: () => {},
  };
}

test("buildListRecentQuery with no filters seeds 1=1 and limits", () => {
  const { sql, params } = buildListRecentQuery();
  assert.match(sql, /WHERE 1=1 ORDER BY created_at DESC LIMIT \?$/);
  assert.deepEqual(params, [20]);
});

test("buildListRecentQuery adds clauses in type -> layer -> journey order", () => {
  const { sql, params } = buildListRecentQuery({
    memoryType: "insight",
    layer: "ego",
    journey: "cv22",
    limit: 5,
  });
  assert.match(
    sql,
    /WHERE 1=1 AND memory_type = \? AND layer = \? AND journey = \? ORDER BY created_at DESC LIMIT \?$/,
  );
  assert.deepEqual(params, ["insight", "ego", "cv22", 5]);
});

test("buildListRecentQuery omits clauses for empty filters", () => {
  const { sql, params } = buildListRecentQuery({ layer: "shadow" });
  assert.match(sql, /WHERE 1=1 AND layer = \? ORDER BY/);
  assert.deepEqual(params, ["shadow", 20]);
});

test("buildListRecentQuery projects the MemorySummary columns", () => {
  const { sql } = buildListRecentQuery();
  assert.match(
    sql,
    /SELECT id, memory_type, layer, title, content, context, journey, persona, tags, created_at FROM memories/,
  );
});

test("listRecentMemorySummaries maps rows to the summary DTO and passes params", () => {
  const capture: { sql?: string; params?: SqlValue[] } = {};
  const db = stubDatabase(
    [
      {
        id: "m1",
        memory_type: "insight",
        layer: "ego",
        title: "T",
        content: "C",
        context: null,
        journey: "cv22",
        persona: null,
        tags: '["a","b"]',
        created_at: "2026-06-20T12:00:00Z",
      },
    ],
    capture,
  );
  const summaries = listRecentMemorySummaries(db, { memoryType: "insight", limit: 5 });
  assert.equal(summaries.length, 1);
  assert.deepEqual(summaries[0], {
    id: "m1",
    memory_type: "insight",
    layer: "ego",
    title: "T",
    content: "C",
    context: null,
    journey: "cv22",
    persona: null,
    tags: '["a","b"]', // raw tags string preserved; parsing is a display concern
    created_at: "2026-06-20T12:00:00Z",
  });
  assert.deepEqual(capture.params, ["insight", 5]);
});

test("countMemoriesByType maps grouped rows to [type, count] pairs", () => {
  const db = stubDatabase([
    { memory_type: "insight", count: 3 },
    { memory_type: "idea", count: 1 },
  ]);
  assert.deepEqual(countMemoriesByType(db), [
    ["insight", 3],
    ["idea", 1],
  ]);
});
