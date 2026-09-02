"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { initialKeySaved, planKeyPersist } = require("../main/onboarding.js");

test("keySaved starts from the real .env state (retry/restart)", () => {
  assert.strictEqual(initialKeySaved(true), true);
  assert.strictEqual(initialKeySaved(false), false);
  assert.strictEqual(initialKeySaved(undefined), false);
});

test("blank field with an existing key → keep it, stay saved", () => {
  const r = planKeyPersist({ existingHasKey: true, typedKey: "" });
  assert.deepStrictEqual(r, { action: "keep", keySaved: true });
});

test("blank field with no existing key → no key, not saved", () => {
  const r = planKeyPersist({ existingHasKey: false, typedKey: "   " });
  assert.deepStrictEqual(r, { action: "keep", keySaved: false });
});

test("a new valid key → save it, becomes saved", () => {
  const r = planKeyPersist({ existingHasKey: true, typedKey: "sk-or-newvalue" });
  assert.deepStrictEqual(r, { action: "save", value: "sk-or-newvalue", keySaved: true });
});

test("an invalid typed key → invalid, never persisted (no secret leak)", () => {
  const r = planKeyPersist({ existingHasKey: false, typedKey: "not-a-key" });
  assert.strictEqual(r.action, "invalid");
  assert.ok(!("value" in r));
});
