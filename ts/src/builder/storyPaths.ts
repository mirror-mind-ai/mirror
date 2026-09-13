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
 * Python `title_leaf`: the final `/`-separated segment, stripped.
 *
 * Roadmap titles are sometimes authored as an ancestor chain
 * (`"CV title / DS title"`), so this takes the item's own segment. The cost is
 * that a title legitimately containing a slash — `"Builder/Ariad tree"` — is
 * read as a chain and loses its head. That is Python's behavior and this story's
 * own Pull surface shows it; reproduced here, recorded as a CR.
 */
export function titleLeaf(title: string): string {
  const segments = title.split("/");
  return (segments[segments.length - 1] ?? "").trim();
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
 * Python `resolve_story_directory`: the directory of the authored package whose
 * heading code equals `code`, `null` when none does, and a throw when more than
 * one does.
 *
 * Returns a path relative to the roadmap root's parent chain as components
 * joined with `/`; callers that need an absolute path join it to the root.
 */
export function resolveStoryDirectory(projectRoot: string, code: string): string | null {
  // ABSOLUTE, like Python's `(project_path / … ).resolve()`. This was relative until
  // CV22.DS7.US8 plateau 3, and the divergence was invisible because every test and
  // every real caller passed an absolute project path: the front door reads it from
  // the journey row, where `journey set-path` stores an absolute one. A
  // project-relative path made Python print absolute package paths and TypeScript
  // print relative ones in the same surface, and — worse — would have compared a
  // relative candidate against a resolved root inside `createStoryDirectory`'s
  // confinement guard.
  const roadmapRoot = resolve(roadmapPaths(projectRoot).roadmapRoot);
  const matches = groupRoadmapHeadings(roadmapRoot).get(code) ?? [];
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    const paths = matches.map((directory) =>
      directory ? `${roadmapRoot}${sep}${directory.split("/").join(sep)}` : roadmapRoot,
    );
    throw new StoryPackageAmbiguityError(
      `${matches.length} roadmap packages claim code '${code}': ${paths.join(", ")}`,
    );
  }
  const only = matches[0] ?? "";
  return only ? `${roadmapRoot}${sep}${only.split("/").join(sep)}` : roadmapRoot;
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
 * nested under its best-available parent coordinate, with only the story's own
 * leaf title slugging its own folder.
 *
 * Throws when the resolved target escapes the roadmap root. That guard is the
 * reason a `../` code or an absolute-looking title cannot write outside
 * `docs/project/roadmap/`, and it is checked AFTER resolution so a symlink or a
 * `..` surviving sanitization is still caught.
 */
export function createStoryDirectory(projectRoot: string, code: string, leafTitle: string): string {
  const { roadmapRoot } = roadmapPaths(projectRoot);
  const resolvedRoadmapRoot = resolve(roadmapRoot);
  const parent = parentCode(code);
  const base = parent === null ? resolvedRoadmapRoot : parentDirectory(projectRoot, parent);
  const target = resolve(base, storyFolderName(code, titleLeaf(leafTitle)));
  const relation = relative(resolvedRoadmapRoot, target);
  const escapes =
    relation.startsWith("..") || relation.startsWith(`${sep}`) || resolve(relation) === relation;
  if (escapes) {
    throw new Error(`story directory escapes roadmap root: ${target}`);
  }
  return target;
}
