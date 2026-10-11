import assert from "node:assert/strict";
import { test } from "node:test";
import type { WritableDatabase } from "#db/database.ts";
import {
  detectPersonaTool,
  journeyStatusTool,
  listConversationsTool,
  listJourneysTool,
  recallConversationTool,
} from "#mcp/tools/deterministic.ts";
import { GOLDEN, withSeededDatabase } from "./support/fixture.ts";

const HANDLERS: Record<string, (db: WritableDatabase, args: unknown) => string> = {
  list_journeys: listJourneysTool,
  journey_status: journeyStatusTool,
  list_conversations: listConversationsTool,
  recall_conversation: recallConversationTool,
  detect_persona: detectPersonaTool,
};

const DETERMINISTIC_CASES = GOLDEN.cases.filter((testCase) => testCase.tool in HANDLERS);

test("the golden actually covers the five deterministic tools", () => {
  const covered = new Set(DETERMINISTIC_CASES.map((testCase) => testCase.tool));
  assert.deepEqual([...covered].sort(), Object.keys(HANDLERS).sort());
  assert.ok(DETERMINISTIC_CASES.length >= 14, "expected the full case list, not a subset");
});

for (const testCase of DETERMINISTIC_CASES) {
  test(`payload parity: ${testCase.name}`, () => {
    withSeededDatabase((db) => {
      const handler = HANDLERS[testCase.tool];
      if (testCase.raises !== null) {
        assert.throws(
          () => handler(db, testCase.arguments),
          (error: Error) => {
            assert.equal(error.message, testCase.raises);
            return true;
          },
        );
        return;
      }
      assert.equal(handler(db, testCase.arguments), testCase.payload);
    });
  });
}

test("journey_status carries no embedding bytes and no Pydantic repr", () => {
  // The D1 fix, asserted from the TypeScript side: before it, this payload
  // rendered live objects through Pydantic's __str__ including embedding=b'...'.
  withSeededDatabase((db) => {
    const payload = journeyStatusTool(db, {});
    assert.equal(payload.includes("embedding=b'"), false);
    assert.equal(payload.includes("id='"), false);
    assert.ok(payload.includes('"recent_memories"'));
  });
});

test("detect_persona renders whole scores as Python floats", () => {
  // The whole reason PyFloat exists: JSON.stringify would write 2 here.
  withSeededDatabase((db) => {
    const payload = detectPersonaTool(db, { query: "there is a bug in the database schema" });
    assert.match(payload, /"score": 2\.0/);
  });
});

test("recall_conversation with limit=0 returns the whole transcript", () => {
  // Python's messages[-0:] is the whole list. Recorded, not fixed: the DS9
  // threat model owns the finding and TS1 caps it. When that lands, this test
  // is the one that must change, deliberately.
  withSeededDatabase((db) => {
    const all = JSON.parse(recallConversationTool(db, { conversation_id: "conv-0001", limit: 0 }));
    const two = JSON.parse(recallConversationTool(db, { conversation_id: "conv-0001", limit: 2 }));
    assert.equal(all.messages.length, 3);
    assert.equal(two.messages.length, 2);
  });
});

test("timestamp ties resolve by insertion order, on both engines", () => {
  // mem-0001 and mem-0002 share a created_at; conv-0001 and conv-0002 share a
  // started_at. Neither query has a further tie-break, so rowid decides — which
  // is why the seed is ordered and this test seeds it in sequence.
  withSeededDatabase((db) => {
    const status = JSON.parse(journeyStatusTool(db, { slug: "alpha-journey" }));
    const entry = status["alpha-journey"];
    // Newest first (sort direction), then the tied pair in insertion order
    // (tie-break). The newest rows exist precisely so the direction is graded:
    // with only the tied pair, ASC and DESC produce the same list.
    assert.deepEqual(
      entry.recent_memories.map((memory: { id: string }) => memory.id),
      ["mem-0006", "mem-0001", "mem-0002"],
    );
    assert.deepEqual(
      entry.recent_conversations.map((conversation: { id: string }) => conversation.id),
      ["conv-0004", "conv-0001", "conv-0002"],
    );
  });
});
