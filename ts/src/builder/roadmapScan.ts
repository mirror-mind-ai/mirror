// CV22.DS7.US8 plateau 1 — the one filesystem scan every roadmap reader shares.
//
// Python has three call sites that all do `sorted(roadmap_root.rglob("index.md"))`
// and then skip `legacy/`: `pull_candidates.inspect_pull_candidates`,
// `roadmap_position.resolve_roadmap_position`, and
// `story_paths._group_roadmap_headings`. They are one function here for the same
// reason `roadmap_grammar.py` exists in Python — three copies of a scan is three
// chances for the ordering to drift.
//
// The ordering is the whole point. `sorted()` over `Path` objects compares
// COMPONENT LISTS, so `a/b` precedes `a-x/c`; a JavaScript `sort()` over joined
// paths puts `a-x/c` first because `-` (0x2D) sorts before `/` (0x2F). That
// order decides which candidate `_recommend` returns and the order of the
// rendered Backlog, so a naive sort changes what the Navigator is told to pull
// next. Measured: Python 3.10 and 3.12 agree with each other, and on this
// project's real 352-file tree the two orders happen to coincide today — which
// is why the fixture stages the collision deliberately rather than trusting an
// accident of directory naming.

import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { comparePathComponents } from "#util/pythonText.ts";
import { isLegacyPath } from "./roadmapGrammar.ts";

export interface RoadmapFile {
  /** Path components relative to the roadmap root, ending in `index.md`. */
  components: string[];
  /** POSIX path relative to the roadmap root. */
  relativePath: string;
  /** Absolute path on disk. */
  absolutePath: string;
}

/**
 * Python `sorted(roadmap_root.rglob("index.md"))`, minus `legacy/`.
 *
 * A missing or unreadable root yields an empty list, matching Python's
 * `is_dir()` guard at every call site.
 */
export function scanRoadmapIndexFiles(roadmapRoot: string): RoadmapFile[] {
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(roadmapRoot, { recursive: true, withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[][] = [];
  for (const entry of entries) {
    if (entry.name !== "index.md") continue;
    if (!entry.isFile()) continue;
    const parents = relative(roadmapRoot, entry.parentPath).split(sep).filter(Boolean);
    found.push([...parents, entry.name]);
  }
  found.sort(comparePathComponents);
  return found
    .filter((components) => !isLegacyPath(components))
    .map((components) => ({
      components,
      relativePath: components.join("/"),
      absolutePath: [roadmapRoot, ...components].join(sep),
    }));
}

/**
 * Python's `try: path.read_text(encoding="utf-8") except OSError: continue`.
 * An unreadable file is skipped, not fatal — a permission error in one package
 * must not empty the whole roadmap.
 */
export function readRoadmapFile(absolutePath: string): string | null {
  try {
    return readFileSync(absolutePath, "utf8");
  } catch {
    return null;
  }
}
