// Durable, redacted observability for the front door (CR026).
//
// The front door is a production write path that previously left no trace of
// backup failures, guard refusals, SQLITE_BUSY, or resolution problems. This
// appends a metadata-only line per invocation to `<mirror home>/front-door.log`
// (beside `mirror-logger.log`), under a fail-quietly contract: logging never
// throws and never blocks the user command.
//
// Redaction is structural (RS005/CR033): a `FrontDoorLogEntry` carries only the
// command name, the route, the exit code, and a short error CATEGORY — never
// argv payloads (`--content`) or stdin. Callers must not put argument values in
// `detail`.

import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface FrontDoorLogEntry {
  command: string | null;
  route: "ts" | "python";
  exitCode: number;
  /** A short, content-free note or error category. Never argument values. */
  detail?: string;
}

/** The log path for a resolved database path (sibling of the DB). */
export function frontDoorLogPath(dbPath: string): string {
  return join(dirname(dbPath), "front-door.log");
}

/** Append one redacted line. Fail-quietly: any error is swallowed. */
export function logFrontDoor(logPath: string | null, entry: FrontDoorLogEntry): void {
  if (!logPath) return;
  try {
    const level = entry.exitCode === 0 ? "INFO" : "ERROR";
    const detail = entry.detail ? entry.detail.replace(/[\r\n\t]+/g, " ") : "";
    const line = [
      new Date().toISOString(),
      level,
      entry.command ?? "(none)",
      entry.route,
      `exit=${entry.exitCode}`,
      detail,
    ].join("\t");
    appendFileSync(logPath, `${line}\n`);
  } catch {
    // Logging must never break the user command (fail-quietly contract).
  }
}
