import assert from "node:assert/strict";
import { test } from "node:test";
import { MINIMUM_NODE_MAJOR, nodeVersionError } from "../../src/frontDoor/nodeSupport.ts";

test("nodeVersionError flags a Node major below the supported floor", () => {
  const message = nodeVersionError("20.11.0");
  assert.ok(message);
  assert.match(message, new RegExp(`Node >= ${MINIMUM_NODE_MAJOR}`));
  assert.match(message, /20\.11\.0/);
});

test("nodeVersionError passes a supported Node version", () => {
  assert.equal(nodeVersionError(`${MINIMUM_NODE_MAJOR}.0.0`), null);
  assert.equal(nodeVersionError("25.1.0"), null);
});
