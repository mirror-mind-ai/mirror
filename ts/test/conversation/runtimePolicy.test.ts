// The runtime session policies, one home (CV21.DS4.TS2, US4).

import assert from "node:assert/strict";
import test from "node:test";
import { sessionEndRunsLlmTail, sessionOutlivesTui } from "#conversation/runtimePolicy.ts";

test("the LLM tail runs at exit on Claude Code, and not on the runtimes that bound SessionEnd", () => {
  assert.equal(sessionEndRunsLlmTail("claude_code"), true);
  assert.equal(sessionEndRunsLlmTail("codex"), false);
  assert.equal(sessionEndRunsLlmTail("grok_build"), false);
  assert.equal(sessionEndRunsLlmTail(null), true);
  assert.equal(sessionEndRunsLlmTail("pi"), true);
});

test("a Codex session outlives the TUI; every other runtime's session ends with it", () => {
  // Codex 0.163.0: `/quit` and Ctrl-D detach the TUI from a thread that persists in
  // the daemon, and SessionEnd does not fire (US4's probe, 2026-10-17).
  assert.equal(sessionOutlivesTui("codex"), true);
  for (const label of ["claude_code", "grok_build", "pi", "gemini", "", null, undefined]) {
    assert.equal(sessionOutlivesTui(label), false, String(label));
  }
});
