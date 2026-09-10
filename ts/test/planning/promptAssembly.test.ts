import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DESCRIPTOR_PROMPT,
  JOURNAL_CLASSIFICATION_PROMPT,
  WEEK_PLAN_PROMPT,
} from "#extraction/prompts.ts";
import {
  buildDescriptorPrompt,
  buildJournalClassificationPrompt,
  buildWeekPlanJourneysText,
  buildWeekPlanPrompt,
  DESCRIPTOR_TEMPERATURE,
  JOURNAL_TEMPERATURE,
  WEEK_PLAN_TEMPERATURE,
  weekPlanClock,
} from "#planning/promptAssembly.ts";

/**
 * CV22.DS7.US11 plateau 2 — the three content & planning prompts, graded
 * against the Python-generated digests in
 * `ts/test/goldens/prompt-assembly.golden.json`.
 *
 * Replay resolves a fixture by role alone, so a drifted prompt would replay
 * happily and only diverge at DS8, live, against real users. These assertions
 * are what make that impossible: the assembled bytes must hash to what Python
 * produced.
 */

interface Scenario {
  label: string;
  surface: string;
  inputs: Record<string, unknown>;
  prompt: string;
  prompt_sha256: string;
}
interface Golden {
  system_prompts: Record<string, string>;
  scenarios: Scenario[];
}

const golden = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "goldens", "prompt-assembly.golden.json"),
    "utf8",
  ),
) as Golden;

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

test("the three US11 templates are byte-identical to the Python source", () => {
  assert.equal(JOURNAL_CLASSIFICATION_PROMPT, golden.system_prompts.journal_classification);
  assert.equal(DESCRIPTOR_PROMPT, golden.system_prompts.descriptor);
  assert.equal(WEEK_PLAN_PROMPT, golden.system_prompts.week_plan);
});

test("US11 scenarios are present in the corpus", () => {
  const surfaces = new Set(golden.scenarios.map((s) => s.surface));
  for (const surface of ["journal_classification", "descriptor", "week_plan"]) {
    assert.ok(surfaces.has(surface), `${surface} scenarios generated`);
  }
});

for (const scenario of golden.scenarios) {
  if (!["journal_classification", "descriptor", "week_plan"].includes(scenario.surface)) continue;

  test(`prompt assembly — ${scenario.label}`, () => {
    let assembled: string;
    if (scenario.surface === "journal_classification") {
      assembled = buildJournalClassificationPrompt(scenario.inputs.content as string);
    } else if (scenario.surface === "descriptor") {
      assembled = buildDescriptorPrompt(
        scenario.inputs.content as string,
        scenario.inputs.layer as string,
        scenario.inputs.key as string,
      );
    } else {
      const clock = scenario.inputs.clock as { today: string; weekday: string };
      assembled = buildWeekPlanPrompt(
        scenario.inputs.text as string,
        scenario.inputs.journeys as { slug: string; description: string }[],
        clock,
      );
    }
    assert.equal(assembled, scenario.prompt, "assembled bytes match the oracle");
    assert.equal(sha256(assembled), scenario.prompt_sha256, "digest matches the pinned value");
  });
}

test("journey descriptions are cut at 100 CODE POINTS, not UTF-16 units", () => {
  // `extract_week_plan` slices `description[:100]` after the service already
  // cut it to 200. A non-BMP leading character makes the two slicing rules
  // disagree, which would silently change the prompt bytes.
  const description = `\u{1F30D} ${"a".repeat(200)}`;
  const text = buildWeekPlanJourneysText([{ slug: "s", description }]);
  const rendered = text.slice("- **s**: ".length);
  assert.equal([...rendered].length, 100, "100 code points survive");
  assert.ok(rendered.startsWith("\u{1F30D}"), "the astral character is intact, not split");
});

test("an empty journey list renders Python's literal placeholder", () => {
  assert.equal(buildWeekPlanJourneysText([]), "(no active journeys)");
});

test("weekPlanClock reproduces Python's Monday-first weekday and local date", () => {
  // 2026-09-09 is a Wednesday. JS getDay() would say 3 with Sunday=0; Python's
  // weekday() says 2 with Monday=0. Both must land on "Wednesday".
  assert.deepEqual(weekPlanClock(new Date(2026, 8, 9, 13, 45)), {
    today: "2026-09-09",
    weekday: "Wednesday",
  });
  // A Sunday: JS 0, Python 6 — the index where a naive port breaks.
  assert.deepEqual(weekPlanClock(new Date(2026, 8, 13, 9, 0)), {
    today: "2026-09-13",
    weekday: "Sunday",
  });
  // A Monday, and a single-digit month/day needing zero padding.
  assert.deepEqual(weekPlanClock(new Date(2026, 0, 5, 0, 0)), {
    today: "2026-01-05",
    weekday: "Monday",
  });
});

test("temperatures are carried for the DS8 live cutover", () => {
  assert.equal(JOURNAL_TEMPERATURE, 0.3);
  assert.equal(WEEK_PLAN_TEMPERATURE, 0.2);
  assert.equal(DESCRIPTOR_TEMPERATURE, 0.2);
});
