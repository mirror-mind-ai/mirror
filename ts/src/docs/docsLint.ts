// Docs link/anchor checker — the TypeScript port of `src/memory/docs_lint.py`
// (CV22.DS10.TS5, slice B).
//
// The Zero Python gate assigns `scripts/check_doc_links.py` to this story. The
// script is a 57-line wrapper; the subject is this module's Python original
// (221 lines) plus the duplicate-heading guard, which TypeScript already owns
// through `findDuplicateRoadmapHeadings` (DS7.US8). So this port is the
// link/anchor half, and the roadmap half is a thin adapter over existing code.
//
// Every behavior here is pinned by `ts/test/scripts/docsLint.test.ts`, which
// carries all 26 cases of `tests/unit/memory/test_docs_lint.py`. That test is
// the reason this file exists in the shape it does: each case records a
// failure mode the checker actually caught, or once missed, during the
// repo-wide docs audit. The Python self-test dies with its suite; the
// assertions do not.

import {
  type Dirent,
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";

import { roadmapPaths } from "#builder/pullCandidates.ts";
import { findDuplicateRoadmapHeadings } from "#builder/storyPaths.ts";

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;
const HEADING_RE = /^#{1,6}[ \t]+(.+?)[ \t]*$/gm;
const FENCE_RE = /```[\s\S]*?```/g;
const SLUG_STRIP_RE = /[^a-z0-9 _-]/g;

const EXCLUDED_DIR_NAMES = new Set(["node_modules", ".venv", "__pycache__", ".git"]);

// Parity fixture trees (`ts/test/fixtures/**`) are test INPUT, not
// documentation. They carry authored-Markdown edge cases an oracle is graded
// on -- dangling links, duplicate heading codes, malformed tables -- so
// linting them as docs would force the fixtures to stop being fixtures.
// Narrow on purpose: a directory named `fixtures` is skipped only beneath a
// `test`/`tests` directory, so a real `docs/**/fixtures/` tree is still
// checked.
const TEST_DIR_NAMES = new Set(["test", "tests"]);
const FIXTURE_DIR_NAME = "fixtures";

// `roadmap/templates/*.md` link to a bare `index.md` breadcrumb meant to
// resolve once the template is copied into a real story folder; `templates/`
// itself has no `index.md`, by design. Not a broken link.
const TEMPLATE_DIR_MARKER = "/roadmap/templates/";

export interface BrokenLink {
  readonly sourceFile: string;
  readonly line: number;
  readonly target: string;
  readonly reason: string;
}

export interface DuplicateRoadmapHeading {
  readonly code: string;
  readonly paths: readonly string[];
}

/**
 * Reproduce GitHub's heading-to-anchor algorithm.
 *
 * Lowercase, strip everything except letters/digits/spaces/underscores/
 * hyphens (existing hyphens and underscores are PRESERVED -- `MEMORY_ENV`
 * slugs to `memory_env`, not `memory-env`), then spaces become hyphens.
 * Repeated hyphens are never collapsed, matching GitHub: an em dash is
 * stripped outright and leaves its surrounding spaces behind, which is why
 * `D1 — Local-first` slugs to `d1--local-first`.
 */
export function slugify(heading: string): string {
  return heading.toLowerCase().replace(SLUG_STRIP_RE, "").replace(/ /g, "-");
}

/**
 * Blank out fenced code blocks so link-like text inside ``` ``` is never
 * scanned, preserving the line count exactly -- a problem reported after a
 * fence must still point at its real source line.
 */
export function stripFencedCode(text: string): string {
  return text.replace(FENCE_RE, (match) => "\n".repeat((match.match(/\n/g) ?? []).length));
}

/** Every Markdown heading's text, in document order. */
export function extractHeadings(text: string): string[] {
  const headings: string[] = [];
  for (const match of text.matchAll(HEADING_RE)) headings.push(match[1] as string);
  return headings;
}

/**
 * Every anchor id reachable in this document. Duplicate heading text is
 * suffixed `-1`, `-2`, ... in encounter order, as GitHub disambiguates.
 */
export function computeAnchors(text: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  for (const heading of extractHeadings(text)) {
    const base = slugify(heading);
    const count = (seen.get(base) ?? -1) + 1;
    seen.set(base, count);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

function isTemplatePlaceholder(sourceFile: string, targetPath: string): boolean {
  return toPosix(sourceFile).includes(TEMPLATE_DIR_MARKER) && targetPath === "index.md";
}

/** True for a `fixtures` directory nested under a `test`/`tests` one. */
function isTestFixturePath(path: string): boolean {
  const parts = toPosix(path).split("/");
  return parts.some(
    (part, index) =>
      part === FIXTURE_DIR_NAME && parts.slice(0, index).some((p) => TEST_DIR_NAMES.has(p)),
  );
}

function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i += 1) if (text[i] === "\n") line += 1;
  return line;
}

/** Every markdown file in the tree, in deterministic (sorted) order. */
function iterMarkdownFiles(repoRoot: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        if (!isTestFixturePath(full)) found.push(full);
      }
    }
  };
  walk(repoRoot);
  return found.sort();
}

