#!/usr/bin/env node
// The single entry point every Mirror hook wrapper calls.
//
// CV22.DS10.TS5 plateau 1, decision D4. Twelve shell scripts across four
// runtimes each spawned the interpreter one to five times per event. They now
// exec one Node process and name which hook they are:
//
//     node ts/src/hooks/main.ts claude:inject
//
// One entry rather than twelve files because the twelve wrappers then differ
// by exactly one word, and `hookWrappers.test.ts` asserts that -- copies that
// can only differ in one place cannot drift the way the skill copies did
// (CR071, eleven skills, two runtimes wrong for months).
//
// **A hook never fails the user's turn.** Every path returns 0 and every
// failure is recorded in `<mirror-home>/hooks.log` instead. That was the
// Python posture too (`2>/dev/null || true`), with one difference that
// matters: silence there hid nothing, because `python3` is on every macOS.
// Node is often absent from a GUI-launched runtime's PATH, so silence here
// would hide a NEW failure -- which is why the wrappers write the log line
// themselves when they cannot even find Node to run this file.

import { claudeHook } from "./claude.ts";
import {
  geminiLogAssistant,
  geminiLogUser,
  geminiSessionEnd,
  geminiSessionStart,
} from "./gemini.ts";
import { readStdin } from "./payload.ts";
import { noteHookFailure, runFrontDoorQuietly } from "./runtime.ts";

async function dispatch(name: string): Promise<number> {
  const [runtime, hook] = name.split(":");

  switch (runtime) {
    case "claude":
      return claudeHook(hook ?? "");
    case "gemini":
      switch (hook) {
        case "log-user":
          return geminiLogUser(readStdin());
        case "log-assistant":
          return geminiLogAssistant(readStdin());
        case "session-end":
          return geminiSessionEnd(readStdin());
        case "session-start":
          return geminiSessionStart();
        default:
          break;
      }
      break;
    case "codex":
      switch (hook) {
        case "session-start":
          await runFrontDoorQuietly("codex:session-start", [
            "conversation-logger",
            "session-start",
          ]);
          return 0;
        case "backup":
          await runFrontDoorQuietly("codex:backup", ["backup", "--silent"]);
          return 0;
        default:
          break;
      }
      break;
    default:
      break;
  }

  noteHookFailure("hooks", `unknown hook name: ${name}`);
  return 0;
}

const name = process.argv[2] ?? "";
try {
  process.exitCode = await dispatch(name);
} catch (error) {
  // The last line of defense. A hook that throws must still not break the
  // turn, and must still leave a trace that it happened.
  noteHookFailure(name || "hooks", error instanceof Error ? error.message : String(error));
  process.exitCode = 0;
}
