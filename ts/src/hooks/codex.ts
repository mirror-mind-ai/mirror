// Codex hook entries (CV22.DS10.TS5 handoff review, finding N3).
//
// Codex has no hook system, so `scripts/codex-mirror.sh` wraps the `codex`
// command itself and calls these through two generated wrappers under
// `scripts/codex-hooks/`. Until the handoff review the script called the front
// door directly: it found `node` on PATH alone, silenced every failure, and
// built its command as a string that a checkout path with a space split in
// two. Going through the wrappers gives it the same Node resolution and the
// same hooks.log record as every other runtime.
//
// The payload comes as arguments, not stdin: the wrapper, not a runtime,
// decides what to pass, and a path is safer as one quoted argument than
// embedded in hand-written JSON.

import { runFrontDoorQuietly } from "./runtime.ts";

/** Wrapper start: make sure logging is on for this session. */
export async function codexSessionStart(): Promise<number> {
  await runFrontDoorQuietly("codex:session-start", ["conversation-logger", "session-start"]);
  return 0;
}

/**
 * Wrapper exit: import the session Codex wrote, close it, then take the silent
 * backup. The transcript and its session id are both absent when Codex wrote
 * no session for this directory; the backup runs either way, as it always has.
 */
export async function codexSessionEnd(transcriptPath: string, sessionId: string): Promise<number> {
  if (transcriptPath && sessionId) {
    await runFrontDoorQuietly("codex:session-end", [
      "conversation-logger",
      "backfill-codex-session",
      transcriptPath,
      "--interface",
      "codex",
    ]);
    await runFrontDoorQuietly("codex:session-end", [
      "conversation-logger",
      "session-end-pi",
      sessionId,
    ]);
  }
  await runFrontDoorQuietly("codex:session-end", ["backup", "--silent"]);
  return 0;
}
