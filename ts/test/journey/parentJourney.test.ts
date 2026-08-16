import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveParentJourney } from "#journey/parentJourney.ts";

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

// CR050: Python v0.31.9 remains authoritative for the unported Workspace/web
// parent writer. It updates metadata but cannot update TS migration 017's
// column, so metadata must win during mixed-engine operation.
test("metadata is authoritative when a populated column is stale", () => {
  assert.equal(
    resolveParentJourney({
      parent_journey: "old-column-value",
      metadata: JSON.stringify({ parent_journey: "new-metadata-value" }),
    }),
    "new-metadata-value",
  );
});

test("metadata parent is stable regardless of the projection column", () => {
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

test("a stale column cannot resurrect a parent removed from valid metadata", () => {
  assert.equal(
    resolveParentJourney({
      parent_journey: "old-parent",
      metadata: JSON.stringify({ project_path: "/still-here" }),
    }),
    "",
  );
});

test("column-only, malformed, and non-object states match Python's tolerant no-parent read", () => {
  assert.equal(resolveParentJourney({ parent_journey: "column-value", metadata: null }), "");
  assert.equal(resolveParentJourney({ parent_journey: "column-value" }), "");
  assert.equal(
    resolveParentJourney({ parent_journey: "column-value", metadata: JSON.stringify({}) }),
    "",
  );
  assert.equal(resolveParentJourney({ parent_journey: "column-value", metadata: "{not json" }), "");
  assert.equal(resolveParentJourney({ metadata: "[1,2,3]" }), "");
});
