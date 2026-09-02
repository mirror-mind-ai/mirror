// CV22.DS7.US5 slice A — `conversation-logger` CLI dispatch.
//
// Ports the argument handling and stdout contract of
// `conversation_logger.main()`. The strangler's unit is
// `command + args -> stdout`, so this module returns the output rather than
// printing it: the front door writes it, and goldens grade it.
//
// SLICE BOUNDARY — only subcommands that are deterministic end to end are
// handled here. `switch`, `session-end-pi`, and the `session-end` hook all
// reach Python's `end_conversation`, which runs extraction and close-time
// metadata finalization through the LLM; they stay on Python fallback until
// slices C/D supply those tails behind the replay transport. Everything else
// (session-start, session-maintenance, diagnose/repair, backfills) belongs to
// slices D/E. Unhandled subcommands return `{ handled: false }` so the caller
// falls back, which is what makes the flip per-subcommand.

import {
  discardCurrentConversation,
  handleUserPromptHook,
  isMuted,
  type LoggerDeps,
  logAssistantMessage,
  logUserMessage,
  setMute,
} from "#conversation/logger.ts";
import type { WritableDatabase } from "#db/database.ts";

export type LoggerCliResult =
  | { handled: false }
  | { handled: true; stdout: string[]; stderr: string[]; exitCode: number };

export interface LoggerCliContext {
  mirrorHome: string;
  stdin?: string;
}

/** Subcommands this slice answers from TS; everything else falls back. */
export const TS_HANDLED_SUBCOMMANDS = [
  "mute",
  "unmute",
  "status",
  "log-user",
  "log-assistant",
  "user-prompt",
  "discard-current",
] as const;

function extractOption(
  args: string[],
  name: string,
): { value: string | null; error: string | null } {
  const index = args.indexOf(name);
  if (index === -1) return { value: null, error: null };
  if (index + 1 >= args.length) {
    const noun = name === "--mirror-home" ? "a path" : "a value";
    return { value: null, error: `Error: ${name} requires ${noun}` };
  }
  const value = args[index + 1] as string;
  args.splice(index, 2);
  return { value, error: null };
}

export function runConversationLoggerCommand(
  db: WritableDatabase,
  argv: readonly string[],
  context: LoggerCliContext,
  deps: LoggerDeps,
): LoggerCliResult {
  const args = [...argv];

  // Python strips --mirror-home and --session-id before dispatch, failing with
  // exit 1 when either is present without a value.
  const mirrorHome = extractOption(args, "--mirror-home");
  if (mirrorHome.error) {
    return { handled: true, stdout: [], stderr: [mirrorHome.error], exitCode: 1 };
  }
  const sessionOption = extractOption(args, "--session-id");
  if (sessionOption.error) {
    return { handled: true, stdout: [], stderr: [sessionOption.error], exitCode: 1 };
  }
  if (args.length === 0) {
    return { handled: true, stdout: [], stderr: [], exitCode: 1 };
  }

  const command = args[0] as string;
  if (!(TS_HANDLED_SUBCOMMANDS as readonly string[]).includes(command)) {
    return { handled: false };
  }

  const home = mirrorHome.value ?? context.mirrorHome;
  const ok = (stdout: string[]): LoggerCliResult => ({
    handled: true,
    stdout,
    stderr: [],
    exitCode: 0,
  });

  if (command === "mute") {
    setMute(true, home);
    return ok(["Conversation logging MUTED."]);
  }
  if (command === "unmute") {
    setMute(false, home);
    return ok(["Conversation logging ACTIVE."]);
  }
  if (command === "status") {
    return ok([isMuted(home) ? "MUTED" : "ACTIVE"]);
  }

  if (command === "user-prompt") {
    handleUserPromptHook(db, context.stdin ?? "", { mirrorHome: home }, deps);
    // The hook is silent and always exits 0, whatever the outcome.
    return ok([]);
  }

  if (command === "log-user" || command === "log-assistant") {
    const remaining = args.slice(1);
    const interfaceOption = extractOption(remaining, "--interface");
    const interfaceName = interfaceOption.value ?? "claude_code";
    // Python silently does nothing with fewer than two positional arguments.
    if (remaining.length >= 2) {
      const [targetSession, content] = remaining as [string, string];
      const write = command === "log-user" ? logUserMessage : logAssistantMessage;
      write(db, targetSession, content, { interface: interfaceName }, deps);
    }
    return ok([]);
  }

  // discard-current
  const interfaceIndex = args.indexOf("--interface");
  const interfaceName =
    interfaceIndex !== -1 && interfaceIndex + 1 < args.length
      ? (args[interfaceIndex + 1] as string)
      : "pi";
  const discarded = discardCurrentConversation(
    db,
    sessionOption.value,
    { interface: interfaceName },
    deps,
  );
  return ok([
    discarded
      ? `Discarded current conversation: ${discarded}`
      : "No current conversation to discard.",
  ]);
}
