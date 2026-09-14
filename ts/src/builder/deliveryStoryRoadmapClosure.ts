// CV22.DS7.US8 plateau 5 — the authored-roadmap preflight for Delivery Story Done.
//
// Port of `src/memory/builder/delivery_story_roadmap_closure.py`.
//
// Every other Builder guard reads the delivery cursor. This one reads the
// NAVIGATOR'S REPOSITORY: before a Delivery Story may close, its own package, every
// known child package, and every canonical table row naming those codes must
// already say Done in authored Markdown. The agent owns the semantic edit; this
// verifies explicit evidence and never invents project meaning.
//
// Three details decide whether a port refuses the same closures Python refuses:
//
//   1. **The walk includes `legacy/`.** Python calls `rglob("index.md")` with no
//      exclusion here, unlike the three grammar call sites. An archived row for a
//      known code blocks Done — reproduced, and pinned by
//      `authored_closure_reads_legacy_rows`.
//   2. **The status pattern is LINE-ANCHORED.** `_STATUS_RE` is
//      `^\*\*Status:\*\*...$` under `re.MULTILINE`, so unlike `roadmapGrammar`'s
//      unanchored `STATUS_RE` the marker must open its line. Written with explicit
//      `(?<=^|\n)` / `(?=\n|$)` anchors because JavaScript's `m` flag also anchors
//      at U+2028/U+2029, where Python's does not.
//   3. **`_is_done` is a SUFFIX test:** `strip().casefold().endswith("done")`. So
//      `Done` and `✅ DONE` pass while `✅ Done (2026-09-14)` does not — the dated
//      form this repository's own roadmap uses. Parity-bound, recorded as a CR
//      candidate rather than smoothed here.
//
// Read-only by construction: nothing in this module writes.

import { readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { PYTHON_WHITESPACE_CLASS, pyStrip } from "#util/pythonText.ts";
import { stripMarkdownLink } from "./roadmapGrammar.ts";
import { scanRoadmapIndexFiles } from "./roadmapScan.ts";
import { resolveStoryDirectory } from "./storyPaths.ts";

const WS = `[${PYTHON_WHITESPACE_CLASS}]`;

/** Python `_STATUS_RE`: line-anchored, first match wins. */
const STATUS_LINE_RE = new RegExp(
  `(?<=^|\\n)\\*\\*Status:\\*\\*${WS}*(?<status>[^\\n]+?)${WS}*(?=\\n|$)`,
  "u",
);

export interface AuthoredClosureReport {
  /** True when nothing blocks Done. */
  readonly ready: boolean;
  /** Project-relative evidence, in the order Python discovers it. */
  readonly issues: readonly string[];
}

/** Python `_is_done`. */
function isDone(status: string): boolean {
  return pyStrip(status).toLowerCase().endsWith("done");
}

/** Python `_relative`: project-relative POSIX, raising when the path escapes. */
function projectRelative(path: string, projectRoot: string): string {
  const relation = relative(projectRoot, resolve(path));
  if (relation === "" || relation.startsWith("..") || resolve(relation) === relation) {
    // Python raises `ValueError` from `relative_to` here and the CLI prints
    // CPython's own prose. Recorded divergence (plan, Parity Contract): the
    // message is ours, the refusal is the same.
    throw new Error(
      `roadmap file ${path} is not inside the project at ${projectRoot}; ` +
        "refusing to name a path outside the project in a closure refusal",
    );
  }
  return relation.split(sep).join("/");
}

/** Python `_status_table_rows`: header-driven `Code`/`Status` extraction. */
function statusTableRows(indexPath: string): [string, string][] {
  const rows: [string, string][] = [];
  let columns: { code: number; status: number } | null = null;
  let content: string;
  try {
    content = readFileSync(indexPath, "utf8");
  } catch {
    return rows;
  }
  for (const rawLine of content.split("\n")) {
    const line = pyStrip(rawLine);
    if (!line.startsWith("|")) {
      // A non-table line CLOSES the table: a second table later in the file needs
      // its own header, exactly as Python's loop resets `columns`.
      columns = null;
      continue;
    }
    const cells = line.replace(/^\|+/u, "").replace(/\|+$/u, "").split("|").map(pyStrip);
    if (columns === null) {
      const lowered = cells.map((cell) => cell.toLowerCase());
      const code = lowered.indexOf("code");
      const status = lowered.indexOf("status");
      if (code !== -1 && status !== -1) columns = { code, status };
      continue;
    }
    if (cells.every((cell) => cell === "" || /^[-:]+$/u.test(cell))) continue;
    if (cells.length <= Math.max(columns.code, columns.status)) continue;
    rows.push([stripMarkdownLink(cells[columns.code] ?? ""), cells[columns.status] ?? ""]);
  }
  return rows;
}

/**
 * Python `inspect_authored_closure`.
 *
 * Package evidence first, in cursor order (the Delivery Story, then each child),
 * then every table row under the roadmap in path order. The issue ORDER is part of
 * the refusal message the CLI joins with `; `, so it is behavior.
 */
export function inspectAuthoredClosure(
  projectPath: string,
  options: { deliveryStory: string; childWorkItems: readonly string[] },
): AuthoredClosureReport {
  const projectRoot = resolve(projectPath);
  const issues: string[] = [];
  const codes = [options.deliveryStory, ...options.childWorkItems];
  for (const code of codes) {
    const packagePath = resolveStoryDirectory(projectRoot, code);
    if (packagePath === null) {
      issues.push(`docs/project/roadmap: package ${code} was not found`);
      continue;
    }
    const indexPath = join(packagePath, "index.md");
    const content = readFileSync(indexPath, "utf8");
    const status = STATUS_LINE_RE.exec(content)?.groups?.status;
    if (status === undefined || !isDone(status)) {
      issues.push(`${projectRelative(indexPath, projectRoot)}: package status is not Done`);
    }
  }

  const roadmapRoot = join(projectRoot, "docs", "project", "roadmap");
  const known = new Set(codes);
  for (const file of scanRoadmapIndexFiles(roadmapRoot, { includeLegacy: true })) {
    for (const [code, status] of statusTableRows(file.absolutePath)) {
      if (known.has(code) && !isDone(status)) {
        issues.push(
          `${projectRelative(file.absolutePath, projectRoot)}: table row ${code} is not Done`,
        );
      }
    }
  }

  return { ready: issues.length === 0, issues };
}
