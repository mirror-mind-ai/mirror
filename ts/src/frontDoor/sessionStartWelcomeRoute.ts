// `conversation-logger session-start --fast --welcome --format json` (CV9.E2.S32).
//
// The Pi extension used to open a session with three awaited front-door
// processes in a row -- `session-start --fast`, `welcome`, and
// `welcome --status-line` -- paying the loader's fixed cost three times
// before the user could type. They cannot run in parallel: the first WRITES
// the orientation the other two READ. They can run in one process, as long as
// the write commits before the reads. This route is that sequencing and
// nothing else.
//
// What it deliberately does not do:
//
//   * It does not teach `loggerCli.ts` to render a welcome card. That module
//     is the conversation domain; composition across domains is this layer's
//     job.
//   * It does not touch `runWelcomeRoute`'s read-only contract. Both renders
//     run through that route with captured io, AFTER the write handle has
//     closed, so the card and the status line are byte-identical to the
//     standalone commands and never share the live write lock with the
//     card's bounded update check.
//   * It has no text form. The card is free text; the only safe delimiter is
//     a JSON envelope.
//
// The envelope is for the extension, not for a skill. A skill that called this
// would put card text in front of the model through a channel the Ariad
// surface rules do not cover; `checkSkillCommandParity.ts` refuses the flag in
// every SKILL.md.

import type { WritableDatabase } from "#db/database.ts";
import { runConversationLoggerRoute } from "./conversationLoggerRoute.ts";
import { runWelcomeRoute } from "./runtimeRoute.ts";

export const SESSION_START_WELCOME_SCHEMA_VERSION = "1.0.0";

export interface SessionStartWelcomeEnvelope {
  schemaVersion: typeof SESSION_START_WELCOME_SCHEMA_VERSION;
  /** The logger's stdout lines, joined with `\n`: what `session-start --fast` prints. */
  sessionStart: string;
  /** `mirror welcome`'s stdout minus the trailing newline; `""` when disabled. */
  welcome: string;
  /** `mirror welcome --status-line`'s stdout minus the trailing newline; `""` when empty. */
  statusLine: string;
}

export interface SessionStartWelcomeOutcome {
  exitCode: number;
  /** Content-free category for the front-door log when a render failed after the write. */
  detail?: string;
}

export interface SessionStartWelcomeDeps {
  /** The real write path: opens the live write database, runs `write`, closes it. */
  withMirrorWriteDb: (
    argv: readonly string[],
    write: (db: WritableDatabase, dbPath: string) => Promise<number> | number,
  ) => Promise<number>;
  /**
   * The welcome renderer. Defaults to the real route; the render-failure test
   * injects one that throws. The write path is never injected: it is the real
   * one in every test.
   */
  renderWelcome?: typeof runWelcomeRoute;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

/** Only the `--fast --welcome` composite answers here; everything else is the plain logger route. */
export function isSessionStartWelcome(argv: readonly string[]): boolean {
  return (
    argv[0] === "conversation-logger" &&
    argv.includes("session-start") &&
    argv.includes("--welcome")
  );
}

function optionValue(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

/** The logger's `--mirror-home` reaches the welcome renders too, so both read the same home. */
function welcomeArgv(argv: readonly string[], statusLine: boolean): string[] {
  const out = ["welcome"];
  if (statusLine) out.push("--status-line");
  const home = optionValue(argv, "--mirror-home");
  if (home !== null) out.push("--mirror-home", home);
  const sessionId = optionValue(argv, "--session-id");
  if (statusLine && sessionId !== null) out.push("--session-id", sessionId);
  return out;
}

/** The logger's own argv: the composite flags removed, `--format`'s value with it. */
function withoutCompositeFlags(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === "--welcome") continue;
    if (arg === "--format") {
      i += 1;
      continue;
    }
    out.push(arg);
  }
  return out;
}

function stripTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

export async function runSessionStartWelcomeRoute(
  argv: readonly string[],
  deps: SessionStartWelcomeDeps,
): Promise<SessionStartWelcomeOutcome> {
  const stdout = deps.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = deps.stderr ?? ((text: string) => process.stderr.write(text));
  const renderWelcome = deps.renderWelcome ?? runWelcomeRoute;

  if (!argv.includes("--fast")) {
    stderr("session-start: --welcome requires --fast (the full session-start runs maintenance)\n");
    return { exitCode: 2 };
  }
  const format = optionValue(argv, "--format");
  if (format !== "json") {
    stderr(
      "session-start: --welcome requires --format json (the card has no safe text delimiter)\n",
    );
    return { exitCode: 2 };
  }

  // 1. The write, through the real path. Its handle is closed when this returns.
  const loggerArgv = withoutCompositeFlags(argv);
  const sessionStartLines: string[] = [];
  const exitCode = await deps.withMirrorWriteDb(loggerArgv, (db, dbPath) =>
    runConversationLoggerRoute(db, dbPath, loggerArgv, {
      stdout: (line) => sessionStartLines.push(line),
      // The logger's refusals keep going to stderr, as they do standalone.
      stderr: (line) => stderr(`${line}\n`),
    }),
  );
  if (exitCode !== 0) return { exitCode };

  // 2. The reads, after the write committed and its handle closed. A render
  //    failure must not lose the unmute: the envelope still goes out, with the
  //    failed field empty, and the category reaches the front-door log.
  let detail: string | undefined;
  const render = (statusLine: boolean): string => {
    let captured = "";
    try {
      renderWelcome(welcomeArgv(argv, statusLine), { stdout: (text) => (captured += text) });
    } catch (error) {
      detail = `render-failed=${error instanceof Error ? error.name : "unknown"}`;
      return "";
    }
    return stripTrailingNewline(captured);
  };
  const envelope: SessionStartWelcomeEnvelope = {
    schemaVersion: SESSION_START_WELCOME_SCHEMA_VERSION,
    sessionStart: sessionStartLines.join("\n"),
    welcome: render(false),
    statusLine: render(true),
  };
  stdout(`${JSON.stringify(envelope)}\n`);
  return detail ? { exitCode: 0, detail } : { exitCode: 0 };
}
