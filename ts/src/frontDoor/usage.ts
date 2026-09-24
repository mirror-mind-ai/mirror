// The front door's own answer for a name it does not know (CV22.DS10.TS5, D2).
//
// Until TS5 every such name fell through to Python: an unknown command reached
// `_dispatch`'s `Unknown command` and its usage block, an unknown subcommand
// reached argparse, which names the program `__main__.py`. With the fallback
// gone nobody would own the answer, and an unowned answer is how a surface
// disappears without anyone deciding to remove it. So TypeScript owns it, in
// the shapes D2 records:
//
//   * top level -- `Unknown command: <name>`, a blank line, and the usage
//     block, all on stdout, exit 1: `_dispatch`'s shape, the one scripts saw.
//     No command at all prints the usage block alone, exit 1.
//   * a family -- argparse's shape: one `usage:` line and one `error:` line on
//     stderr, exit 2, with the FAMILY as the program name instead of
//     `__main__.py`. US2 gave `runtime` exactly this shape first; this module
//     generalizes it, byte-for-byte.
//   * `-h` / `--help` -- the usage on stdout, exit 0, at either level (the
//     plateau-2 amendment to D2): help must not become an error just because
//     the program that used to print it is gone.
//
// Seven families answered an unknown subcommand differently in the oracle
// (inventory F6): a usage line on stdout with exit 1, `Unknown subcommand` with
// exit 1, or -- `conversation-logger` -- nothing at all with exit 0. They move
// to the uniform shape deliberately; the table is in the story's inventory.

import { PROGRAM } from "#util/program.ts";

/** The program name the top-level usage prints: `#util/program.ts`, the one place US3 renames. */
export { PROGRAM };

/**
 * Every top-level command the front door answers, in the oracle's order, with a
 * one-line summary. The unknown-command answer prints this; a test proves every
 * name here routes somewhere other than the unknown-command answer.
 */
export const FRONT_DOOR_COMMANDS: ReadonlyArray<readonly [name: string, summary: string]> = [
  ["init", "Initialize a user home from identity templates"],
  ["seed", "Seed identity YAML files into the database"],
  ["identity", "Read and update identity in the database"],
  ["list", "List personas, journeys, extensions, or all"],
  ["inspect", "Inspect a persona, an extension, the runtime catalog, or the call ledgers"],
  ["detect-persona", "Show persona routing matches for a query"],
  ["extensions", "List, validate, sync, install, or uninstall extensions"],
  ["ext", "Run a command-skill extension's CLI"],
  ["mirror", "Mirror Mode: load context, log, deactivate"],
  ["mode", "Operating mode lifecycle"],
  ["conversation-logger", "Conversation logging"],
  ["backup", "Create a zipped backup of the memory database"],
  ["repair-encoding", "Repair reversible UTF-8 mojibake in user text"],
  ["journal", "Record a journal entry"],
  ["journey", "Inspect or update a journey"],
  ["build", "Builder Mode and the Ariad lifecycle"],
  ["explore", "Explorer Mode"],
  ["soul", "Soul Mode"],
  ["memories", "List or search memories"],
  ["conversations", "List conversations, or append a message batch"],
  ["recall", "Load messages from a previous conversation"],
  ["tasks", "Task management"],
  ["week", "Weekly planning"],
  ["journeys", "List journeys with status and stage"],
  ["consult", "Ask other LLMs through OpenRouter"],
  ["descriptor", "Generate and list routing descriptors"],
  ["consolidate", "Scan memories for patterns and manage consolidation proposals"],
  ["shadow", "Surface and promote shadow-layer observations"],
  ["mcp", "Run the Mirror MCP server over stdio"],
  ["runtime", "Runtime status, drift, backups, version, and updates"],
  ["welcome", "Render the welcome card"],
];

const NAME_WIDTH = Math.max(...FRONT_DOOR_COMMANDS.map(([name]) => name.length)) + 2;

/** The top-level usage block. */
export const USAGE = [
  `Usage: ${PROGRAM} <command> [args]`,
  "",
  "Commands:",
  ...FRONT_DOOR_COMMANDS.map(([name, summary]) => `  ${name.padEnd(NAME_WIDTH)}${summary}`),
  "",
].join("\n");

/** What routing hands the front door when a name is not one it answers. */
export type UsageRequest =
  | {
      readonly scope: "top-level";
      /** The unknown name, or null when no command was given at all. */
      readonly given: string | null;
    }
  | {
      readonly scope: "family";
      /** The family as a user types it: `build`, `explore story`. */
      readonly program: string;
      /** What the family does answer, from routing's own allowlist. */
      readonly choices: readonly string[];
      /** The unrecognized subcommand, or "" when none was given. */
      readonly given: string;
    };

export interface UsageAnswer {
  readonly stream: "stdout" | "stderr";
  readonly exitCode: number;
  readonly text: string;
}

const HELP = new Set(["-h", "--help"]);

/** One family's `usage:` line. */
export function familyUsageLine(program: string, choices: readonly string[]): string {
  return `usage: ${program} [-h] {${choices.join(",")}} ...\n`;
}

/**
 * argparse's refusal, in the product's vocabulary: the usage line, then one
 * `error:` line naming what was wrong.
 */
export function renderUnknownSubcommand(
  program: string,
  choices: readonly string[],
  given: string,
): string {
  const detail =
    given === ""
      ? "the following arguments are required: command"
      : `argument command: invalid choice: '${given}' (choose from ${choices.join(", ")})`;
  return `${familyUsageLine(program, choices)}${program}: error: ${detail}\n`;
}

/** Render the answer for a request routing could not place. */
export function answerUsage(request: UsageRequest): UsageAnswer {
  if (request.scope === "top-level") {
    if (request.given !== null && HELP.has(request.given)) {
      return { stream: "stdout", exitCode: 0, text: USAGE };
    }
    const unknown = request.given === null ? "" : `Unknown command: ${request.given}\n\n`;
    return { stream: "stdout", exitCode: 1, text: `${unknown}${USAGE}` };
  }
  if (HELP.has(request.given)) {
    return {
      stream: "stdout",
      exitCode: 0,
      text: familyUsageLine(request.program, request.choices),
    };
  }
  return {
    stream: "stderr",
    exitCode: 2,
    text: renderUnknownSubcommand(request.program, request.choices, request.given),
  };
}
