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

export interface RoadmapScanOptions {
  /**
   * Keep `legacy/` in the result. Default `false`, which is what the three
   * grammar call sites need.
   *
   * It is an OPTION rather than a second function because Python has a fourth
   * call site that does the same walk and does NOT skip the archive:
   * `delivery_story_roadmap_closure.inspect_authored_closure`, whose status scan
   * reads every `index.md` under the roadmap. So an archived table row for a known
   * code blocks a Delivery Story's Done. Reusing this scan with its default would
   * let TypeScript close a Delivery Story that Python refuses — the exact defect
   * shape the plateau-5 panel stopped, and `authored_closure_reads_legacy_rows`
   * fails a port that does it.
   */
  readonly includeLegacy?: boolean;
}

/**
 * Python `sorted(roadmap_root.rglob("index.md"))`, minus `legacy/` unless asked.
 *
 * A missing or unreadable root yields an empty list, matching Python's
 * `is_dir()` guard at every call site.
 */
export function scanRoadmapIndexFiles(
  roadmapRoot: string,
  options: RoadmapScanOptions = {},
): RoadmapFile[] {
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
    .filter((components) => options.includeLegacy === true || !isLegacyPath(components))
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