/** Check every relative/anchor link in one markdown file. */
export function checkFile(sourceFile: string, repoRoot: string): BrokenLink[] {
  const raw = readFileSync(sourceFile, "utf8");
  const scanned = stripFencedCode(raw);
  const relSource = toPosix(relative(repoRoot, sourceFile));
  const problems: BrokenLink[] = [];
  let ownAnchors: Set<string> | null = null;

  for (const match of scanned.matchAll(LINK_RE)) {
    const link = (match[1] as string).trim();
    if (/^(https?:\/\/|mailto:)/.test(link)) continue;
    const line = lineOf(scanned, match.index ?? 0);

    if (link.startsWith("#")) {
      ownAnchors ??= computeAnchors(raw);
      if (!ownAnchors.has(link.slice(1))) {
        problems.push({
          sourceFile: relSource,
          line,
          target: link,
          reason: "anchor not found in this file",
        });
      }
      continue;
    }

    const hashIndex = link.indexOf("#");
    const pathPart = hashIndex === -1 ? link : link.slice(0, hashIndex);
    const anchorPart = hashIndex === -1 ? "" : link.slice(hashIndex + 1);
    if (isTemplatePlaceholder(sourceFile, pathPart)) continue;

    const target = normalize(join(dirname(sourceFile), pathPart));
    if (!existsSync(target)) {
      problems.push({
        sourceFile: relSource,
        line,
        target: link,
        reason: "target file does not exist",
      });
      continue;
    }

    if (anchorPart && target.endsWith(".md")) {
      if (!computeAnchors(readFileSync(target, "utf8")).has(anchorPart)) {
        problems.push({
          sourceFile: relSource,
          line,
          target: link,
          reason: "anchor not found in target file",
        });
      }
    }
  }

  return problems;
}

/** Check every markdown file in the repository. Deterministic order. */
export function checkRepo(repoRoot: string): BrokenLink[] {
  const problems: BrokenLink[] = [];
  for (const file of iterMarkdownFiles(repoRoot)) problems.push(...checkFile(file, repoRoot));
  return problems;
}

/**
 * Two or more roadmap `index.md` files whose heading claims the same code.
 *
 * Sorted by code, then by path, for stable CI output.
 *
 * Two resolution hazards, both real, both pinned by the self-test:
 *
 * 1. **The helper's contract is not Python's.** `find_duplicate_roadmap_headings`
 *    returns ABSOLUTE directories; the TypeScript `findDuplicateRoadmapHeadings`
 *    returns paths RELATIVE TO THE ROADMAP ROOT (`cv2-ds1-a`), because that is
 *    what `resolveStoryDirectory` needed when DS7.US8 ported it. Same name,
 *    different contract -- so this adapter joins them onto the roadmap root
 *    rather than treating them as absolute. Assuming parity of a helper whose
 *    name matched would have produced `../../../..`-prefixed garbage in CI
 *    output.
 * 2. **Both ends must be realpath'd or neither.** Python resolves the repo root
 *    and the roadmap root, so a root holding `..` or (on macOS) a
 *    `/var` -> `/private/var` symlink still yields a repo-relative path.
 *    Resolving only one end reintroduces exactly the defect the Python test
 *    says was caught by manual smoke-testing.
 */
export function checkRoadmapDuplicateHeadings(repoRoot: string): DuplicateRoadmapHeading[] {
  const realpathOrSelf = (path: string): string => {
    try {
      return statSync(path).isDirectory() ? realpathSync(path) : path;
    } catch {
      return path;
    }
  };

  const resolvedRoot = realpathOrSelf(resolve(repoRoot));
  const resolvedRoadmapRoot = realpathOrSelf(resolve(roadmapPaths(repoRoot).roadmapRoot));

  const duplicates = findDuplicateRoadmapHeadings(repoRoot);
  return [...duplicates.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([code, directories]) => ({
      code,
      paths: directories
        .map((directory) =>
          toPosix(relative(resolvedRoot, join(resolvedRoadmapRoot, directory, "index.md"))),
        )
        .sort(),
    }));
}
