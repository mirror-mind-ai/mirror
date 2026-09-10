import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { computeCost, MODEL_PRICES } from "#providers/cost.ts";

interface GoldenCase {
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number | null;
}
interface Golden {
  prices: Record<string, { prompt_per_1k: number; completion_per_1k: number }>;
  cases: GoldenCase[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, "..", "goldens", "cost.golden.json");
const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as Golden;

test("cost golden covers the branches the port must not invert", () => {
  assert.ok(
    golden.cases.some((c) => c.cost_usd === null && c.prompt_tokens !== null),
    "an unknown model yields null, not a silent zero",
  );
  assert.ok(
    golden.cases.some((c) => c.cost_usd === null && c.prompt_tokens === null),
    "missing prompt usage yields null",
  );
  assert.ok(
    golden.cases.some((c) => c.cost_usd === 0),
    "a real priced zero exists and is distinct from null",
  );
  assert.ok(
    golden.cases.some((c) => c.completion_tokens === null && typeof c.cost_usd === "number"),
    "missing completion is zero completion, not unknown cost",
  );
});

test("MODEL_PRICES matches Python's table exactly", () => {
  assert.deepEqual(
    Object.keys(MODEL_PRICES).sort(),
    Object.keys(golden.prices).sort(),
    "same pinned models, no invented entries",
  );
  for (const [model, price] of Object.entries(golden.prices)) {
    const ported = MODEL_PRICES[model];
    assert.ok(ported, `missing price entry for ${model}`);
    assert.equal(ported.promptPer1k, price.prompt_per_1k, `${model} prompt price`);
    assert.equal(ported.completionPer1k, price.completion_per_1k, `${model} completion price`);
  }
});

test("computeCost reproduces the Python oracle to the bit", () => {
  for (const testCase of golden.cases) {
    const actual = computeCost(testCase.model, testCase.prompt_tokens, testCase.completion_tokens);
    // Exact equality on purpose: both languages compute in IEEE-754 doubles
    // over the same operation order, so drift is a real defect, not noise.
    assert.equal(
      actual,
      testCase.cost_usd,
      `${testCase.model} p=${testCase.prompt_tokens} c=${testCase.completion_tokens}`,
    );
  }
});

test("computeCost never confuses an unpriced call with a free one", () => {
  assert.equal(computeCost("model/not-in-table", 1000, 500), null);
  assert.equal(computeCost("google/gemini-2.5-flash-lite", null, 500), null);
  assert.equal(computeCost("google/gemini-2.5-flash-lite", 0, 0), 0);
});

test("computeCost treats undefined usage like Python's None", () => {
  // TS callers hold `number | null | undefined`; Python only has None. Both
  // absences must mean "unknown", never "zero tokens".
  assert.equal(computeCost("google/gemini-2.5-flash-lite", undefined, 500), null);
  assert.equal(
    computeCost("google/gemini-2.5-flash-lite", 1000, undefined),
    computeCost("google/gemini-2.5-flash-lite", 1000, null),
  );
});
