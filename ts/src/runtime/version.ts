// The project's version, read from source.
//
// Extracted from `runtime/git.ts` (CV22.DS9.TS2): the MCP server reports this
// string in `initialize`, and importing the git module -- which spawns
// `git`, carries network timeouts, and owns the read-only-repository boundary --
// to learn a version is the wrong dependency direction. `git.ts` re-exports it,
// so the runtime surface's call sites are unchanged.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Port of `_version_from_pyproject`: walk upward for the first `version =`
 * line. Python prefers installed distribution metadata and falls back to this;
 * TypeScript has no equivalent metadata, so the walk is the shared source. The
 * two agree for an editable install.
 *
 * DS10 re-points this at the npm package's own version when npm owns
 * distribution; until then `pyproject.toml` is the single source of truth the
 * plugin manifest is also generated from.
 */
export function versionFromPyproject(start: string): string | null {
  let current = resolve(start);
  for (;;) {
    const candidate = join(current, "pyproject.toml");
    if (existsSync(candidate)) {
      for (const line of readFileSync(candidate, "utf8").split("\n")) {
        if (line.trim().startsWith("version =")) {
          const quoted = line.split("=", 2)[1]?.trim() ?? "";
          const value = quoted.replace(/^["']|["']$/g, "");
          if (value) return value;
        }
      }
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
