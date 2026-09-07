// `conversation-logger` CLI dispatch (CV22.DS7.US5 slice A; completed in
// CV22.DS7.US10 slice F).
//
// Ports the argument handling and stdout contract of
// `conversation_logger.main()`. The strangler's unit is
// `command + args -> stdout`, so this module returns the output rather than
// printing it: the front door writes it, and goldens grade it.
//
// Every subcommand of the family is dispatched here. The ones that cross the
// LLM close tail (`switch`, `session-end`, `session-end-pi`, full
// `session-start`, `session-maintenance`) get their tail from the runtime's
// replay-gated close hooks; when the transport is not configured they report
// `{ handled: false }` so the caller falls back to Python -- defense in depth
// behind the routing gate, which makes the same decision from the same
// environment. `repair-journeys --apply` needs the dated zip backup from the
// runtime (CV22.DS7.TS1) and refuses, like Python, when it is not available.

import { backfillCodexSession } from "#conversation/backfill.ts";
import { diagnoseJourneyAssociations, renderJourneyFindings } from "#conversation/journeyRepair.ts";
import {
  discardCurrentConversation,
  endSession,
  handleSessionEndHook,
  handleUserPromptHook,
  isMuted,
  logAssistantMessage,
  logUserMessage,
  setMute,
  switchConversation,
} from "#conversation/logger.ts";
import { LlmTailUnconfiguredError, type LoggerRuntime } from "#conversation/loggerRuntime.ts";
import {
  sessionMaintenance,
  sessionStart,
  sessionStartFast,
} from "#conversation/sessionComposites.ts";
import type { WritableDatabase } from "#db/database.ts";

export type LoggerCliResult =
  | { handled: false }
  | { handled: true; stdout: string[]; stderr: string[]; exitCode: number };

export interface LoggerCliContext {
  stdin?: string;
}

/** Every subcommand `conversation_logger.main()` dispatches. */
export const CONVERSATION_LOGGER_SUBCOMMANDS = [
  "mute",
  "unmute",
  "status",
  "log-user",
  "log-assistant",
  "user-prompt",
  "discard-current",
  "switch",
  "session-end-pi",
  "session-end",
  "session-start",
  "session-maintenance",
  "diagnose-journeys",
  "repair-journeys",
  "backfill-codex-session",
] as const;

/** The subcommands whose Python path runs `end_conversation`'s LLM close tail. */
export const LLM_TAIL_SUBCOMMANDS: ReadonlySet<string> = new Set([
  "switch",
  "session-end-pi",
  "session-end",
  "session-start",
  "session-maintenance",
]);

/** Subcommands that read their JSON payload from stdin. */
export const STDIN_SUBCOMMANDS: ReadonlySet<string> = new Set(["user-prompt", "session-end"]);

function extractOption(
  args: string[],
  name: string,
): { value: string | null; error: string | null } {
  const index = args.indexOf(name);
  if (index === -1) return { value: null, error: null };
  if (index + 1 >= args.length) {
    const noun = name === "--mirror-home" ? "a path" : name === "--limit" ? "a number" : "a value";
    return { value: null, error: `Error: ${name} requires ${noun}` };
  }
  const value = args[index + 1] as string;
  args.splice(index, 2);
  return { value, error: null };
}

/** Python `"--interface" in args` followed by `args[idx + 1]` when present. */
function interfaceOption(args: readonly string[], fallback: string): string {
  const index = args.indexOf("--interface");
  return index !== -1 && index + 1 < args.length ? (args[index + 1] as string) : fallback;
}

const ok = (stdout: string[]): LoggerCliResult => ({
  handled: true,
  stdout,
  stderr: [],
  exitCode: 0,
});

