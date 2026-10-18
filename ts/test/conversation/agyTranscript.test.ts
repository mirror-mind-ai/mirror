// CV21.DS7.TS3 — the agy transcript reader.
//
// agy's hook payloads carry no text (DS12.TS3 L7), so logging reads the
// JSONL transcript. The step shapes are probed from real agy 1.4.2
// transcripts (evidence/transcript-shape-20261018.md): a user turn is a
// `USER_INPUT` step whose content wraps the request in `<USER_REQUEST>`; the
// answer is the non-empty `PLANNER_RESPONSE` step(s) in the turn — MOST
// PLANNER_RESPONSE steps are empty intermediate tool steps, the correction
// the probe forced. `step_index` is a monotonic per-conversation ordinal,
// the high-water key.

import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { describe, test } from "node:test";
import { readAgyTurns } from "#conversation/agyTranscript.ts";

const FIXTURES = resolve(import.meta.dirname, "..", "fixtures", "agy");

describe("readAgyTurns", () => {
  test("pairs each user turn with the non-empty answer in its span", () => {
    const turns = readAgyTurns(join(FIXTURES, "transcript-two-turns.jsonl"));
    assert.deepEqual(turns, [
      { userText: "Hello there", replyText: "Hi! How can I help?", lastStepIndex: 3 },
      { userText: "What is 2+2?", replyText: "It is 4.", lastStepIndex: 7 },
    ]);
  });

  test("the USER_REQUEST body is extracted, metadata dropped", () => {
    const [first] = readAgyTurns(join(FIXTURES, "transcript-two-turns.jsonl"));
    assert.ok(first);
    assert.equal(first.userText, "Hello there");
    assert.ok(!first.userText.includes("ADDITIONAL_METADATA"));
    assert.ok(!first.userText.includes("current local time"));
  });

  test("empty PLANNER_RESPONSE steps and bookkeeping steps are not the reply", () => {
    // The second turn has an empty response (5), a CHECKPOINT (6), then the
    // real answer (7). Only step 7's text is the reply.
    const turns = readAgyTurns(join(FIXTURES, "transcript-two-turns.jsonl"));
    assert.equal(turns[1]?.replyText, "It is 4.");
    assert.equal(turns[1]?.lastStepIndex, 7);
  });

  test("an absent or empty transcript yields no turns, never throws", () => {
    assert.deepEqual(readAgyTurns(join(FIXTURES, "does-not-exist.jsonl")), []);
  });

  test("a skill turn is carried through with its raw text for the handler to skip", () => {
    // The reader does not decide command-ness; it returns the text, and the
    // handler applies isCommandTurn — the one-home rule.
    const turns = readAgyTurns(join(FIXTURES, "transcript-skill-turn.jsonl"));
    assert.equal(turns[0]?.userText, "/mirror-mind:mm:mirror what should I focus on");
  });
});
