import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveParentJourney } from "#journey/parentJourney.ts";
import {
  type JourneyParentRow,
  ParentJourneyValidationError,
  validateParentJourney,
} from "#journey/validateParentJourney.ts";

interface GoldenRow {
  key: string;
  content: string;
  metadata: string | null;
}
interface GoldenCase {
  journey: string;
  parent_journey: string;
  outcome: "ok" | "error";
  error: string | null;
}
interface Golden {
  journey_rows: GoldenRow[];
  cases: GoldenCase[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, "..", "goldens", "validate-parent-journey.golden.json");
const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as Golden;

function parentRows(): JourneyParentRow[] {
  return golden.journey_rows.map((row) => ({
    key: row.key,
    parentJourney: resolveParentJourney(row),
  }));
}

test("validate-parent-journey golden is well-formed", () => {
  assert.ok(golden.journey_rows.length > 0, "corpus has journey rows");
  assert.ok(golden.cases.length >= 6, "cases cover the branches");
  assert.ok(
    golden.cases.some((c) => c.outcome === "ok") && golden.cases.some((c) => c.outcome === "error"),
    "golden has both ok and error cases",
  );
});

test("TS validateParentJourney reproduces the Python oracle outcomes and messages", () => {
  const rows = parentRows();
  for (const c of golden.cases) {
    if (c.outcome === "ok") {
      assert.doesNotThrow(
        () => validateParentJourney(c.journey, c.parent_journey, rows),
        `expected ok for (${c.journey}, ${c.parent_journey})`,
      );
    } else {
      assert.throws(
        () => validateParentJourney(c.journey, c.parent_journey, rows),
        (error: unknown) =>
          error instanceof ParentJourneyValidationError && error.message === c.error,
        `expected error "${c.error}" for (${c.journey}, ${c.parent_journey})`,
      );
    }
  }
});

// Focused unit assertions documenting each rule independently of the golden.
const RULE_ROWS: JourneyParentRow[] = [
  { key: "root", parentJourney: "" },
  { key: "nested", parentJourney: "root" },
  { key: "deep", parentJourney: "nested" },
  { key: "has-child", parentJourney: "" },
  { key: "the-child", parentJourney: "has-child" },
  { key: "loop-a", parentJourney: "loop-b" },
  { key: "loop-b", parentJourney: "loop-a" },
  { key: "orphan-parent", parentJourney: "missing-ancestor" },
];

test("empty parent is a no-op", () => {
  assert.doesNotThrow(() => validateParentJourney("x", "", RULE_ROWS));
  assert.doesNotThrow(() => validateParentJourney("x", null, RULE_ROWS));
});

test("a journey cannot be its own parent", () => {
  assert.throws(
    () => validateParentJourney("root", "root", RULE_ROWS),
    /cannot be the journey itself/,
  );
});

test("the parent must exist", () => {
  assert.throws(
    () => validateParentJourney("x", "ghost", RULE_ROWS),
    /Parent journey 'ghost' not found/,
  );
});

test("arbitrary-depth nesting is accepted", () => {
  assert.doesNotThrow(() => validateParentJourney("x", "deep", RULE_ROWS));
});

test("a journey with children can move beneath another branch", () => {
  assert.doesNotThrow(() => validateParentJourney("has-child", "deep", RULE_ROWS));
});

test("an indirect cycle back to the moved journey is rejected", () => {
  assert.throws(
    () => validateParentJourney("root", "deep", RULE_ROWS),
    /parent_journey would create a cycle/,
  );
});

test("an already-cyclic proposed ancestry is rejected", () => {
  assert.throws(
    () => validateParentJourney("x", "loop-a", RULE_ROWS),
    /Parent lineage contains an existing cycle/,
  );
});

test("a missing legacy ancestor ends the walk without hiding the known parent", () => {
  assert.doesNotThrow(() => validateParentJourney("x", "orphan-parent", RULE_ROWS));
});
