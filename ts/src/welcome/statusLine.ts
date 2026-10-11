// The per-turn Mirror status line (CV22.DS7.TS3 plateau 4). Port of
// `compose_status_line` from `src/memory/cli/welcome.py`.
//
// This is the most-executed surface in the product: it renders after every
// turn, and CR059 made it a front-door call, so until it answers from
// TypeScript every turn pays a Node start plus a Python start.
//
// THE HOT-PATH CONTRACT, enforced by a test that puts a recording `git` shim
// first on PATH: this module spawns NOTHING. No git, no network, no provider.
// It reads the update CACHE, never the remote -- refreshing the cache is the
// full card's job, and the one time that budget was allowed to leak into the
// per-turn path it cost a 120s network timeout on a status bar.

import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { openDatabaseReadOnly } from "#db/database.ts";
import { dbNameForEnv } from "#frontDoor/dbPath.ts";
import { getIdentityContent } from "#identity/identityRead.ts";
import { GLOBAL_STICKY_DEFAULTS_SESSION_ID, getRuntimeSession } from "#mirror/runtimeSession.ts";
import { getActiveOperatingMode, modeLabel } from "#mode/operatingMode.ts";
import { readUpdateCache } from "./updateCache.ts";

export const SEPARATOR = " · ";

export interface StatusLineOptions {
  /** The resolved mirror home. Null renders nothing, as in the oracle. */
  mirrorHome: string | null;
  sessionId?: string | null;
  env?: NodeJS.ProcessEnv;
}

/** Port of `_runtime_environment_segment`: production is unmarked. */
export function runtimeEnvironmentSegment(env: NodeJS.ProcessEnv = process.env): string | null {
  const memoryEnv = env.MEMORY_ENV || "production";
  if (memoryEnv === "development") return "🛠 development";
  if (memoryEnv === "test") return "🧪 test";
  return null;
}

/** Port of `_journey_display_name`: the first line, stripped of its `# `. */
export function journeyDisplayName(content: string | null): string | null {
  if (content === null) return null;
  let firstLine = (content.split("\n", 1)[0] ?? "").trim();
  if (firstLine.startsWith("# ")) firstLine = firstLine.slice(2).trim();
  return firstLine || null;
}

/**
 * Port of `_mode_status_segment`. One read-only connection, opened only when
 * the database actually exists.
 */
function modeStatusSegment(
  homePath: string,
  sessionId: string | null,
  env: NodeJS.ProcessEnv,
): string | null {
  const dbPath = join(homePath, dbNameForEnv(env.MEMORY_ENV || "production"));
  if (!existsSync(dbPath)) return null;

  let db: ReturnType<typeof openDatabaseReadOnly>;
  try {
    db = openDatabaseReadOnly(dbPath);
  } catch {
    return null;
  }
  try {
    let state = getActiveOperatingMode(db, sessionId ?? null);
    if (state === null) {
      // No active mode: fall back to Mirror Mode carrying the sticky journey,
      // so the line still says WHERE the user is working.
      const sticky = getRuntimeSession(db, GLOBAL_STICKY_DEFAULTS_SESSION_ID);
      state = { mode: "Mirror Mode", journey: sticky?.journey ?? null };
    }
    if (!state.journey) return modeLabel(state);
    const display = journeyDisplayName(getIdentityContent(db, "journey", state.journey));
    return `${display ?? state.journey} on ${modeLabel(state)}`;
  } finally {
    db.close();
  }
}

/** Port of `compose_status_line`. Returns "" when no home can be resolved. */
export function composeStatusLine(options: StatusLineOptions): string {
  const homePath = options.mirrorHome;
  if (homePath === null) return "";
  const env = options.env ?? process.env;

  const parts = [`◇ ${basename(homePath)}`];
  const environment = runtimeEnvironmentSegment(env);
  if (environment) parts.push(environment);
  const mode = modeStatusSegment(homePath, options.sessionId ?? null, env);
  if (mode) parts.push(mode);

  const awareness = readUpdateCache(homePath);
  if (awareness && awareness.availability === "update_available") {
    parts.push(`⬆${awareness.version ? ` ${awareness.version}` : ""}`);
  } else {
    parts.push("✓");
  }
  return parts.join(SEPARATOR);
}
