// CV22.DS7.US6 plateau 1 — Soul surfaces graded against the Python oracle.
//
// The golden is leaf-complete by renderer and carries the Unicode corpus that
// separates Python's string semantics from JavaScript's: astral emoji (code
// points vs UTF-16 units in the card padding), U+001F (whitespace to Python,
// not to `\s`), U+FEFF (whitespace to `\s`, not to Python), and the vertical
// tab / form feed / NEL / U+2028 line boundaries `splitlines()` knows and
// `split("\n")` does not.
//
// Refusals are graded with the same weight as renders: Soul's error strings
// are ritual text a user reads.

import assert from "node:assert/strict";
import test from "node:test";
import golden from "#goldens/soul-surface.golden.json" with { type: "json" };
import {
  renderActiveRite,
  renderClosingRite,
  renderEnrichmentProposal,
  renderFruitInMaturation,
  renderHarvestedFruit,
  renderIdentityChangeApplied,
  renderIntegrationReview,
  renderPossibleListenings,
  type SoulListeningOption,
} from "#soul/render.ts";
import { renderSoulModeTransition } from "#soul/transition.ts";

interface Scenario {
  name: string;
  renderer: string;
  input: Record<string, unknown>;
  expected_stdout?: string;
  expected_error?: string;
}

const scenarios = (golden as { scenarios: Scenario[] }).scenarios;

function render(scenario: Scenario): string {
  const input = scenario.input;
  const str = (key: string) => input[key] as string;
  const opt = (key: string) => (input[key] ?? null) as string | null;

  switch (scenario.renderer) {
    case "possible_listenings":
      return renderPossibleListenings(input.options as SoulListeningOption[]);
    case "fruit_in_maturation":
      return renderFruitInMaturation(str("fruit"));
    case "harvested_fruit":
      return renderHarvestedFruit(str("fruit"));
    case "closing_rite":
      return renderClosingRite({
        harvested: opt("harvested"),
        echoes: opt("echoes"),
        remainsOpen: opt("remains_open"),
        integration: opt("integration"),
      });
    case "integration_review":
      return renderIntegrationReview({
        journal: opt("journal"),
        selfMaterial: opt("self_material"),
        shadow: opt("shadow"),
        ego: opt("ego"),
        persona: opt("persona"),
        leaveOpen: opt("leave_open"),
      });
    case "enrichment_proposal":
      return renderEnrichmentProposal(str("layer"), {
        key: str("key"),
        origin: str("origin"),
        current: opt("current"),
        proposed: str("proposed"),
        why: str("why"),
      });
    case "identity_change_applied":
      return renderIdentityChangeApplied(str("layer"), {
        key: str("key"),
        content: str("content"),
      });
    case "mode_transition":
      return renderSoulModeTransition(opt("journey"));
    case "active_rite":
      return renderActiveRite(str("voice"), {
        utterance: opt("utterance"),
        listeningFor: opt("listening_for"),
        question: opt("question"),
      });
    default:
      throw new Error(`golden carries an unknown renderer: ${scenario.renderer}`);
  }
}

test("the golden covers every renderer and both outcomes", () => {
  const renderers = new Set(scenarios.map((s) => s.renderer));
  assert.deepEqual(
    [...renderers].sort(),
    [
      "active_rite",
      "closing_rite",
      "enrichment_proposal",
      "fruit_in_maturation",
      "harvested_fruit",
      "identity_change_applied",
      "integration_review",
      "mode_transition",
      "possible_listenings",
    ],
    "a renderer without a scenario is an ungraded surface",
  );
  assert.ok(scenarios.some((s) => s.expected_stdout !== undefined));
  assert.ok(scenarios.some((s) => s.expected_error !== undefined));
});

for (const scenario of scenarios) {
  if (scenario.expected_stdout !== undefined) {
    test(`renders ${scenario.name} exactly as Python does`, () => {
      assert.equal(render(scenario), scenario.expected_stdout);
    });
  } else {
    test(`refuses ${scenario.name} with Python's message`, () => {
      assert.throws(
        () => render(scenario),
        (error: Error) => {
          assert.equal(error.message, scenario.expected_error);
          return true;
        },
      );
    });
  }
}

test("every rendered card is exactly WIDTH code points wide, not UTF-16 units", () => {
  // The astral scenarios are the ones that would pass a `.length` check and
  // still be wrong; measuring in code points is the actual contract.
  for (const scenario of scenarios) {
    if (scenario.expected_stdout === undefined) continue;
    if (scenario.renderer === "mode_transition") continue; // WIDTH 56, asserted below
    for (const cardLine of scenario.expected_stdout.split("\n").slice(1)) {
      assert.equal(
        Array.from(cardLine).length,
        42,
        `${scenario.name}: "${cardLine}" is not 40 code points between the borders`,
      );
    }
  }
});

test("the Soul entry card is 56 wide and never carries the journey", () => {
  const withoutJourney = renderSoulModeTransition(null);
  assert.equal(renderSoulModeTransition("mirror-ts-core"), withoutJourney);
  for (const cardLine of withoutJourney.split("\n").slice(1)) {
    assert.equal(Array.from(cardLine).length, 58, `"${cardLine}" is not 56 code points wide`);
  }
});
