// `init <user>`: the front door route that creates a user home (DS7.US1 Slice B).
// It moved out of cli.ts when it learned to adopt a home that already exists (CR185).

import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { newUserNameProblem } from "#identity/identityKey.ts";
import {
  defaultUserHome,
  IdentityRootExistsError,
  initUserHome,
  TemplatesNotFoundError,
} from "#init/init.ts";
import { configFilePath, writeConfigValue } from "#runtime/config.ts";
import { runningTreeRoot } from "#runtime/treeRoot.ts";
import { detectRuntimes, runtimeWiringLines } from "#runtime/wiring.ts";
import { isExecutable } from "#util/paths.ts";
import { PROGRAM } from "#util/program.ts";
import { dbNameForEnv, resolveMirrorHome } from "./dbPath.ts";
import { isMirrorHome } from "./mirrorHomes.ts";

/**
 * Serve `init <user>` (DS7.US1 Slice B). Filesystem-only — no database is
 * opened. Python's argparse defines only the `user` positional (no
 * --mirror-home/--db-path), so none are stripped here.
 *
 * Deliberate divergence: a missing templates root is an uncaught exception in
 * Python (a raw traceback, exit 1) -- not a designed message. This preserves
 * the contract (exit 1, a stderr message naming the failure) without
 * fabricating a fake traceback.
 *
 * CV22.DS10.US3 (D3): when no source configured a user, `init` writes
 * `MIRROR_USER=<user>` into `~/.config/mirror/env` (0600 in 0700) and says
 * where to add `OPENROUTER_API_KEY` by hand. The key is never read from argv.
 * When a user IS configured -- the checkout's `.env`, or a shell running a
 * second mirror -- the file is left alone and the person is told how to
 * select the new home, or that it is already selected.
 *
 * CR185: a home that already exists is used as it is, never refused. It is
 * the route the not-configured sentence names, and Getting Started's for
 * moving from a clone to the package and for printing the wiring again. Nothing
 * in the home is copied or changed; the configuration is written as for a new
 * home, and only the steps still left are printed.
 *
 * Plateau 3: it ends with the wiring step for each runtime found on the PATH
 * (`#runtime/wiring.ts`), with this tree's path in it, so the person is handed
 * the next line rather than a page. Printing is not automating.
 */
export function runInit(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): number {
  const user = argv[1];
  // A word that starts with `-` is a flag this command does not have, not a
  // user: `init --help` once created a home named `--help`.
  if (!user || user.startsWith("-")) {
    console.error("Usage: init <user>");
    return 2;
  }
  // And any other word is a key: the home's directory name and the value of
  // MIRROR_USER in the wiring commands printed below. CR104's rule for slugs
  // and persona ids, asked before anything is created or looked at (CR141).
  const problem = newUserNameProblem(user);
  if (problem !== null) {
    console.error(`Error: ${problem}`);
    return 2;
  }
  // Decided before `initUserHome` runs: its refusal of a populated identity
  // stays the guard under this branch, never the way into it.
  const existing = defaultUserHome(user);
  if (isMirrorHome(existing)) return adoptUserHome(user, existing, env);
  try {
    const identityRoot = initUserHome(user);
    const mirrorHome = dirname(identityRoot);
    const selection = selectionFor(mirrorHome, env);
    const steps: Step[] =
      selection === "none"
        ? [["Add OPENROUTER_API_KEY=<your key> to that file (it is created readable by you only)"]]
        : selection === "other"
          ? [selectThisOne(user, env)]
          : [];
    const prints = [
      `Created user home: ${mirrorHome}`,
      `Identity ready at: ${identityRoot}`,
      ...configurationLine(user, selection, env),
      "",
      "Next steps:",
      ...numbered([...steps, [`Run: ${PROGRAM} seed`]]),
      "\nYour identity is ready to use. Deepen it over time with:",
      `  ${PROGRAM} identity edit user identity`,
      ...runtimeWiringSection(env),
    ];
    process.stdout.write(prints.map((line) => `${line}\n`).join(""));
    return 0;
  } catch (error) {
    if (error instanceof IdentityRootExistsError || error instanceof TemplatesNotFoundError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

/**
 * `init <user>` on a home that exists (CR185). The first line is a one-line
 * summary, as for a new home: the Windows installer (PR #45) reads it. Then
 * only what is left: the configuration, the key when none is set, `seed` when
 * the home has no database, and the wiring.
 */
function adoptUserHome(user: string, home: string, env: NodeJS.ProcessEnv): number {
  const selection = selectionFor(home, env);
  const config = configFilePath(env);
  const steps: Step[] = [];
  if (selection === "other") steps.push(selectThisOne(user, env));
  else if (!env.OPENROUTER_API_KEY) {
    steps.push([
      `Add OPENROUTER_API_KEY=<your key> to ${config} (moving from a clone? copy the line from its .env)`,
    ]);
  }
  if (!existsSync(join(home, dbNameForEnv(env.MEMORY_ENV || "production")))) {
    steps.push([`Run: ${PROGRAM} seed`]);
  }
  const prints = [
    `Found user home: ${home} (nothing in it was changed)`,
    ...configurationLine(user, selection, env),
    ...(steps.length > 0 ? ["", "Next steps:", ...numbered(steps)] : []),
    ...runtimeWiringSection(env),
  ];
  process.stdout.write(prints.map((line) => `${line}\n`).join(""));
  return 0;
}

/** Which home this machine already selects: none, this one, or another. */
type Selection = "none" | "this" | "other";

/**
 * Read once, for a new home and an existing one alike. Compared as real paths,
 * so a home reached through a symlink, or named by a `MIRROR_HOME` spelled
 * another way, is still this one. A selection that does not resolve (a
 * `MIRROR_HOME` that conflicts with `MIRROR_USER`) is not this home, and not
 * `init`'s to repair.
 */
function selectionFor(home: string, env: NodeJS.ProcessEnv): Selection {
  if (!env.MIRROR_USER && !env.MIRROR_HOME) return "none";
  try {
    const selected = resolveMirrorHome(env, { warn: () => {} });
    return realPath(selected) === realPath(home) ? "this" : "other";
  } catch {
    return "other";
  }
}

function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** The `Configuration:` line: written now, already this home, or nothing when another is selected. */
function configurationLine(user: string, selection: Selection, env: NodeJS.ProcessEnv): string[] {
  if (selection === "none") {
    return [
      `Configuration: ${writeConfigValue("MIRROR_USER", user, { env })} (MIRROR_USER=${user})`,
    ];
  }
  return selection === "this" ? ["Configuration: already selects this home"] : [];
}

/** One numbered step: its first line takes the number, the rest are indented under it. */
type Step = readonly string[];

function selectThisOne(user: string, env: NodeJS.ProcessEnv): Step {
  return [
    `This machine already selects a user; to use this one, run with MIRROR_USER=${user}`,
    `     or set it in ${configFilePath(env)}`,
  ];
}

function numbered(steps: readonly Step[]): string[] {
  return steps.flatMap(([first, ...rest], index) => [`  ${index + 1}. ${first}`, ...rest]);
}

/** The "Wire your runtime" tail of `init`, empty when no runtime is on the PATH. */
function runtimeWiringSection(env: NodeJS.ProcessEnv): string[] {
  const detected = detectRuntimes(env, isExecutable);
  if (detected.length === 0) return [];
  const root = runningTreeRoot();
  return [
    "\nWire your runtime to this install (each step is one you run and can read first):",
    ...detected.flatMap((runtime) => ["", ...runtimeWiringLines(runtime, root)]),
  ];
}
