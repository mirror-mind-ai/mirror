#!/usr/bin/env node
// The single entry point every Mirror hook wrapper calls.
//
// CV22.DS10.TS5 plateau 1, decision D4. Twelve shell scripts across four
// runtimes each spawned the interpreter one to five times per event. They now
// run one Node process and name which hook they are:
//
//     node ts/src/hooks/main.ts claude:inject
//
// Arguments after the name are the hook's own; only the Codex wrapper passes
// any, since Codex has no hook payload to read (`codex.ts`).
//
// One entry rather than one file per hook because the generated wrappers then
// differ only in the hook name and their depth, and `hooks.test.ts` asserts
// that -- copies that can differ in only one place cannot drift the way the
// skill copies did (CR071, eleven skills, two runtimes wrong for months).
//
// **A hook never fails the user's turn.** Every path returns 0 and every
// failure is recorded in `<mirror-home>/hooks.log` instead. That was the
// Python posture too (`2>/dev/null || true`), with one difference that
// matters: silence there hid nothing, because `python3` is on every macOS.
// Node is often absent from a GUI-launched runtime's PATH, so silence here
// would hide a NEW failure -- which is why the wrappers write the log line
// themselves when they cannot find a Node that runs this file. That is also
// why this file must exit 0: the wrappers read any other exit as Node failing.

import { claudeHook } from "./claude.ts";
import { codexSessionEnd, codexSessionStart } from "./codex.ts";
import {
  geminiLogAssistant,
  geminiLogUser,
  geminiSessionEnd,
  geminiSessionStart,
} from "./gemini.ts";
import { readStdin } from "./payload.ts";
import { noteHookFailure } from "./runtime.ts";

async function dispatch(name: string, args: readonly string[]): Promise<number> {
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
      // Called by `scripts/codex-mirror.sh` through its generated wrappers.
      switch (hook) {
        case "session-start":
          return codexSessionStart();
        case "session-end":
          return codexSessionEnd(args[0] ?? "", args[1] ?? "");
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
  process.exitCode = await dispatch(name, process.argv.slice(3));
} catch (error) {
  // The last line of defense. A hook that throws must still not break the
  // turn, and must still leave a trace that it happened.
  noteHookFailure(name || "hooks", error instanceof Error ? error.message : String(error));
  process.exitCode = 0;
}
