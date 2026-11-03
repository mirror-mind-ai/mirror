// DB-path resolution for the TS front door — the port of the Python config
// resolution (`src/memory/config.py`).
//
// Python semantics reproduced here (CR024/CR007):
// - The environment selects the database NAME: `db_name_for_env` maps
//   production→memory.db, development→memory_dev.db, test→memory_test.db,
//   anything else→memory_<env>.db. A dev session must never touch memory.db.
// - Env-var precedence matches Python: DB_PATH (full file path) wins over
//   every derived directory; then MEMORY_PROD_DIR (production only), then
//   MEMORY_DIR, then the mirror home from MIRROR_HOME/MIRROR_USER.
// - MIRROR_HOME and MIRROR_USER conflict (home basename must equal the user,
//   as in `resolve_mirror_home`) raises instead of silently preferring one.
// - MIRROR_USER falls back to the legacy `~/.mirror/<user>` home when the
//   modern `~/.mirror-minds/<user>` does not exist (one-line stderr warning,
//   permanent support — see docs/project/decisions.md).
// - Nothing configured fails loudly (CV9.E2.S6: unconfigured resolution must
//   not write to the homes root), unlike the pre-CR024 silent fallback. The
//   sentence says what to run and which file that writes, naming the homes it
//   finds (CR185): a move from a clone to the package leaves a home that no
//   configuration points at, and the person needs the command, not the cause.
//
// Front-door-only extension: the CLI flags `--db-path` and `--mirror-home`
// are explicit per-invocation intent and take precedence over all env vars.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { configFilePath } from "#runtime/config.ts";
import { expandHome } from "#util/paths.ts";
import { PROGRAM } from "#util/program.ts";
import { pyRepr } from "#util/pythonText.ts";
import { shellWord } from "#util/shellWord.ts";
import { optionValue } from "./args.ts";
import { type FoundHome, findMirrorHomes, homesRoot, userHomePath } from "./mirrorHomes.ts";

/** Raised when no database location can be resolved — maps to CLI exit 2. */
export class MirrorHomeNotConfiguredError extends Error {}

const DB_NAMES: Record<string, string> = {
  production: "memory.db",
  development: "memory_dev.db",
  test: "memory_test.db",
};

const LEGACY_USER_HOMES_DIR = ".mirror";

/** Port of Python `db_name_for_env`: one (environment) → one database name. */
export function dbNameForEnv(env: string): string {
  return DB_NAMES[env] ?? `memory_${env}.db`;
}

/** The env-var slice the resolver reads. `process.env` satisfies it. */
export interface DbPathEnv {
  MEMORY_ENV?: string;
  DB_PATH?: string;
  MEMORY_PROD_DIR?: string;
  MEMORY_DIR?: string;
  MIRROR_HOME?: string;
  MIRROR_USER?: string;
  /** Read only to name the config file in the not-configured sentence. */
  XDG_CONFIG_HOME?: string;
}

/** Injection points so tests can run without touching the real filesystem. */
export interface DbPathIo {
  home?: string;
  exists?: (path: string) => boolean;
  warn?: (message: string) => void;
  /** The homes under `<home>/.mirror-minds`, for the not-configured sentence. */
  homes?: (home: string) => readonly FoundHome[];
}

/**
 * Port of Python `resolve_mirror_home`: MIRROR_HOME wins; MIRROR_USER derives
 * `<home>/.mirror-minds/<user>` (with the legacy `.mirror` fallback); both set
 * and inconsistent raises; neither set raises.
 */
export function resolveMirrorHome(env: DbPathEnv, io: DbPathIo = {}): string {
  const home = io.home ?? homedir();
  const exists = io.exists ?? existsSync;
  const warn = io.warn ?? ((message: string) => console.error(message));

  const explicitHome = env.MIRROR_HOME ?? "";
  const explicitUser = env.MIRROR_USER ?? "";
  const resolvedHome = explicitHome ? expandHome(explicitHome) : null;
  const derivedHome = explicitUser ? userHomePath(explicitUser, home) : null;

  if (resolvedHome && explicitUser && basename(resolvedHome) !== explicitUser) {
    throw new MirrorHomeNotConfiguredError(
      `MIRROR_HOME (${resolvedHome}) conflicts with MIRROR_USER (${explicitUser}).`,
    );
  }
  if (resolvedHome) return resolvedHome;
  if (derivedHome) {
    if (!exists(derivedHome)) {
      const legacyHome = join(home, LEGACY_USER_HOMES_DIR, explicitUser);
      if (exists(legacyHome)) {
        warn(
          `warning: using legacy mirror home at ${legacyHome}. ` +
            `To migrate: mv ${legacyHome} ${derivedHome}. ` +
            "The legacy path remains supported indefinitely.",
        );
        return legacyHome;
      }
    }
    return derivedHome;
  }
  throw new MirrorHomeNotConfiguredError(homeNotConfiguredMessage(env, io));
}

