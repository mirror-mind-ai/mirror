import assert from "node:assert/strict";
import { test } from "node:test";
import { optionalNumber, optionalString, requireString } from "../../src/db/rowDecode.ts";

test("requireString returns strings and throws (naming the column) on anything else", () => {
  assert.equal(requireString({ id: "abc" }, "id"), "abc");
  assert.throws(
    () => requireString({ id: 3 }, "id"),
    /row column "id": expected string, got number/,
  );
  assert.throws(() => requireString({ id: null }, "id"), /expected string, got null/);
  assert.throws(() => requireString({}, "id"), /expected string, got undefined/);
});

test("optionalString maps null/absent to null and validates a present value", () => {
  assert.equal(optionalString({ tags: '["x"]' }, "tags"), '["x"]');
  assert.equal(optionalString({ tags: null }, "tags"), null);
  assert.equal(optionalString({}, "tags"), null);
  assert.throws(() => optionalString({ tags: 7 }, "tags"), /expected string or null, got number/);
});

test("optionalNumber narrows bigint to number and maps null/absent to null", () => {
  assert.equal(optionalNumber({ n: 5 }, "n"), 5);
  assert.equal(optionalNumber({ n: 9007199254740993n }, "n"), Number(9007199254740993n));
  assert.equal(optionalNumber({ n: null }, "n"), null);
  assert.throws(() => optionalNumber({ n: "x" }, "n"), /expected number or null, got string/);
});
