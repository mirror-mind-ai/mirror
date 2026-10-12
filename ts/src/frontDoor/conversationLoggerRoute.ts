// Front-door route for `conversation-logger` (CV22.DS7.US5 slice A; completed
// in CV22.DS7.US10 slice F).
//
// Routing (`routing.ts`) decides the route; this module builds the logger
// runtime from the process environment, performs the work, and writes the CLI
// contract. (Until CV22.DS10.TS5 it could also return `null` to hand an LLM-tail
// subcommand back to Python; that path left with the fallback.)

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { createZipBackup } from "#backup/zipBackup.ts";
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

/**
 * Where the route's lines go. The default is the process's own streams; the
 * `session-start --welcome` composite (CV9.E2.S32) captures them instead, so
 * the logger's stdout can travel inside one JSON envelope.
 */
export interface ConversationLoggerRouteIo {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

export async function runConversationLoggerRoute(
  db: WritableDatabase,
  dbPath: string,
  argv: readonly string[],
  io: ConversationLoggerRouteIo = {},
): Promise<number> {
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
    // The dated zip Python's `repair-journeys --apply` gates on (DS7.TS1):
    // non-silent, beside the database, `Mirror home:` line included.
    backup: (stdout) =>
      createZipBackup({
        dbPath,
        mirrorHome: dirname(dbPath),
        backupDir: null,
        silent: false,
        stdout,
      }),
  });
  const result = await runConversationLoggerCommand(db, args, runtime, {
    stdin: STDIN_SUBCOMMANDS.has(subcommand) ? readStdin() : undefined,
  });
  const out = io.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const err = io.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));
  for (const line of result.stdout) out(line);
  for (const line of result.stderr) err(line);
  return result.exitCode;
}
