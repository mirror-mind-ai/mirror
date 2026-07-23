// `seed` path resolution — the port of the bespoke resolution inside
// memory.cli.seed.seed(), which is NOT the same precedence chain
// `resolveDbPath` (dbPath.ts) uses for every other command. Verified against
// the live oracle (never assumed) because it diverges in a genuinely
// surprising way:
//
// - `identity_root`/`mirror_home` resolve via `--mirror-home` or the plain
//   MIRROR_HOME/MIRROR_USER chain (`resolveMirrorHome`) -- completely
//   independent of `--env`, `MEMORY_DIR`, or `DB_PATH`.
// - When `--mirror-home` IS given, the database path is ALWAYS
//   `<mirror_home>/memory.db` -- `--env` is silently ignored for the
//   filename (`default_db_path_for_home` hardcodes "memory.db"). Confirmed
//   live: `seed --mirror-home X --env test` writes `X/memory.db`, not
//   `X/memory_test.db`.
// - When `--mirror-home` is absent and `--env` differs from the ambient
//   `MEMORY_ENV` (or ambient is unset, defaulting "production" like Python's
//   module-level MEMORY_ENV constant), the database path follows
//   `db_path_for_env`: MEMORY_PROD_DIR (production only) > MEMORY_DIR > the
//   resolved mirror home, with the env-appropriate filename -- but WITHOUT
//   checking `DB_PATH` (that env var is only wired to the *ambient*
//   environment in Python, cached once at import time).
// - When `--mirror-home` is absent and `--env` matches the ambient
//   `MEMORY_ENV` (or is omitted), the database path follows the SAME full
//   generic chain every other command uses (`require_db_path()` ==
//   `resolveDbPath`).
//
// `--db-path` is a TS-front-door-only convenience (Python's `seed` CLI has no
// such flag), kept here for consistency with every other ported command --
// it wins over everything, as documented in dbPath.ts.

import { join } from "node:path";
import { expandHome } from "../util/paths.ts";
import { optionValue } from "./args.ts";
import {
  type DbPathEnv,
  type DbPathIo,
  dbNameForEnv,
  MirrorHomeNotConfiguredError,
  resolveDbPath,
  resolveMirrorHome,
} from "./dbPath.ts";

export interface SeedPaths {
  dbPath: string;
  identityRoot: string;
  mirrorHome: string;
  env: string;
}

/**
 * Resolve `seed`'s database path, identity root, mirror home, and effective
 * env, mirroring the Python branches documented above exactly. Throws
 * MirrorHomeNotConfiguredError when nothing resolves (mapped to exit 2 by the
 * caller, matching every other command's unconfigured-home contract).
 */
export function resolveSeedPaths(
  args: readonly string[],
  env: DbPathEnv = process.env,
  io: DbPathIo = {},
): SeedPaths {
  const explicitDbPath = optionValue(args, "--db-path");
  const explicitMirrorHome = optionValue(args, "--mirror-home");
  const envFlag = optionValue(args, "--env");
  const ambientEnv = env.MEMORY_ENV || "production";
  const effectiveEnv = envFlag || ambientEnv;

  const mirrorHome = explicitMirrorHome
    ? expandHome(explicitMirrorHome)
    : resolveMirrorHome(env, io);
  const identityRoot = join(mirrorHome, "identity");

  if (explicitDbPath) {
    return { dbPath: expandHome(explicitDbPath), identityRoot, mirrorHome, env: effectiveEnv };
  }
  if (explicitMirrorHome) {
    // default_db_path_for_home: ALWAYS "memory.db", --env is not consulted.
    return { dbPath: join(mirrorHome, "memory.db"), identityRoot, mirrorHome, env: effectiveEnv };
  }
  if (envFlag && envFlag !== ambientEnv) {
    const dbName = dbNameForEnv(envFlag);
    let dir: string;
    if (envFlag === "production" && env.MEMORY_PROD_DIR) {
      dir = expandHome(env.MEMORY_PROD_DIR);
    } else if (env.MEMORY_DIR) {
      dir = expandHome(env.MEMORY_DIR);
    } else {
      dir = mirrorHome;
    }
    return { dbPath: join(dir, dbName), identityRoot, mirrorHome, env: effectiveEnv };
  }
  // require_db_path(): by construction neither --db-path nor --mirror-home is
  // present here, so this is exactly resolveDbPath's own DB_PATH ->
  // MEMORY_PROD_DIR -> MEMORY_DIR -> resolved-mirror-home chain -- the same
  // one every other command uses. Reused directly rather than re-implemented.
  return { dbPath: resolveDbPath(args, env, io), identityRoot, mirrorHome, env: effectiveEnv };
}

export { MirrorHomeNotConfiguredError };
