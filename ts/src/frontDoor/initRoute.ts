// `init <user>`: the front door route that creates a user home (DS7.US1 Slice B).
// It moved out of cli.ts when it learned to adopt a home that already exists (CR185).

import { dirname } from "node:path";
import { newUserNameProblem } from "#identity/identityKey.ts";
import { IdentityRootExistsError, initUserHome, TemplatesNotFoundError } from "#init/init.ts";
import { configFilePath, writeConfigValue } from "#runtime/config.ts";
import { runningTreeRoot } from "#runtime/treeRoot.ts";
import { detectRuntimes, runtimeWiringLines } from "#runtime/wiring.ts";
import { isExecutable } from "#util/paths.ts";
import { PROGRAM } from "#util/program.ts";

/**
 * Serve `init <user>` (DS7.US1 Slice B). Filesystem-only — no database is
 * opened. Python's argparse defines only the `user` positional (no
 * --mirror-home/--db-path), so none are stripped here.
 *
 * Deliberate divergence: an already-populated identity root or a missing
 * templates root are uncaught exceptions in Python (a raw traceback, exit 1) --
 * not a designed message. This preserves the contract (exit 1, a stderr
 * message naming the failure) without fabricating a fake traceback.
 *
 * CV22.DS10.US3 (D3): when no source configured a user, `init` writes
 * `MIRROR_USER=<user>` into `~/.config/mirror/env` (0600 in 0700) and says
 * where to add `OPENROUTER_API_KEY` by hand. The key is never read from argv.
 * When a user IS configured -- the checkout's `.env`, or a shell running a
 * second mirror -- the file is left alone and the person is told how to
 * select the new home.
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
  // and persona ids, asked before anything is created (CR141).
  const problem = newUserNameProblem(user);
  if (problem !== null) {
    console.error(`Error: ${problem}`);
    return 2;
  }
  try {
    const identityRoot = initUserHome(user);
    const mirrorHome = dirname(identityRoot);
    const configured = Boolean(env.MIRROR_USER || env.MIRROR_HOME);
    const configuration = configured
      ? [
          `  1. This machine already selects a user; to use this one, run with MIRROR_USER=${user}`,
          `     or set it in ${configFilePath(env)}`,
        ]
      : [
          `Configuration: ${writeConfigValue("MIRROR_USER", user, { env })} (MIRROR_USER=${user})`,
          "",
          "Next steps:",
          "  1. Add OPENROUTER_API_KEY=<your key> to that file (it is created readable by you only)",
        ];
    const prints = [
      `Created user home: ${mirrorHome}`,
      `Identity ready at: ${identityRoot}`,
      ...(configured ? ["", "Next steps:"] : []),
      ...configuration,
      `  2. Run: ${PROGRAM} seed`,
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
