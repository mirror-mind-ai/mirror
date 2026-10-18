// The runtime session policies, one home (CV21.DS4.TS2, US4).

import assert from "node:assert/strict";
import test from "node:test";
import {
  runtimeReadsPromptContext,
  sessionEndRunsLlmTail,
  sessionOutlivesTui,
} from "#conversation/runtimePolicy.ts";

test("the LLM tail runs at exit on Claude Code, and not on the runtimes that bound SessionEnd", () => {
  assert.equal(sessionEndRunsLlmTail("claude_code"), true);
  assert.equal(sessionEndRunsLlmTail("codex"), false);
  assert.equal(sessionEndRunsLlmTail("grok_build"), false);
  assert.equal(sessionEndRunsLlmTail(null), true);
  assert.equal(sessionEndRunsLlmTail("pi"), true);
});

test("Codex and Antigravity sessions outlive the TUI; every other runtime's ends with it", () => {
  // Codex 0.163.0: `/quit` and Ctrl-D detach the TUI from a thread that persists in
  // the daemon, and SessionEnd does not fire (US4's probe, 2026-10-17).
  assert.equal(sessionOutlivesTui("codex"), true);
  // Antigravity 1.4.2: agy has no SessionEnd hook at all, so nothing closes
  // the conversation at TUI exit — the orphan close ends it (CV21.DS7.TS3).
  assert.equal(sessionOutlivesTui("antigravity"), true);
  for (const label of ["claude_code", "grok_build", "pi", "gemini", "", null, undefined]) {
    assert.equal(sessionOutlivesTui(label), false, String(label));
  }
});

test("Grok discards a prompt hook's context; every other label, and none, reads it (CR143)", () => {
  // grok 1.0.62: a UserPromptSubmit hook's additionalContext never reaches the
  // model (DS12.TS4 L3; CV21.DS10.US3's canary, emitted on every turn and
  // never quoted). An unlabelled payload is a Claude Code payload by
  // detection's own rule, so null and unknown labels keep the default: a
  // predicate that failed closed would silence injection where it works.
  assert.equal(runtimeReadsPromptContext("grok_build"), false);
  for (const label of ["claude_code", "codex", "pi", "antigravity", "", null, undefined]) {
    assert.equal(runtimeReadsPromptContext(label), true, String(label));
  }
});
