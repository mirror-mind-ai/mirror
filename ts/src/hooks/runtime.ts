// Shared machinery for every Mirror hook entry.
//
// Two jobs, both learned from what the Python hooks did and what they hid.
//
// **Reuse the front door rather than reimplement it.** `cli.ts` exports
// `main(argv)`, so a hook runs the exact route a skill or the Pi extension
// runs -- same routing, same front-door log, same guards -- in ONE process.
// The Claude inject hook used to start the interpreter up to five times per
// prompt; it now starts Node once.
//
// **Never fail silently.** Every Python hook ended in `2>/dev/null || true`,
// which was survivable because `python3` is on every macOS at /usr/bin. `node`
// usually is not: it lives under nvm or Homebrew, and a GUI-launched runtime
// does not inherit that PATH. The same silence would therefore hide a NEW
// failure mode -- no logging, no inject, no close tail -- discovered weeks
// later as "Mirror stopped remembering". So a hook that cannot do its job
// writes one line to `<mirror-home>/hooks.log`, and `runtime diagnose` reports
// whether Node is resolvable from hook context.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { resolveMirrorHome } from "#frontDoor/dbPath.ts";

/** Where a hook records that it could not do its job. */
export function hookLogPath(env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    const home = resolveMirrorHome(env as Parameters<typeof resolveMirrorHome>[0]);
    return join(home, "hooks.log");
  } catch {
    // An unconfigured home has nowhere to complain to. Better than throwing
    // from inside a hook, which would surface as a broken turn.
    return null;
  }
}

/**
 * Append one line about a hook that could not complete.
 *
 * Redaction is the contract, not a nicety: this file records that something
 * failed and which hook it was, NEVER the prompt or the response. The
 * front-door log has the same rule (`hookPayloadRedaction.test.ts`), and hook
 * entries bypass the CLI where that rule is enforced, so it is restated here
 * and tested directly.
 */
export function noteHookFailure(hook: string, reason: string, env = process.env): void {
  const path = hookLogPath(env);
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const line = `${new Date().toISOString()} ${hook}: ${reason.split("\n")[0]}\n`;
    appendFileSync(path, line, { encoding: "utf8", mode: 0o600 });
  } catch {
    // A hook cannot report that it could not report. Stop here.
  }
}

export interface FrontDoorRun {
  readonly code: number;
  readonly stdout: string;
}

/**
 * Run a front-door command in this process, capturing what it printed.
 *
 * The capture is what lets the inject hook decide whether context was actually
 * produced -- the shell version tested `[ -n "$CONTEXT" ]` on command
 * substitution, and this is the same test without a second process.
 */
export async function runFrontDoor(argv: readonly string[]): Promise<FrontDoorRun> {
  const { main } = await import("#frontDoor/cli.ts");
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  // biome-ignore lint/suspicious/noExplicitAny: matching Node's overloaded write signature
  (process.stdout as any).write = (chunk: any, ...rest: any[]): boolean => {
    chunks.push(typeof chunk === "string" ? chunk : String(chunk));
    const callback = rest.find((argument) => typeof argument === "function");
    if (callback) callback();
    return true;
  };
  try {
    const code = await main([...argv]);
    return { code, stdout: chunks.join("") };
  } finally {
    process.stdout.write = original;
  }
}

/**
 * The command a failure line may name: the family and its subcommand, never
 * the arguments. Arguments are where hooks put what the user said and what the
 * model answered -- the Gemini logger passes the prompt and the response as
 * argv -- and the first version of the failure line printed all of them (TS5
 * handoff review, finding P1).
 */
function commandName(argv: readonly string[]): string {
  return argv.slice(0, 2).join(" ");
}

/**
 * Run a front-door command for its effect, swallowing failure the way the
 * shell hooks did with `|| true` -- but recording it.
 */
export async function runFrontDoorQuietly(hook: string, argv: readonly string[]): Promise<void> {
  try {
    const result = await runFrontDoor(argv);
    if (result.code !== 0) {
      noteHookFailure(hook, `\`${commandName(argv)}\` exited ${result.code}`);
    }
  } catch (error) {
    noteHookFailure(hook, error instanceof Error ? error.message : String(error));
  }
}
