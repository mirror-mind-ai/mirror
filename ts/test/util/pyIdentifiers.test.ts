import assert from "node:assert/strict";
import { test } from "node:test";
import { newId, nowIso, toMicrosecondIso } from "../../src/util/pyIdentifiers.ts";

test("newId is 8 lowercase hex chars, like Python uuid4().hex[:8]", () => {
  for (let i = 0; i < 50; i += 1) {
    assert.match(newId(), /^[0-9a-f]{8}$/);
  }
});

test("newId is (almost surely) unique across calls", () => {
  const ids = new Set(Array.from({ length: 200 }, () => newId()));
  assert.equal(ids.size, 200);
});

test("toMicrosecondIso pads milliseconds to Python's 6-digit microseconds", () => {
  assert.equal(
    toMicrosecondIso(new Date("2026-06-23T12:00:00.123Z")),
    "2026-06-23T12:00:00.123000Z",
  );
  assert.equal(
    toMicrosecondIso(new Date("2026-01-02T03:04:05.000Z")),
    "2026-01-02T03:04:05.000000Z",
  );
});

test("microsecond padding preserves recency ordering vs a Python timestamp", () => {
  // A naive millisecond ".123Z" would sort AFTER ".123456Z" (Z > digit); the
  // padded form must sort before it, as the real earlier instant.
  assert.ok(toMicrosecondIso(new Date("2026-06-23T12:00:00.123Z")) < "2026-06-23T12:00:00.123456Z");
});

test("nowIso returns the microsecond ISO-Z shape", () => {
  assert.match(nowIso(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
});
