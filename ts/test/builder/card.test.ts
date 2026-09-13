// CV22.DS7.US8 plateau 1 — the Builder card primitives against the oracle.
//
// The golden carries all NINE Python owners of `_wrap_plain_text` and all SEVEN
// of `_card_prefixed`, even though they collapse to two behaviors each. That is
// deliberate: this test asserts the OWNER→FLAG mapping, so if a future Python
// change makes a tenth copy diverge, or unifies `release_intent` with the rest,
// the drift surfaces here instead of in a rendered surface months later.
//
// The mapping is declared as data below and checked exhaustively; a new owner
// in the golden with no entry here is a failure, not a skipped row.

import assert from "node:assert/strict";
import test from "node:test";

import {
  cardContextItems,
  cardLine,
  cardPrefixed,
  cardText,
  cardWrapped,
  wrapPlainText,
} from "#builder/card.ts";
import golden from "#goldens/builder-card.golden.json" with { type: "json" };

interface Scenario {
  name: string;
  kind: string;
  input: Record<string, unknown>;
  expected?: unknown;
  expected_error?: string;
}

const scenarios = (golden as { scenarios: Scenario[] }).scenarios;

/**
 * Which Python owners chunk an over-long word. Measured from the golden, not
 * read from the source: `release_intent` alone appends it whole.
 */
const CHUNKING_OWNERS = new Set([
  "artifact_surfaces",
  "delivery_story_closure",
  "delivery_story_plan",
  "flow_unit",
  "home_surface",
  "lifecycle",
  "pull_candidates",
  "resume_surface",
]);
const NON_CHUNKING_OWNERS = new Set(["release_intent"]);

/** Which Python owners strip a leading `"- "` in `_card_prefixed`. */
const DASH_STRIPPING_OWNERS = new Set(["delivery_story_closure"]);
const PLAIN_PREFIX_OWNERS = new Set([
  "delivery_story_plan",
  "flow_unit",
  "home_surface",
  "lifecycle",
  "pull_candidates",
  "resume_surface",
]);

function wrapOwnerFlag(owner: string): boolean {
  if (CHUNKING_OWNERS.has(owner)) return true;
  if (NON_CHUNKING_OWNERS.has(owner)) return false;
  throw new Error(`unmapped _wrap_plain_text owner in golden: ${owner}`);
}

function prefixOwnerFlag(owner: string): boolean {
  if (DASH_STRIPPING_OWNERS.has(owner)) return true;
  if (PLAIN_PREFIX_OWNERS.has(owner)) return false;
  throw new Error(`unmapped _card_prefixed owner in golden: ${owner}`);
}

test("every golden scenario is exercised by a known kind", () => {
  const kinds = new Set(scenarios.map((s) => s.kind));
  assert.deepEqual(
    [...kinds].sort(),
    [
      "card_context_items",
      "card_line",
      "card_prefixed",
      "card_text",
      "card_wrapped",
      "wrap_plain_text",
    ],
    "a new golden kind needs a case in this test, not a silent skip",
  );
  assert.ok(scenarios.length >= 500, `expected the full corpus, got ${scenarios.length}`);
});

test("wrapPlainText matches Python for every owner, row, and width", () => {
  const rows = scenarios.filter((s) => s.kind === "wrap_plain_text");
  assert.ok(rows.length > 0);
  for (const scenario of rows) {
    const owner = scenario.input.owner as string;
    const actual = wrapPlainText(scenario.input.text as string, {
      width: scenario.input.width as number,
      chunkLongWords: wrapOwnerFlag(owner),
    });
    assert.deepEqual(actual, scenario.expected, scenario.name);
  }
});

test("the chunking divergence is real and both sides are pinned", () => {
  // The whole reason this module takes a flag. If these two ever agree, one of
  // the Python copies changed and the flag may be removable — deliberately.
  const chunked = scenarios.find((s) => s.name === "wrap__lifecycle__unbroken_60__w54");
  const whole = scenarios.find((s) => s.name === "wrap__release_intent__unbroken_60__w54");
  assert.ok(chunked && whole);
  assert.deepEqual(chunked.expected, ["x".repeat(54), "x".repeat(6)]);
  assert.deepEqual(whole.expected, ["x".repeat(60)]);
  assert.notDeepEqual(chunked.expected, whole.expected);
});

