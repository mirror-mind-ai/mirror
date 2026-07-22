import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveParentJourney } from "../../src/journey/parentJourney.ts";

test("reads the parent from JSON metadata", () => {
  assert.equal(
    resolveParentJourney({ metadata: JSON.stringify({ parent_journey: "root" }) }),
    "root",
  );
});

test("old Python dialect and canonical JSON resolve identically", () => {
  assert.equal(
    resolveParentJourney({ metadata: '{"parent_journey": "root", "project_path": "/p"}' }),
    "root",
  );
  assert.equal(
    resolveParentJourney({ metadata: '{"project_path":"/p","parent_journey":"root"}' }),
    "root",
  );
});

// A3 — the column is a non-authoritative shadow (decision D1): its value can
// never change the resolved parent. This is the "column-present vs column-absent
// yields identical output" guarantee, proven where the logic lives.
test("JSON is authoritative: a diverging column is ignored", () => {
  assert.equal(
    resolveParentJourney({
      parent_journey: "column-value",
      metadata: JSON.stringify({ parent_journey: "json-value" }),
    }),
    "json-value",
  );
});

test("JSON is authoritative: a column present with no JSON parent yields no parent", () => {
  assert.equal(resolveParentJourney({ parent_journey: "column-value", metadata: null }), "");
  assert.equal(resolveParentJourney({ parent_journey: "column-value" }), "");
  assert.equal(
    resolveParentJourney({ parent_journey: "column-value", metadata: JSON.stringify({}) }),
    "",
  );
});

test("malformed or non-object metadata yields empty without throwing", () => {
  assert.equal(resolveParentJourney({ metadata: "{not json" }), "");
  assert.equal(resolveParentJourney({ metadata: "[1,2,3]" }), "");
  assert.equal(resolveParentJourney({ metadata: undefined }), "");
});
