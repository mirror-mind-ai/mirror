import assert from "node:assert/strict";
import { test } from "node:test";
import { assertReplayLlmFixture, LLM_ROLES } from "#providers/llm.ts";

/**
 * CV22.DS7.US11 — the replay fixture validator's role list.
 *
 * `LlmRole` and the runtime guard used to be written twice: a union type plus
 * a hand-maintained `isLlmRole` chain. US11 added three roles to the type; the
 * guard silently kept rejecting them. Every unit test stayed green and the
 * first end-to-end run through the front door threw
 * `unsupported role 'journal_classification'`.
 *
 * Both are now derived from `LLM_ROLES`. These assertions are what make the
 * drift impossible to reintroduce if someone splits them again.
 */

test("every LlmRole is accepted by the fixture validator", () => {
  assert.ok(LLM_ROLES.length >= 14, "the role list is populated");
  for (const role of LLM_ROLES) {
    assert.doesNotThrow(
      () => assertReplayLlmFixture({ kind: "llm", responses: { [role]: "ok" } }),
      `role ${role} must be accepted by the replay fixture validator`,
    );
  }
});

test("the US11 content-tail roles are present", () => {
  for (const role of ["journal_classification", "week_plan", "descriptor"]) {
    assert.ok((LLM_ROLES as readonly string[]).includes(role), `${role} is a declared replay role`);
  }
});

test("an unknown role is still rejected", () => {
  assert.throws(
    () => assertReplayLlmFixture({ kind: "llm", responses: { not_a_role: "x" } }),
    /unsupported role/,
  );
});

test("a digest pinned for an unknown role is rejected", () => {
  assert.throws(
    () =>
      assertReplayLlmFixture({
        kind: "llm",
        responses: {},
        promptDigests: { not_a_role: "a".repeat(64) },
      }),
    /unsupported role/,
  );
});
