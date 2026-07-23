import assert from "node:assert/strict";
import test from "node:test";

import {
  fenceTranscript,
  fenceUntrusted,
  sanitizeExtracted,
} from "../../src/extraction/fencing.ts";

interface TestMem {
  layer: string;
  memory_type: string;
}

function mem(overrides: Partial<TestMem> = {}): TestMem {
  return { layer: "ego", memory_type: "insight", ...overrides };
}

test("fenceTranscript wraps body in <transcript> tags, matching Python byte-for-byte", () => {
  assert.equal(fenceTranscript("hello"), "<transcript>\nhello\n</transcript>");
});

test("fenceUntrusted wraps body in the given tag, matching Python's fence_untrusted byte-for-byte", () => {
  assert.equal(fenceUntrusted("cluster", "hello"), "<cluster>\nhello\n</cluster>");
  assert.equal(
    fenceUntrusted("shadow_memories", "a\nb"),
    "<shadow_memories>\na\nb\n</shadow_memories>",
  );
});

test("fenceTranscript is fenceUntrusted('transcript', body) -- one fence primitive, not two", () => {
  assert.equal(fenceTranscript("x"), fenceUntrusted("transcript", "x"));
});

test("sanitizeExtracted drops an invalid layer and counts it", () => {
  const { kept, dropped } = sanitizeExtracted([mem({ layer: "banana" })], 8);
  assert.deepEqual(kept, []);
  assert.equal(dropped.invalidLayer, 1);
});

test("sanitizeExtracted drops an invalid memory_type and counts it", () => {
  const { kept, dropped } = sanitizeExtracted([mem({ memory_type: "nonsense" })], 8);
  assert.deepEqual(kept, []);
  assert.equal(dropped.invalidType, 1);
});

test("sanitizeExtracted caps over the limit and counts the overflow", () => {
  const { kept, dropped } = sanitizeExtracted(
    Array.from({ length: 12 }, () => mem()),
    8,
  );
  assert.equal(kept.length, 8);
  assert.equal(dropped.overCap, 4);
});

test("sanitizeExtracted passes every valid layer and type through untouched", () => {
  const mems = [
    mem({ layer: "self", memory_type: "decision" }),
    mem({ layer: "shadow", memory_type: "tension" }),
  ];
  const { kept, dropped } = sanitizeExtracted(mems, 8);
  assert.equal(kept.length, 2);
  assert.deepEqual(dropped, { invalidLayer: 0, invalidType: 0, overCap: 0 });
});

test("sanitizeExtracted checks layer before type before cap, matching Python's ordered single pass", () => {
  // An item past the cap that ALSO has an invalid layer must count as
  // invalid_layer, not over_cap -- Python checks layer/type before the cap on
  // every item, it does not simply slice after validating.
  const mems = [
    ...Array.from({ length: 8 }, () => mem()), // fills the cap with valid items
    mem({ layer: "banana" }), // invalid layer, arrives after the cap is full
  ];
  const { kept, dropped } = sanitizeExtracted(mems, 8);
  assert.equal(kept.length, 8);
  assert.equal(dropped.invalidLayer, 1);
  assert.equal(dropped.overCap, 0);
});
