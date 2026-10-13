// Which runtime a Claude-schema hook is running in (CV21.DS2.US8).
//
// Three runtimes run the plugin's hooks as they are: Claude Code, Codex, and
// Grok. The hooks are Mirror's `claude:*` family, and until this story every
// session they logged was labelled `claude_code` (DS12.TS2 L7, TS4 L7). Each
// runtime leaves a mark the others do not:
//
//   * Grok's runner sets `GROK_HOOK_EVENT` and `GROK_SESSION_ID` on every hook
//     process (Grok's bundled guide, "Runner-injected variables"), and its
//     payload names the event in camelCase, `hookEventName` (TS4 L8);
//   * Codex's payload carries `turn_id` (TS2 L11), which Claude Code 2.1.296's
//     common hook input does not: it carries `prompt_id`, read from the binary;
//   * Claude Code is what remains.
//
// Grok is tested first because it aliases some fields into snake_case and may
// alias more; its own name for the event is the mark that cannot be a
// coincidence. A label is attribution, never authority: nothing privileged
// keys off it, so a payload that claimed another runtime's mark would mislabel
// its own session and nothing else.

import type { HookPayloadObject } from "#conversation/hookPayload.ts";

export type HookRuntime = "claude_code" | "codex" | "grok_build";

export function detectHookRuntime(
  payload: HookPayloadObject,
  env: NodeJS.ProcessEnv = process.env,
): HookRuntime {
  if (env.GROK_HOOK_EVENT || env.GROK_SESSION_ID || typeof payload.hookEventName === "string") {
    return "grok_build";
  }
  if (typeof payload.turn_id === "string" && payload.turn_id !== "") return "codex";
  return "claude_code";
}
