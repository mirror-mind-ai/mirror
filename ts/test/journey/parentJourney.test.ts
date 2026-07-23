import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveParentJourney } from "../../src/journey/parentJourney.ts";

test("reads the parent from JSON metadata when the column is absent", () => {
  assert.equal(
    resolveParentJourney({ metadata: JSON.stringify({ parent_journey: "root" }) }),
    "root",
  );
});

test("old Python dialect and canonical JSON resolve identically (column absent)", () => {
  assert.equal(
    resolveParentJourney({ metadata: '{"parent_journey": "root", "project_path": "/p"}' }),
    "root",
  );
  assert.equal(
    resolveParentJourney({ metadata: '{"project_path":"/p","parent_journey":"root"}' }),
    "root",
  );
});

// CV22.DS6.US3 rider (activated in DS7.US1): the column is now authoritative.
// journeyWrite.ts's createJourney is the one live write that sets it, and it
// does so atomically alongside the JSON in the same transaction, so for every
// row written through that path the two never actually disagree. These tests
// still prove the PRECEDENCE directly (a contrived disagreement), because that
// is what protects rows a column write hasn't reached from ever silently
// preferring a stale value over a present one, and vice versa.
test("column is authoritative: a non-empty column wins over a diverging JSON value", () => {
  assert.equal(
    resolveParentJourney({
      parent_journey: "column-value",
      metadata: JSON.stringify({ parent_journey: "json-value" }),
    }),
    "column-value",
  );
});

test("a null/absent/empty column falls back to the JSON value", () => {
  assert.equal(
    resolveParentJourney({
      parent_journey: null,
      metadata: JSON.stringify({ parent_journey: "root" }),
    }),
    "root",
  );
  assert.equal(
    resolveParentJourney({ metadata: JSON.stringify({ parent_journey: "root" }) }),
    "root",
  );
  assert.equal(
    resolveParentJourney({
      parent_journey: "",
      metadata: JSON.stringify({ parent_journey: "root" }),
    }),
    "root",
  );
});

test("a non-empty column with no JSON parent (or malformed JSON) still resolves to the column", () => {
  assert.equal(
    resolveParentJourney({ parent_journey: "column-value", metadata: null }),
    "column-value",
  );
  assert.equal(resolveParentJourney({ parent_journey: "column-value" }), "column-value");
  assert.equal(
    resolveParentJourney({ parent_journey: "column-value", metadata: JSON.stringify({}) }),
    "column-value",
  );
  assert.equal(
    resolveParentJourney({ parent_journey: "column-value", metadata: "{not json" }),
    "column-value",
  );
});

test("malformed or non-object metadata yields empty without throwing, when the column is absent", () => {
  assert.equal(resolveParentJourney({ metadata: "{not json" }), "");
  assert.equal(resolveParentJourney({ metadata: "[1,2,3]" }), "");
  assert.equal(resolveParentJourney({ metadata: undefined }), "");
});
