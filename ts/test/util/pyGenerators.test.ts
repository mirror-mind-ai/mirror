import assert from "node:assert/strict";
import { test } from "node:test";
import {
  newId,
  nowIso,
  pythonJsonDumps,
  pythonJsonDumpsEnsureAscii,
  toMicrosecondIso,
} from "#util/pyGenerators.ts";

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

// Mirror writes JSON into TEXT columns with BOTH of Python's variants, and the
// choice is a per-call-site fact: conversation metadata/tags use
// `ensure_ascii=False`, memory tags use the plain `json.dumps(tags)` default.
// Every expectation below was taken from the Python oracle. `JSON.stringify`
// matches neither -- it omits the separator spaces -- so these guard a silent
// byte divergence in columns both cores read.
test("pythonJsonDumps matches json.dumps(..., ensure_ascii=False)", () => {
  assert.equal(pythonJsonDumps(["café", "b"]), '["café", "b"]');
  assert.equal(
    pythonJsonDumps({ extracted: true, nota: "ção" }),
    '{"extracted": true, "nota": "ção"}',
  );
  assert.equal(pythonJsonDumps([]), "[]");
  assert.equal(pythonJsonDumps({}), "{}");
});

test("pythonJsonDumpsEnsureAscii matches the json.dumps default", () => {
  assert.equal(pythonJsonDumpsEnsureAscii(["café", "b"]), '["caf\\u00e9", "b"]');
  assert.equal(
    pythonJsonDumpsEnsureAscii(["ação", "日本"]),
    '["a\\u00e7\\u00e3o", "\\u65e5\\u672c"]',
  );
  // Astral characters: JavaScript's UTF-16 units reproduce Python's surrogate pair.
  assert.equal(pythonJsonDumpsEnsureAscii(["emoji \u{1F3AF}"]), '["emoji \\ud83c\\udfaf"]');
});

test("JSON.stringify is not a substitute for either variant", () => {
  // Guards the regression this pair was introduced to fix.
  assert.notEqual(JSON.stringify(["a", "b"]), pythonJsonDumps(["a", "b"]));
  assert.notEqual(JSON.stringify(["café"]), pythonJsonDumpsEnsureAscii(["café"]));
});

test("nowIso returns the microsecond ISO-Z shape", () => {
  assert.match(nowIso(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
});
