// CV22.DS7.US8 plateau 1 — resolve-then-create for roadmap story packages.
//
// Port of `src/memory/builder/story_paths.py`.
//
// The rule that matters: an EXISTING package is located by its own heading
// (`# <code> — <title>`), never by a folder-naming convention or by arithmetic
// on code+title. An authored package can live under any folder a human chose,
// and what makes it `CV2.DS1` is its heading. Python learned this twice —
// CR048 in DS6.TS5, recurring in CV22.DS7 — so the resolver is shared by every
// call site rather than re-derived per caller.
//
// Creating a NEW package is the lower-stakes half: nothing is authored for that
// code yet, so a new path cannot duplicate or contradict anything, and naming a
// not-yet-materialized parent degrades gracefully instead of failing.
//
// Confinement is not incidental. `createStoryDirectory` builds a path from a
// caller-supplied code and title — candidate-table cells, which may be
// Navigator- or model-authored — so the final path is checked to be inside the
// roadmap root and the code segment is sanitized before it can create nested
// directories (Python's D-012).

import { relative, resolve, sep } from "node:path";
import { kebabSlug } from "#util/slug.ts";
import { displayPath } from "./projectPaths.ts";
import { inspectRoadmapSnapshot, roadmapPaths } from "./pullCandidates.ts";
import { matchHeading } from "./roadmapGrammar.ts";
import { readRoadmapFile, scanRoadmapIndexFiles } from "./roadmapScan.ts";

/** Python `StoryPackageAmbiguityError`: two packages claim one code. */
export class StoryPackageAmbiguityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryPackageAmbiguityError";
  }
}

/**
 * Python `_sanitize_code_segment`: dots are the code's own level separator, so
 * they become hyphens FIRST (preserving `cv2-ds1` folder naming for well-formed
 * codes), and everything else goes through the same slug sanitizer titles use.
 * That is what stops a `/` or `..` in a code cell from creating directories.
 */
function sanitizeCodeSegment(code: string): string {
  return kebabSlug(code.replaceAll(".", "-"));
}

/** Python `story_folder_name`: `<code>-<title-slug>`, or the code alone. */
export function storyFolderName(code: string, title: string): string {
  const codePart = sanitizeCodeSegment(code);
  const slug = kebabSlug(title);
  return slug ? `${codePart}-${slug}` : codePart;
}

/** Every code claimed by a non-legacy `index.md` heading, mapped to its directories. */
function groupRoadmapHeadings(roadmapRoot: string): Map<string, string[]> {
  const byCode = new Map<string, string[]>();
  for (const file of scanRoadmapIndexFiles(roadmapRoot)) {
    const content = readRoadmapFile(file.absolutePath);
    if (content === null) continue;
    const heading = matchHeading(content);
    if (!heading) continue;
    const code = heading.code.trim();
    const directory = file.components.slice(0, -1).join("/");
    const existing = byCode.get(code);
    if (existing) existing.push(directory);
    else byCode.set(code, [directory]);
  }
  return byCode;
}

/**
 * The package resolver over one reading of the roadmap: for a code, the absolute
 * directory of the authored package whose heading claims it, `null` when none does,
 * and a throw when more than one does.
 *
 * `resolveStoryDirectory` asks it about one code. Expand asks it about every child of
 * a Delivery Story, and must settle them all before it writes anything, so it reads
 * the roadmap once and keeps this function (CR018). Both go through the one rule.
 */
export function storyDirectoryResolver(projectRoot: string): (code: string) => string | null {
  // ABSOLUTE, like Python's `(project_path / … ).resolve()`. This was relative until
  // CV22.DS7.US8 plateau 3, and the divergence was invisible because every test and
  // every real caller passed an absolute project path: the front door reads it from
  // the journey row, where `journey set-path` stores an absolute one. A
  // project-relative path made Python print absolute package paths and TypeScript
  // print relative ones in the same surface, and — worse — would have compared a
  // relative candidate against a resolved root inside `createStoryDirectory`'s
  // confinement guard.
  const roadmapRoot = resolve(roadmapPaths(projectRoot).roadmapRoot);
  const claims = groupRoadmapHeadings(roadmapRoot);
  const absolute = (directory: string): string =>
    directory ? `${roadmapRoot}${sep}${directory.split("/").join(sep)}` : roadmapRoot;
  return (code) => {
    const matches = claims.get(code) ?? [];
    if (matches.length === 0) return null;
    if (matches.length > 1) {
      // Named relative to the project (CR082): Pull prints this message on
      // `EXPAND_BLOCKED`, and every other command on an `Error:` line.
      const claimants = matches.map((directory) => displayPath(absolute(directory), projectRoot));
      throw new StoryPackageAmbiguityError(
        `${matches.length} roadmap packages claim code '${code}': ${claimants.join(", ")}`,
      );
    }
    return absolute(matches[0] ?? "");
  };
}

