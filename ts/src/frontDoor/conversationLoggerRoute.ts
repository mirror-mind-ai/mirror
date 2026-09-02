// CV22.DS7.US5 slice A — front-door route for `conversation-logger`.
//
// Routing (`routing.ts`) decides engine and gate; this module performs the
// TS-side work and writes the CLI contract. It returns `null` when the
// dispatcher reports the subcommand is not TS-handled, so the caller falls
// back to Python rather than risking a silent behavior change — defense in
// depth behind the routing gate.

import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { runConversationLoggerCommand } from "#conversation/loggerCli.ts";
import type { WritableDatabase } from "#db/database.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";

export function isConversationLoggerCommand(argv: readonly string[]): boolean {
  return argv[0] === "conversation-logger";
}

/** The hook subcommands read their JSON payload from stdin. */
function readStdin(): string {
  try {
    return readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

export function runConversationLoggerRoute(
  db: WritableDatabase,
  dbPath: string,
  argv: readonly string[],
): number | null {
  const args = argv.slice(1);
  const needsStdin = args[0] === "user-prompt";
  const result = runConversationLoggerCommand(
    db,
    args,
    // The mute flag lives beside the database in the resolved mirror home.
    { mirrorHome: dirname(dbPath), stdin: needsStdin ? readStdin() : undefined },
    { newId, nowIso },
  );
  if (!result.handled) return null;

  for (const line of result.stdout) process.stdout.write(`${line}\n`);
  for (const line of result.stderr) process.stderr.write(`${line}\n`);
  return result.exitCode;
}