export async function runConversationLoggerCommand(
  db: WritableDatabase,
  argv: readonly string[],
  runtime: LoggerRuntime,
  context: LoggerCliContext = {},
): Promise<LoggerCliResult> {
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
  if (!(CONVERSATION_LOGGER_SUBCOMMANDS as readonly string[]).includes(command)) {
    // Python's main() silently exits 0 on an unknown subcommand.
    return ok([]);
  }

  const home = mirrorHome.value ?? runtime.mirrorHome;
  const deps = runtime.deps;

  try {
    switch (command) {
      case "mute":
        setMute(true, home);
        return ok(["Conversation logging MUTED."]);
      case "unmute":
        setMute(false, home);
        return ok(["Conversation logging ACTIVE."]);
      case "status":
        return ok([isMuted(home) ? "MUTED" : "ACTIVE"]);

      case "user-prompt":
        handleUserPromptHook(db, context.stdin ?? "", { mirrorHome: home }, deps);
        // The hook is silent and always exits 0, whatever the outcome.
        return ok([]);

      case "session-end":
        await handleSessionEndHook(
          db,
          context.stdin ?? "",
          {
            mirrorHome: home,
            claudeProjectDir: runtime.claudeProjectDir,
            homeDir: runtime.homeDir,
          },
          deps,
          await runtime.closeHooks(),
        );
        return ok([]);

      case "log-user":
      case "log-assistant": {
        const remaining = args.slice(1);
        const interfaceName = extractOption(remaining, "--interface").value ?? "claude_code";
        // Python silently does nothing with fewer than two positional arguments.
        if (remaining.length >= 2) {
          const [targetSession, content] = remaining as [string, string];
          const write = command === "log-user" ? logUserMessage : logAssistantMessage;
          write(db, targetSession, content, { interface: interfaceName }, deps);
        }
        return ok([]);
      }

      case "switch": {
        const conversationId = await switchConversation(
          db,
          sessionOption.value,
          { envSessionId: runtime.environmentSessionId },
          deps,
          await runtime.closeHooks(),
        );
        return ok([
          conversationId
            ? `New conversation created: ${conversationId}`
            : "No active session found.",
        ]);
      }

      case "session-start":
        if (args.includes("--fast")) return ok([sessionStartFast(db, home, deps.nowIso)]);
        return ok([await sessionStart(db, home, await runtime.maintenanceDeps())]);

      case "session-maintenance":
        return ok([await sessionMaintenance(db, await runtime.maintenanceDeps())]);

      case "discard-current": {
        const discarded = discardCurrentConversation(
          db,
          sessionOption.value,
          { interface: interfaceOption(args, "pi") },
          deps,
        );
        return ok([
          discarded
            ? `Discarded current conversation: ${discarded}`
            : "No current conversation to discard.",
        ]);
      }

      case "session-end-pi":
        if (args.length >= 2) {
          await endSession(
            db,
            args[1] as string,
            { extract: false },
            deps,
            await runtime.closeHooks(),
          );
        }
        return ok([]);

      case "diagnose-journeys":
      case "repair-journeys": {
        const apply = command === "repair-journeys" && args.includes("--apply");
        const limitOption = extractOption(args, "--limit");
        if (limitOption.error) {
          return { handled: true, stdout: [], stderr: [limitOption.error], exitCode: 1 };
        }
        let limit: number | null = null;
        if (limitOption.value !== null) {
          // Python `int(value)` raises ValueError on anything but an integer.
          if (!/^\s*[+-]?\d+\s*$/.test(limitOption.value)) {
            return {
              handled: true,
              stdout: [],
              stderr: [
                `ValueError: invalid literal for int() with base 10: '${limitOption.value}'`,
              ],
              exitCode: 1,
            };
          }
          limit = Number.parseInt(limitOption.value, 10);
        }
        // Python prints backup()'s progress from inside the repair, BEFORE the
        // findings; the lines are collected here so the order survives.
        const backupLines: string[] = [];
        const backup = runtime.backup;
        const findings = diagnoseJourneyAssociations(db, {
          limit,
          apply,
          ...(apply && backup ? { backup: () => backup((line) => backupLines.push(line)) } : {}),
        });
        const lines = [
          ...backupLines,
          ...renderJourneyFindings(findings, apply).replace(/\n$/, "").split("\n"),
        ];
        if (command === "repair-journeys" && !apply) {
          lines.push("Dry run only. Re-run with --apply to repair after reviewing candidates.");
        }
        return ok(lines);
      }

      case "backfill-codex-session": {
        if (args.length < 2) return ok([]);
        const path = args[1] as string;
        const count = backfillCodexSession(
          db,
          { jsonlPath: path, interface: interfaceOption(args, "codex") },
          deps,
        );
        return ok([
          count
            ? `Backfilled 1 Codex session from ${path}`
            : `No new Codex session backfilled from ${path}`,
        ]);
      }

      default:
        return ok([]);
    }
  } catch (error) {
    if (error instanceof LlmTailUnconfiguredError) return { handled: false };
    throw error;
  }
}
