// Which runtime a Claude-schema hook is running in (CV21.DS2.US8).
//
// The shared hooks are Mirror's `claude:*` family, and they labelled every
// session `claude_code`: Codex's (DS12.TS2 L7) and Grok's (TS4 L7) alike.
// Each runtime leaves a mark the others do not, and these cases pin the
// marks DS12 recorded and Grok's guide documents.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { detectHookRuntime } from "#hooks/runtimeDetection.ts";

const noEnv: NodeJS.ProcessEnv = {};

describe("runtime detection", () => {
  test("Claude Code: snake_case fields, a prompt_id, no turn_id, no Grok variable", () => {
    // The common hook input Claude Code 2.1.296 builds, read from the binary.
    const payload = {
      session_id: "c1",
      transcript_path: "/Users/x/.claude/projects/-Users-x-p/c1.jsonl",
      cwd: "/Users/x/p",
      prompt_id: "p1",
      permission_mode: "default",
      hook_event_name: "UserPromptSubmit",
      prompt: "hello",
    };
    assert.equal(detectHookRuntime(payload, noEnv), "claude_code");
  });

  test("Codex: the payload carries turn_id (DS12.TS2 L11)", () => {
    const payload = {
      session_id: "x1",
      turn_id: "t1",
      transcript_path: "/Users/x/.codex/sessions/2026/10/13/rollout-x1.jsonl",
      hook_event_name: "Stop",
      last_assistant_message: "hello back",
    };
    assert.equal(detectHookRuntime(payload, noEnv), "codex");
  });

  test("Grok: the runner sets GROK_HOOK_EVENT and GROK_SESSION_ID on every hook", () => {
    // Grok's guide, "Runner-injected variables (always available)".
    const payload = { session_id: "g1", prompt: "hello" };
    assert.equal(
      detectHookRuntime(payload, { GROK_HOOK_EVENT: "user_prompt_submit", GROK_SESSION_ID: "g1" }),
      "grok_build",
    );
    assert.equal(detectHookRuntime(payload, { GROK_SESSION_ID: "g1" }), "grok_build");
  });

  test("Grok: the payload's camelCase hookEventName names it too (DS12.TS4 L8)", () => {
    const payload = {
      hookEventName: "stop",
      hook_event_name: "Stop",
      sessionId: "g1",
      promptId: "p1",
      lastAssistantMessage: "hello back",
    };
    assert.equal(detectHookRuntime(payload, noEnv), "grok_build");
  });

  test("Grok's marks outrank Codex's: a camelCase payload with a turn_id is Grok's", () => {
    // Grok adds snake_case aliases on some fields. Should it ever add
    // `turn_id`, its own name for the event still decides.
    const payload = { hookEventName: "stop", sessionId: "g1", turn_id: "t1" };
    assert.equal(detectHookRuntime(payload, noEnv), "grok_build");
  });

  test("an empty payload in an empty environment is Claude Code, the fallback", () => {
    assert.equal(detectHookRuntime({}, noEnv), "claude_code");
  });

  test("a Grok variable set to the empty string is not a mark", () => {
    assert.equal(
      detectHookRuntime({ session_id: "c1", prompt: "x" }, { GROK_HOOK_EVENT: "" }),
      "claude_code",
    );
  });
});
