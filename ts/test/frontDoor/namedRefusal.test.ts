// The refusals the front door answers by name when no route answered them.
//
// Main consults `namedRefusal` for every error a route lets through. The half
// replay fixture proves that call through the real CLI (`buildCli.test.ts`), so
// what is graded here is the answer for each refusal, and that anything else stays
// a crash.

import assert from "node:assert/strict";
import test from "node:test";
import { namedRefusal } from "#frontDoor/namedRefusal.ts";
import {
  assertNewIdentityKey,
  InvalidIdentityKeyError,
  newIdentityKeyProblem,
} from "#identity/identityKey.ts";
import {
  CONVERSATION_TAIL_TRANSPORT,
  ReplayFixtureIncompleteError,
  resolveProviderTransport,
} from "#providers/transport.ts";

test("CR104: a new key the store refused is one Error: line and exit 1", () => {
  let refused: unknown;
  try {
    assertNewIdentityKey("journey", "x;touch PWNED");
  } catch (error) {
    refused = error;
  }
  assert.ok(refused instanceof InvalidIdentityKeyError);
  assert.deepEqual(namedRefusal(refused), {
    line: `Error: ${newIdentityKeyProblem("journey", "x;touch PWNED")}`,
    exitCode: 1,
  });
});

test("half a replay fixture keeps its line and exit 2", () => {
  const error = new ReplayFixtureIncompleteError(
    resolveProviderTransport(
      { MIRROR_TS_CONVERSATION_LLM_REPLAY: "/tmp/half.json" },
      CONVERSATION_TAIL_TRANSPORT,
    ),
  );
  assert.deepEqual(namedRefusal(error), {
    line: `Mirror TS front door: ${error.message}`,
    exitCode: 2,
  });
});

test("anything else is a crash, not a refusal", () => {
  assert.equal(namedRefusal(new Error("boom")), null);
  assert.equal(namedRefusal("not even an error"), null);
});
