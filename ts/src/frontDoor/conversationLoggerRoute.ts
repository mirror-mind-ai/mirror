// Front-door route for `conversation-logger` (CV22.DS7.US5 slice A; completed
// in CV22.DS7.US10 slice F).
//
// Routing (`routing.ts`) decides engine and gate; this module builds the
// logger runtime from the process environment, performs the TS-side work, and
// writes the CLI contract. It returns `null` when the dispatcher reports the
// subcommand is not TS-handled -- including an LLM-tail subcommand whose
// replay transport turns out to be unconfigured -- so the caller falls back to
// Python rather than risking a silent behavior change. Defense in depth behind
// the routing gate.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { runConversationLoggerCommand, STDIN_SUBCOMMANDS } from "#conversation/loggerCli.ts";
import { createLoggerRuntime } from "#conversation/loggerRuntime.ts";
import type { WritableDatabase } from "#db/database.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";

export function isConversationLoggerCommand(argv: readonly string[]): boolean {
  return argv[0] === "conversation-logger";
}

/** Python's `main()`: strip `--mirror-home X` and `--session-id X`, then `args[0]`. */
function subcommandOf(args: readonly string[]): string {
  const remaining = [...args];
  for (const option of ["--mirror-home", "--session-id"]) {
    const index = remaining.indexOf(option);
    if (index !== -1) remaining.splice(index, 2);
  }
  return remaining[0] ?? "";
}

/** The hook subcommands read their JSON payload from stdin. */
function readStdin(): string {
  try {
    return readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

export async function runConversationLoggerRoute(
  db: WritableDatabase,
  dbPath: string,
  argv: readonly string[],
): Promise<number | null> {
  const args = argv.slice(1);
  const subcommand = subcommandOf(args);
  const runtime = createLoggerRuntime({
    db,
    // The mute flag and the backups live beside the database in the resolved
    // mirror home.
    mirrorHome: dirname(dbPath),
    homeDir: homedir(),
    env: process.env,
    deps: { newId, nowIso },
  });
  const result = await runConversationLoggerCommand(db, args, runtime, {
    stdin: STDIN_SUBCOMMANDS.has(subcommand) ? readStdin() : undefined,
  });
  if (!result.handled) return null;

  for (const line of result.stdout) process.stdout.write(`${line}\n`);
  for (const line of result.stderr) process.stderr.write(`${line}\n`);
  return result.exitCode;
}
