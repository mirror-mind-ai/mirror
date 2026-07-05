import assert from "node:assert/strict";
import { test } from "node:test";
import { orderedIdsHash, renderRedactedReport } from "../../src/parity/realDbCopyParity.ts";

test("orderedIdsHash is stable and order-sensitive", () => {
  assert.equal(orderedIdsHash(["a", "b"]), orderedIdsHash(["a", "b"]));
  assert.notEqual(orderedIdsHash(["a", "b"]), orderedIdsHash(["b", "a"]));
});

test("renderRedactedReport omits raw ids and sensitive content", () => {
  const rawIds = ["memory-secret-1", "memory-secret-2"];
  const report = renderRedactedReport([
    {
      label: "search_demo_1",
      resultCount: rawIds.length,
      pythonOrderHash: orderedIdsHash(rawIds),
      tsOrderHash: orderedIdsHash(rawIds),
      match: true,
    },
  ]);

  assert.match(report, /probe: search_demo_1/);
  assert.match(report, /result_count: 2/);
  assert.match(report, /match: true/);
  assert.doesNotMatch(report, /memory-secret-1/);
  assert.doesNotMatch(report, /memory-secret-2/);
  assert.doesNotMatch(report, /private memory content/i);
});