/**
 * Python `resolve_story_directory`: the directory of the authored package whose
 * heading code equals `code`, `null` when none does, and a throw when more than
 * one does.
 */
export function resolveStoryDirectory(projectRoot: string, code: string): string | null {
  return storyDirectoryResolver(projectRoot)(code);
}

/**
 * Every heading code in the roadmap, mapped to the directories that claim it —
 * relative to the roadmap root, POSIX, in scan order.
 *
 * One code, one directory is the healthy case. `resolveStoryDirectory` refuses to
 * choose among several; CR002's roadmap scope reads the map directly because a
 * surface must be able to SAY that a package is claimed twice, and to name the
 * claimants project-relatively, rather than throw from inside `build load`.
 */
export function roadmapHeadingDirectories(projectRoot: string): Map<string, string[]> {
  return groupRoadmapHeadings(resolve(roadmapPaths(projectRoot).roadmapRoot));
}

/** Python `find_duplicate_roadmap_headings`: the CI-facing whole-tree counterpart. */
export function findDuplicateRoadmapHeadings(projectRoot: string): Map<string, string[]> {
  const { roadmapRoot } = roadmapPaths(projectRoot);
  const duplicates = new Map<string, string[]>();
  for (const [code, directories] of groupRoadmapHeadings(roadmapRoot)) {
    if (directories.length > 1) duplicates.set(code, directories);
  }
  return duplicates;
}

/** Python `_parent_code`: `CV2.DS1` -> `CV2`; `DS-35` -> `null`. */
function parentCode(code: string): string | null {
  if (!code.includes(".")) return null;
  return code.slice(0, code.lastIndexOf("."));
}

/** Python `_snapshot_title`: name a not-yet-materialized coordinate from the root snapshot. */
function snapshotTitle(projectRoot: string, code: string): string | null {
  const snapshot = inspectRoadmapSnapshot(projectRoot, { journey: "", method: "ariad" });
  for (const item of snapshot.items) {
    if (item.code === code) return item.title;
  }
  return null;
}

/**
 * Python `_parent_directory`: resolve an existing package by heading, else name
 * it from the root snapshot, else recurse to the grandparent and fall back to a
 * bare code segment. Never fails loud — nothing is authored for the code yet.
 */
function parentDirectory(projectRoot: string, code: string): string {
  const resolved = resolveStoryDirectory(projectRoot, code);
  if (resolved !== null) return resolved;
  // Resolved for the same reason as above: Python's `_parent_directory` bases every
  // derived path on the resolved roadmap root.
  const roadmapRoot = resolve(roadmapPaths(projectRoot).roadmapRoot);
  const parent = parentCode(code);
  const base = parent === null ? roadmapRoot : parentDirectory(projectRoot, parent);
  const title = snapshotTitle(projectRoot, code);
  const folder = title ? storyFolderName(code, title) : sanitizeCodeSegment(code);
  return `${base}${sep}${folder}`;
}

/**
 * Python `create_story_directory`: the canonical directory for a NEW package,
 * nested under its best-available parent coordinate, with the story's whole title
 * slugging its own folder: the rule Expand applies to a child (CR018).
 *
 * Throws when the resolved target escapes the roadmap root. That guard is the
 * reason a `../` code or an absolute-looking title cannot write outside
 * `docs/project/roadmap/`, and it is checked AFTER resolution so a symlink or a
 * `..` surviving sanitization is still caught.
 */
export function createStoryDirectory(projectRoot: string, code: string, title: string): string {
  const { roadmapRoot } = roadmapPaths(projectRoot);
  const resolvedRoadmapRoot = resolve(roadmapRoot);
  const parent = parentCode(code);
  const base = parent === null ? resolvedRoadmapRoot : parentDirectory(projectRoot, parent);
  const target = resolve(base, storyFolderName(code, title));
  const relation = relative(resolvedRoadmapRoot, target);
  const escapes =
    relation.startsWith("..") || relation.startsWith(`${sep}`) || resolve(relation) === relation;
  if (escapes) {
    throw new Error(`story directory escapes roadmap root: ${target}`);
  }
  return target;
}
