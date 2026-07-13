import assert from "node:assert/strict";
import { test } from "node:test";
import { pyJsonDumps } from "../../src/util/pyJson.ts";

// Expected strings are the real output of Python's json.dumps (captured from
// CPython), so these tests pin byte-for-byte parity, not a guess.

test("matches json.dumps: spaced separators and null (defaults)", () => {
  assert.equal(
    pyJsonDumps({ project_path: "/Users/x/dev", parent_journey: null }),
    '{"project_path": "/Users/x/dev", "parent_journey": null}',
  );
});

test("preserves insertion order by default and sorts under sortKeys", () => {
  assert.equal(pyJsonDumps({ b: "2", a: "1" }), '{"b": "2", "a": "1"}');
  assert.equal(pyJsonDumps({ b: "2", a: "1" }, { sortKeys: true }), '{"a": "1", "b": "2"}');
});

test("escapes non-ASCII and control chars under ensure_ascii (default)", () => {
  assert.equal(
    pyJsonDumps({ name: "café ☕", note: "a\tb\n" }),
    '{"name": "caf\\u00e9 \\u2615", "note": "a\\tb\\n"}',
  );
});

test("emits raw unicode when ensureAscii is false", () => {
  assert.equal(
    pyJsonDumps({ name: "café ☕", icon: "🚀" }, { ensureAscii: false, sortKeys: true }),
    '{"icon": "🚀", "name": "café ☕"}',
  );
});

test("escapes astral characters as surrogate pairs under ensure_ascii", () => {
  assert.equal(pyJsonDumps({ icon: "🚀" }), '{"icon": "\\ud83d\\ude80"}');
});

test("serializes an empty object", () => {
  assert.equal(pyJsonDumps({}), "{}");
});
