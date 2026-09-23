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
 * THE product version. One function, read by the updater, the release doctor,
 * the welcome card, and the MCP server, so that npm distribution changes one
 * body and nothing else (CV22.DS10.US2, decision D2).
 *
 * Today it walks upward for `pyproject.toml`'s first `version =` line, which
 * is a port of `_version_from_pyproject`. Python prefers installed
 * distribution metadata and falls back to this; TypeScript has no equivalent,
 * so the walk is the shared source, and the two agree for an editable install.
 *
 * US3 re-points this body at `package.json` when the npm package becomes real.
 * No "the two sources agree" check is added before then: `ts/package.json` is
 * deliberately `0.0.0` and `private` until that story renames it, so such a
 * check would fail by design and teach everyone to ignore it.
 */
export function packageVersion(start: string): string | null {
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