test("cardText matches Python's truncate-then-pad", () => {
  const rows = scenarios.filter((s) => s.kind === "card_text");
  assert.ok(rows.length > 0);
  for (const scenario of rows) {
    assert.equal(cardText(scenario.input.text as string), scenario.expected, scenario.name);
  }
});

test("every cardText result is exactly 54 code points of content", () => {
  // Padding is in code points, so an astral-heavy card is narrower on screen
  // than an ASCII one. That asymmetry is Python's; what must hold is the code
  // point count.
  for (const scenario of scenarios.filter((s) => s.kind === "card_text")) {
    const rendered = scenario.expected as string;
    const inner = [...rendered].slice(2, -2).join("");
    assert.equal([...inner].length, 54, `${scenario.name}: ${JSON.stringify(rendered)}`);
  }
});

test("cardWrapped matches Python, paragraphs collapsed", () => {
  const rows = scenarios.filter((s) => s.kind === "card_wrapped");
  assert.ok(rows.length > 0);
  for (const scenario of rows) {
    assert.deepEqual(cardWrapped(scenario.input.text as string), scenario.expected, scenario.name);
  }
  const collapsed = scenarios.find((s) => s.name === "card_wrapped__multi_paragraph");
  assert.equal(
    (collapsed?.expected as string[]).length,
    1,
    "embedded newlines are separators to str.split(); paragraphs must collapse",
  );
});

test("cardPrefixed matches Python for every owner and row", () => {
  const rows = scenarios.filter((s) => s.kind === "card_prefixed");
  assert.ok(rows.length > 0);
  for (const scenario of rows) {
    const owner = scenario.input.owner as string;
    const actual = cardPrefixed(scenario.input.items as string[], scenario.input.prefix as string, {
      stripDash: prefixOwnerFlag(owner),
    });
    assert.deepEqual(actual, scenario.expected, scenario.name);
  }
});

test("the dash-stripping divergence is real, and only for an exact '- ' prefix", () => {
  const stripped = scenarios.find(
    (s) => s.name === "card_prefixed__delivery_story_closure__bulleted",
  );
  const kept = scenarios.find((s) => s.name === "card_prefixed__lifecycle__bulleted");
  assert.ok(stripped && kept);
  assert.notDeepEqual(stripped.expected, kept.expected);
  // `-x` is not a bullet: both owners keep it.
  const dashNoSpaceStripped = scenarios.find(
    (s) => s.name === "card_prefixed__delivery_story_closure__dash_no_space",
  );
  const dashNoSpaceKept = scenarios.find(
    (s) => s.name === "card_prefixed__lifecycle__dash_no_space",
  );
  assert.deepEqual(dashNoSpaceStripped?.expected, dashNoSpaceKept?.expected);
});

test("a blank item renders 'none' per item, not one 'none' for the list", () => {
  // Reads like a defect; it is Python's behavior and a port must not tidy it.
  const scenario = scenarios.find((s) => s.name === "card_prefixed__lifecycle__blank_strings");
  assert.equal((scenario?.expected as string[]).length, 2);
  assert.deepEqual(cardPrefixed(["", ""], "✓"), scenario?.expected);
});

test("cardLine matches Python, including the max(1, …) floor", () => {
  const rows = scenarios.filter((s) => s.kind === "card_line");
  assert.ok(rows.length > 0);
  for (const scenario of rows) {
    assert.equal(
      cardLine(scenario.input.left as string, scenario.input.right as string),
      scenario.expected,
      scenario.name,
    );
  }
});

test("cardContextItems matches Python's substring glyph rule", () => {
  const rows = scenarios.filter((s) => s.kind === "card_context_items");
  assert.ok(rows.length > 0);
  for (const scenario of rows) {
    assert.deepEqual(
      cardContextItems(scenario.input.items as string[]),
      scenario.expected,
      scenario.name,
    );
  }
  // The glyph comes from a substring test, so this is `✓` despite nothing
  // being present. Pinned so nobody "fixes" it into a status field.
  assert.deepEqual(cardContextItems(["represent.md: missing"]), [
    cardText("✓ represent.md: missing"),
  ]);
});
