// CR104 — the keys agents put into commands: which layers, and the refusal.

import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNewIdentityKey,
  InvalidIdentityKeyError,
  identityKeyBreaksGrammar,
  newIdentityKeyProblem,
  SLUG_KEYED_LAYERS,
} from "#identity/identityKey.ts";

const RULE = "Use lowercase letters, digits, and single hyphens, up to 80 characters";

test("journey and persona keys are the ones held to the grammar", () => {
  assert.deepEqual([...SLUG_KEYED_LAYERS], ["journey", "persona"]);
});

test("a new key outside the grammar is refused with the consequence first and a key that works", () => {
  assert.equal(
    newIdentityKeyProblem("journey", "My Trip"),
    `no journey was created: 'My Trip' is not a journey slug. ${RULE}, for example 'my-trip'.`,
  );
  assert.equal(
    newIdentityKeyProblem("persona", "p;touch PWNED"),
    `no persona was created: 'p;touch PWNED' is not a persona id. ${RULE}, for example 'p-touch-pwned'.`,
  );
});

test("the refusal suggests nothing when no slug can be made of the key", () => {
  assert.equal(
    newIdentityKeyProblem("journey", "$$$"),
    `no journey was created: '$$$' is not a journey slug. ${RULE}.`,
  );
});

test("the rejected key is printed escaped, so it cannot forge a line, a colour, or an order", () => {
  // A C0 escape, a C1 line break and CSI, a bidi override, and a zero-width space.
  const problem =
    newIdentityKeyProblem("journey", "a\n\u001b[31mb\u0085c\u009b31md\u202ee\u200bf") ?? "";
  assert.ok(![...problem].some((c) => /[\p{C}\p{Zl}\p{Zp}]/u.test(c)), JSON.stringify(problem));
  assert.ok(problem.includes("'a\\n\\x1b[31mb\\x85c\\x9b31md\\u202ee\\u200bf'"), problem);
});

test("a key the grammar accepts, and a key in any other layer, is no problem", () => {
  assert.equal(newIdentityKeyProblem("journey", "my-trip"), null);
  assert.equal(newIdentityKeyProblem("persona", "ai-engineer"), null);
  assert.equal(newIdentityKeyProblem("ego", "Anything Goes"), null);
  assert.equal(newIdentityKeyProblem("journey_path", "x;y"), null);
});

test("identityKeyBreaksGrammar answers for existing keys, without the refusal", () => {
  assert.equal(identityKeyBreaksGrammar("journey", "x;touch PWNED"), true);
  assert.equal(identityKeyBreaksGrammar("persona", "Mixed_Case"), true);
  assert.equal(identityKeyBreaksGrammar("journey", "mirror-ts-core"), false);
  assert.equal(identityKeyBreaksGrammar("self", "x;touch PWNED"), false);
});

test("assertNewIdentityKey throws the refusal, carrying the layer and the key", () => {
  assert.throws(
    () => assertNewIdentityKey("journey", "My Trip"),
    (error: unknown) =>
      error instanceof InvalidIdentityKeyError &&
      error.layer === "journey" &&
      error.key === "My Trip" &&
      error.message === newIdentityKeyProblem("journey", "My Trip"),
  );
  assertNewIdentityKey("journey", "my-trip");
  assertNewIdentityKey("ego", "Anything Goes");
});
