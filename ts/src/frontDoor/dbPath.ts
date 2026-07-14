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
//   not write to the homes root), unlike the pre-CR024 silent fallback.
//
// Front-door-only extension: the CLI flags `--db-path` and `--mirror-home`
// are explicit per-invocation intent and take precedence over all env vars.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { expandHome } from "../util/paths.ts";
import { optionValue } from "./args.ts";

/** Raised when no database location can be resolved — maps to CLI exit 2. */
export class MirrorHomeNotConfiguredError extends Error {}

const DB_NAMES: Record<string, string> = {
  production: "memory.db",
  development: "memory_dev.db",
  test: "memory_test.db",
};

const DEFAULT_USER_HOMES_DIR = ".mirror-minds";
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
}

/** Injection points so tests can run without touching the real filesystem. */
export interface DbPathIo {
  home?: string;
  exists?: (path: string) => boolean;
  warn?: (message: string) => void;
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
  const derivedHome = explicitUser ? join(home, DEFAULT_USER_HOMES_DIR, explicitUser) : null;

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
  throw new MirrorHomeNotConfiguredError(
    "Mirror home is not configured. Set MIRROR_HOME or MIRROR_USER " +
      "(or pass an explicit MEMORY_DIR/DB_PATH override).",
  );
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
