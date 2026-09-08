// CV22.DS7.US6 plateau 5 — the harvest journal, graded against the Python
// oracle.
//
// The composition is pure and carries the story's remaining string divergences:
// code-point length and slicing in the title, `rstrip(".!?")` as a character
// set, `splitlines()` in the blockquote, and `str.title()` for unknown roles.

import assert from "node:assert/strict";
import test from "node:test";
import golden from "#goldens/soul-harvest.golden.json" with { type: "json" };
import {
  composeSoulHarvestJournal,
  pyTitle,
  titleFromFruit,
  type TranscriptMessage,
} from "#soul/harvest.ts";

interface Scenario {
  name: string;
  fruit: string;
  conversation_id: string | null;
  messages: TranscriptMessage[];
  expected_title?: string;
  expected_content?: string;
  expected_metadata?: string;
  expected_error?: string;
}

const scenarios = (golden as { scenarios: Scenario[] }).scenarios;

for (const scenario of scenarios) {
  test(`harvest journal: ${scenario.name} matches the Python oracle`, () => {
    const compose = () =>
      composeSoulHarvestJournal({
        fruit: scenario.fruit,
        conversationId: scenario.conversation_id,
        messages: scenario.messages,
      });

    if (scenario.expected_error !== undefined) {
      assert.throws(compose, (error: Error) => {
        assert.equal(error.message, scenario.expected_error);
        return true;
      });
      return;
    }

    const entry = compose();
    assert.equal(entry.title, scenario.expected_title, "title");
    assert.equal(entry.content, scenario.expected_content, "content");
    assert.equal(entry.metadata, scenario.expected_metadata, "metadata bytes");
  });
}

test("pyTitle capitalizes after every non-alphabetic character, as str.title() does", () => {
  // The case a `charAt(0).toUpperCase()` port gets wrong.
  assert.equal(pyTitle("tool_call"), "Tool_Call");
  assert.equal(pyTitle("system"), "System");
  assert.equal(pyTitle("MIXED case"), "Mixed Case");
  assert.equal(pyTitle("agent-2-reply"), "Agent-2-Reply");
});

test("the title boundary is measured in code points, not UTF-16 units", () => {
  const eighty = "🎯".repeat(80);
  assert.equal(eighty.length, 160, "precondition: UTF-16 length disagrees");
  // 80 code points is within the limit, so the title is returned whole.
  assert.equal(titleFromFruit(eighty), eighty);
  // 81 truncates at 77 code points plus the ellipsis.
  const eightyOne = "🎯".repeat(81);
  assert.equal(Array.from(titleFromFruit(eightyOne)).length, 80);
});

test("the two Soul writes keep different JSON rules", () => {
  // The harvest journal's metadata is insertion-ordered; the identity
  // integration's is key-sorted. Unifying them would break one.
  const entry = composeSoulHarvestJournal({ fruit: "a fruit", conversationId: "c1" });
  assert.ok(
    entry.metadata.startsWith('{"format": "markdown", "origin":'),
    `insertion order lost: ${entry.metadata.slice(0, 60)}`,
  );
});
