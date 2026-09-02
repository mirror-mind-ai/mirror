"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { sanitizeResize } = require("../main/pty-manager.js");

test("accepts sane terminal dimensions", () => {
  assert.deepStrictEqual(sanitizeResize(80, 24), { cols: 80, rows: 24 });
  assert.deepStrictEqual(sanitizeResize(2, 2), { cols: 2, rows: 2 });
  assert.deepStrictEqual(sanitizeResize(500, 300), { cols: 500, rows: 300 });
});

test("rejects out-of-range, fractional and non-numeric values before the native module", () => {
  assert.strictEqual(sanitizeResize(0, 24), null);
  assert.strictEqual(sanitizeResize(80, 0), null);
  assert.strictEqual(sanitizeResize(-1, 24), null);
  assert.strictEqual(sanitizeResize(501, 24), null);
  assert.strictEqual(sanitizeResize(80, 301), null);
  assert.strictEqual(sanitizeResize(80.5, 24), null);
  assert.strictEqual(sanitizeResize(NaN, 24), null);
  assert.strictEqual(sanitizeResize("abc", 24), null);
  assert.strictEqual(sanitizeResize(Infinity, 24), null);
});