/**
 * The not-configured sentence (CR185), one line: what to run, and which file
 * that command writes.
 *
 * Every surface prints it: `runtime update`, `migrate`, and `backup` bare, the
 * other commands after `Mirror TS front door:`, and `runtime status` as its
 * `Mirror home note:`. Built only when nothing resolves, so a hook on an
 * unconfigured machine pays one directory read for a message it discards.
 *
 * A home name reaches the line bare only when `init` accepts it, so the line
 * cannot be broken, or carry an escape sequence, by a directory name. Any other
 * home is offered `MIRROR_HOME`, its path printed as a repr.
 */
export function homeNotConfiguredMessage(env: DbPathEnv, io: DbPathIo = {}): string {
  const home = io.home ?? homedir();
  const config = configFilePath({ XDG_CONFIG_HOME: env.XDG_CONFIG_HOME }, home);
  const homes = (io.homes ?? findMirrorHomes)(home);
  const sentences: string[] = [];
  const command = initCommandFor(homes, homesRoot(home));
  if (command !== null) {
    sentences.push(`${command.sentence} (it writes MIRROR_USER=${command.name} to ${config}).`);
  }
  for (const other of homes.filter((found) => !found.nameable)) {
    const path = pyRepr(other.path);
    sentences.push(`To use the home at ${path}, add MIRROR_HOME=${path} to ${config}.`);
  }
  if (sentences.length === 0) {
    const create = `${PROGRAM} init <your-name>`;
    sentences.push(
      `To create one, run: ${create} (it writes MIRROR_USER=<your-name> to ${config}).`,
      `If yours lives elsewhere, add MIRROR_HOME=<path> to ${config}.`,
    );
  }
  return ["Mirror home is not configured.", ...sentences].join(" ");
}

/**
 * "To use the home at <path>, run: mirror init <name>", or the form for
 * several, for the homes `init` can name; null when there are none. `name` is
 * what the command takes: the one home's own name, or `<name>`. Bare `mirror`
 * prints the same sentence.
 *
 * The command is built on a line of its own, its value through `shellWord`
 * (CR104): an agent runs it as printed. A name `init` accepts is a plain token,
 * so it prints unchanged. The path and the names around the command are prose.
 */
export function initCommandFor(
  homes: readonly FoundHome[],
  root: string,
): { sentence: string; name: string } | null {
  const nameable = homes.filter((found) => found.nameable);
  const [only] = nameable;
  if (only === undefined) return null;
  if (nameable.length === 1) {
    const command = `${PROGRAM} init ${shellWord(only.name)}`;
    return { sentence: `To use the home at ${only.path}, run: ${command}`, name: only.name };
  }
  const names = nameable.map((found) => found.name).join(", ");
  const command = `${PROGRAM} init <name>`;
  return {
    sentence: `To use one of the homes in ${root} (${names}), run: ${command}`,
    name: "<name>",
  };
}

/**
 * Resolve the database file for a front-door invocation.
 *
 * Precedence: `--db-path` flag → `--mirror-home` flag → `DB_PATH` env →
 * `MEMORY_PROD_DIR` (production only) → `MEMORY_DIR` → mirror home
 * (MIRROR_HOME/MIRROR_USER). Every directory branch joins the
 * environment-specific database name; the two full-file-path branches
 * (`--db-path`, `DB_PATH`) are used as-is, matching Python.
 */
export function resolveDbPath(
  args: readonly string[],
  env: DbPathEnv = process.env,
  io: DbPathIo = {},
): string {
  const explicitDbPath = optionValue(args, "--db-path");
  if (explicitDbPath) return expandHome(explicitDbPath);

  const selectedEnv = env.MEMORY_ENV || "production";
  const dbName = dbNameForEnv(selectedEnv);

  const explicitHome = optionValue(args, "--mirror-home");
  if (explicitHome) return join(expandHome(explicitHome), dbName);
  if (env.DB_PATH) return expandHome(env.DB_PATH);
  if (selectedEnv === "production" && env.MEMORY_PROD_DIR) {
    return join(expandHome(env.MEMORY_PROD_DIR), dbName);
  }
  if (env.MEMORY_DIR) return join(expandHome(env.MEMORY_DIR), dbName);
  return join(resolveMirrorHome(env, io), dbName);
}
