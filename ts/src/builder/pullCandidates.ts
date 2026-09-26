// CV22.DS7.US8 plateau 1 — roadmap snapshot and pull candidates.
//
// Port of `src/memory/builder/pull_candidates.py` (the inspection half; the
// three rendered surfaces live in `pullCandidatesRender.ts`).
//
// Three snapshot grammars with precedence, and they are not interchangeable:
//
//   * `cvTableItems` reads `| Code | Capability Value | Status |` and STOPS at
//     the first non-empty, non-table line;
//   * `dsTableItems` reads `| Code | Delivery Story | Status |` and merely
//     leaves table mode at such a line, so it ACCUMULATES across
//     `## Chapter N —` sections;
//   * `cvHeadingItems` reads `## CV<n>: <title>` followed by `**Status:**`.
//
// The first grammar that yields anything wins, so a file carrying a CV table
// and a DS table returns only the CV rows. A port that merges them, or that
// gives the DS table the CV table's termination rule, reads a different roadmap.

import { PYTHON_WHITESPACE_CLASS, pySplitLines, pyStrip } from "#util/pythonText.ts";
import { matchHeading, matchStatus, matchType, stripMarkdownLink } from "./roadmapGrammar.ts";
import { readRoadmapFile, scanRoadmapIndexFiles } from "./roadmapScan.ts";

// Every line walk below is Python `content.splitlines()` via `pySplitLines`, not
// `split("\n")`: Python knows ELEVEN line boundaries (including \v, \f, U+001C
// \u2028, and \u2029), and a roadmap file carrying a form feed would otherwise
// parse as one long line here and as two lines there. Likewise every `.strip()`
// is `pyStrip`, because Python's whitespace set includes U+001C-U+001F and
// U+0085 and excludes U+FEFF — the exact opposite of `String.prototype.trim()`
// on both counts.

/** Python `_CANDIDATE_STATUSES`: substring markers, not an enum. */
const CANDIDATE_STATUSES = ["Planned", "Active", "Blocked", "Candidate"] as const;

const CV_TABLE_HEADER = "| Code | Capability Value | Status |";
const DS_TABLE_HEADER = "| Code | Delivery Story | Status |";

/** Python `_TOP_LEVEL_DS_RE`: a bare `DS-35`, anchored. */
const TOP_LEVEL_DS_RE = /^DS-\d+$/u;

// These three are Python `re.match` against an ALREADY-STRIPPED single line, so
// they anchor at the start and end of that line. `\s` is spelled out as Python's
// set for the same reason as in `roadmapGrammar.ts`, and `.` as `[^\n]`.
const WS = `[${PYTHON_WHITESPACE_CLASS}]`;

/** Python's `^##\s+(CV\d+):\s+(.+?)\s*$`. */
const CV_HEADING_RE = new RegExp(`^##${WS}+(CV\\d+):${WS}+([^\\n]+?)${WS}*$`, "u");

/** Python's `^\*\*Status:\*\*\s*(.+?)\s*$`. */
const LINE_STATUS_RE = new RegExp(`^\\*\\*Status:\\*\\*${WS}*([^\\n]+?)${WS}*$`, "u");

/** Python's `^-\s+(DS\d+)\s+(.+?)\.?$`. */
const DS_BULLET_RE = new RegExp(`^-${WS}+(DS\\d+)${WS}+([^\\n]+?)\\.?$`, "u");

export interface RoadmapSnapshotItem {
  code: string;
  title: string;
  status: string;
}

export interface RoadmapSnapshotReport {
  journey: string;
  method: string;
  items: RoadmapSnapshotItem[];
  source: string | null;
}

export type CandidateLevel = "cv" | "delivery_story" | "user_story" | "technical_story";

export interface PullCandidate {
  code: string;
  title: string;
  level: string;
  status: string;
  /** POSIX path relative to the project root, as Python's `relative_to(root)`. */
  path: string;
}

/**
 * The raw project scan. It carries no recommendation: since CR002 a
 * recommendation exists only for a journey's scope (`scopePullCandidates` in
 * `roadmapScope.ts`), never for the project as a whole.
 */
export interface PullCandidatesReport {
  journey: string;
  method: string;
  candidates: PullCandidate[];
}

export interface ProjectPaths {
  /** Absolute project root. */
  root: string;
  /** Absolute `<root>/docs/project/roadmap`. */
  roadmapRoot: string;
}

/** `<root>/docs/project/roadmap`, the only roadmap location Python looks in. */
export function roadmapPaths(root: string): ProjectPaths {
  return { root, roadmapRoot: `${root}/docs/project/roadmap` };
}

function hasCandidateStatus(status: string): boolean {
  return CANDIDATE_STATUSES.some((marker) => status.includes(marker));
}

/**
 * Python `inspect_roadmap_snapshot`: the compact snapshot from
 * `docs/project/roadmap/index.md` alone — not the whole tree.
 *
 * `source` is the project-relative path of that one file, or `null` when the
 * project path is absent, the file is missing, or it cannot be read.
 */
export function inspectRoadmapSnapshot(
  root: string | null,
  options: { journey: string; method: string },
): RoadmapSnapshotReport {
  const empty: RoadmapSnapshotReport = {
    journey: options.journey,
    method: options.method,
    items: [],
    source: null,
  };
  if (root === null) return empty;
  const indexPath = `${root}/docs/project/roadmap/index.md`;
  const content = readRoadmapFile(indexPath);
  if (content === null) return empty;
  return {
    journey: options.journey,
    method: options.method,
    items: snapshotItemsFromContent(content),
    source: "docs/project/roadmap/index.md",
  };
}

export function snapshotItemsFromContent(content: string): RoadmapSnapshotItem[] {
  const cv = cvTableItems(content);
  if (cv.length > 0) return cv;
  const ds = dsTableItems(content);
  if (ds.length > 0) return ds;
  return cvHeadingItems(content);
}

/** Python `line.strip("|").split("|")` with each cell `.strip()`ed. */
function rowCells(line: string): string[] {
  return line
    .replace(/^\|+/u, "")
    .replace(/\|+$/u, "")
    .split("|")
    .map((cell) => pyStrip(cell));
}

/**
 * Python `_cv_table_items`. Note the termination: any non-empty line that does
 * not start with `|` BREAKS the scan, so only the first CV table is read.
 */
function cvTableItems(content: string): RoadmapSnapshotItem[] {
  const items: RoadmapSnapshotItem[] = [];
  let inTable = false;
  for (const rawLine of pySplitLines(content)) {
    const line = pyStrip(rawLine);
    if (line === CV_TABLE_HEADER) {
      inTable = true;
      continue;
    }
    if (inTable && line.startsWith("|---")) continue;
    if (inTable && line.startsWith("|")) {
      const parts = rowCells(line);
      if (parts.length >= 3) {
        items.push({
          code: stripMarkdownLink(parts[0] ?? ""),
          title: stripMarkdownLink(parts[1] ?? ""),
          status: parts[2] ?? "",
        });
      }
      continue;
    }
    if (inTable && line) break;
  }
  return items;
}

/**
 * Python `_ds_table_items`. Same shape as the CV table with one crucial
 * difference: a non-table line only leaves table mode (`in_table = False`), so
 * a later `| Code | Delivery Story | Status |` header resumes and the rows
 * ACCUMULATE across chapters.
 */
function dsTableItems(content: string): RoadmapSnapshotItem[] {
  const items: RoadmapSnapshotItem[] = [];
  let inTable = false;
  for (const rawLine of pySplitLines(content)) {
    const line = pyStrip(rawLine);
    if (line === DS_TABLE_HEADER) {
      inTable = true;
      continue;
    }
    if (inTable && line.startsWith("|---")) continue;
    if (inTable && line.startsWith("|")) {
      const parts = rowCells(line);
      if (parts.length >= 3) {
        items.push({
          code: stripMarkdownLink(parts[0] ?? ""),
          title: stripMarkdownLink(parts[1] ?? ""),
          status: parts[2] ?? "",
        });
      }
      continue;
    }
    if (inTable) inTable = false;
  }
  return items;
}

/**
 * Python `_cv_heading_items`: `## CV<n>: <title>` then the next `**Status:**`.
 * The pairing is consumed — `current_cv` is cleared after a status matches — so
 * a second status line without an intervening heading is ignored.
 */
function cvHeadingItems(content: string): RoadmapSnapshotItem[] {
  const items: RoadmapSnapshotItem[] = [];
  let currentCv: { code: string; title: string } | null = null;
  for (const rawLine of pySplitLines(content)) {
    const line = pyStrip(rawLine);
    const cvMatch = CV_HEADING_RE.exec(line);
    if (cvMatch) {
      currentCv = { code: cvMatch[1] ?? "", title: pyStrip(cvMatch[2] ?? "") };
      continue;
    }
    const statusMatch = LINE_STATUS_RE.exec(line);
    if (statusMatch && currentCv) {
      items.push({
        code: currentCv.code,
        title: currentCv.title,
        status: pyStrip(statusMatch[1] ?? ""),
      });
      currentCv = null;
    }
  }
  return items;
}

/**
 * Python `inspect_pull_candidates`: scan every non-legacy `index.md`, collect
 * the package's own candidate plus any `Candidate Delivery Stories:` bullets,
 * then drop everything a `done.md` covers.
 */
export function inspectPullCandidates(
  root: string | null,
  options: { journey: string; method: string },
): PullCandidatesReport {
  if (root === null) {
    return { journey: options.journey, method: options.method, candidates: [] };
  }
  const { roadmapRoot } = roadmapPaths(root);
  const files = scanRoadmapIndexFiles(roadmapRoot);

  // Python's path is relative to the PROJECT root, not the roadmap root.
  const projectPrefix = "docs/project/roadmap/";
  const raw: PullCandidate[] = [];
  const contents = new Map<string, string>();
  for (const file of files) {
    const content = readRoadmapFile(file.absolutePath);
    if (content === null) continue;
    contents.set(file.relativePath, content);
    const projectRelative = `${projectPrefix}${file.relativePath}`;
    const own = candidateFromIndexContent(projectRelative, content);
    if (own !== null) raw.push(own);
    raw.push(...candidateDeliveryStoriesFromContent(projectRelative, content));
  }

  const candidates = raw.filter(
    (candidate) => !candidateHasDoneArtifact(root, candidate, files, contents),
  );
  return { journey: options.journey, method: options.method, candidates };
}

function candidateFromIndexContent(
  projectRelativePath: string,
  content: string,
): PullCandidate | null {
  const heading = matchHeading(content);
  const status = matchStatus(content);
  if (!heading || status === null) return null;
  const statusText = pyStrip(status);
  if (!hasCandidateStatus(statusText)) return null;
  const code = pyStrip(heading.code);
  return {
    code,
    title: pyStrip(heading.title),
    level: levelFor(code, content),
    status: statusText,
    path: projectRelativePath,
  };
}

/**
 * Python `_candidate_delivery_stories_from_content`: the `Candidate Delivery
 * Stories:` bullet list under a `## CV<n>:` heading.
 *
 * This is where the `/` title chain comes from: the CV's own title is prefixed
 * as `"<CV title> / <DS title>"`, which is why every downstream renderer calls
 * `title.split("/")[-1]` and why a story whose real title contains a slash gets
 * split. Reproduced, not fixed.
 */
function candidateDeliveryStoriesFromContent(
  projectRelativePath: string,
  content: string,
): PullCandidate[] {
  const candidates: PullCandidate[] = [];
  let currentCv: string | null = null;
  let currentCvTitle: string | null = null;
  let currentStatus: string | null = null;
  let inCandidateDeliveryStories = false;

  for (const rawLine of pySplitLines(content)) {
    const line = pyStrip(rawLine);
    const cvMatch = CV_HEADING_RE.exec(line);
    if (cvMatch) {
      currentCv = cvMatch[1] ?? null;
      currentCvTitle = pyStrip(cvMatch[2] ?? "");
      currentStatus = null;
      inCandidateDeliveryStories = false;
      continue;
    }
    const statusMatch = LINE_STATUS_RE.exec(line);
    if (statusMatch && currentCv) {
      currentStatus = pyStrip(statusMatch[1] ?? "");
      continue;
    }
    if (line === "Candidate Delivery Stories:") {
      inCandidateDeliveryStories = true;
      continue;
    }
    if (inCandidateDeliveryStories && line.startsWith("- ") && currentCv) {
      const dsMatch = DS_BULLET_RE.exec(line);
      if (!dsMatch) continue;
      const status = currentStatus || "Candidate";
      if (!hasCandidateStatus(status)) continue;
      let title = pyStrip(dsMatch[2] ?? "");
      if (currentCvTitle) title = `${currentCvTitle} / ${title}`;
      candidates.push({
        code: `${currentCv}.${dsMatch[1]}`,
        title,
        level: "delivery_story",
        status,
        path: projectRelativePath,
      });
      continue;
    }
    if (inCandidateDeliveryStories && line && !line.startsWith("- ")) {
      inCandidateDeliveryStories = false;
    }
  }
  return candidates;
}

/**
 * Python `_candidate_has_done_artifact`. Two-step, and the second step is the
 * one a port drops: when the candidate's own file does not claim its code (a
 * bullet-derived candidate, whose path is the CV index), Python searches the
 * WHOLE tree for a package whose heading claims that code, then checks for a
 * `done.md` at that package or any ancestor up to the roadmap root.
 *
 * So a child package with no `done.md` of its own is still filtered out when an
 * ancestor has one.
 */
function candidateHasDoneArtifact(
  root: string,
  candidate: PullCandidate,
  files: readonly { components: string[]; relativePath: string; absolutePath: string }[],
  contents: ReadonlyMap<string, string>,
): boolean {
  const projectPrefix = "docs/project/roadmap/";
  const candidateRelative = candidate.path.startsWith(projectPrefix)
    ? candidate.path.slice(projectPrefix.length)
    : null;

  let searchRelatives: string[] = [];
  if (candidateRelative !== null) {
    const ownContent = contents.get(candidateRelative);
    const ownHeading = ownContent ? matchHeading(ownContent) : null;
    const ownCode = ownHeading ? pyStrip(ownHeading.code) : undefined;
    if (ownCode === candidate.code) searchRelatives = [candidateRelative];
  }
  if (searchRelatives.length === 0) {
    searchRelatives = files
      .filter((file) => {
        const heading = matchHeading(contents.get(file.relativePath) ?? "");
        return heading !== null && pyStrip(heading.code) === candidate.code;
      })
      .map((file) => file.relativePath);
  }

  for (const relativePath of searchRelatives) {
    const packageComponents = relativePath.split("/").slice(0, -1);
    if (hasDoneArtifact(root, packageComponents)) return true;
  }
  return false;
}

/** Python `_has_done_artifact`: walk up to (and including) the roadmap root. */
function hasDoneArtifact(root: string, packageComponents: readonly string[]): boolean {
  const { roadmapRoot } = roadmapPaths(root);
  for (let depth = packageComponents.length; depth >= 0; depth -= 1) {
    const current = [roadmapRoot, ...packageComponents.slice(0, depth)].join("/");
    if (readRoadmapFile(`${current}/done.md`) !== null) return true;
  }
  return false;
}

/**
 * Python `_level_for`: `**Type:**` decides by SUBSTRING, so "Technical Story"
 * and "a technical spike" both mean `technical_story`. Falls back to the code
 * shape.
 */
export function levelFor(code: string, content: string): string {
  const type = matchType(content);
  if (type !== null) {
    const storyType = pyStrip(type).toLowerCase();
    if (storyType.includes("technical")) return "technical_story";
    if (storyType.includes("user")) return "user_story";
  }
  if (code.includes(".DS") || TOP_LEVEL_DS_RE.test(code)) return "delivery_story";
  return "cv";
}

/**
 * Python `_recommend`: status is the OUTER loop and level the inner one, so a
 * Planned delivery story beats a Candidate user story. Falls back to the first
 * candidate in scan order — which is why the scan order matters.
 */
export function recommend(candidates: readonly PullCandidate[]): PullCandidate | null {
  for (const preferredStatus of ["Planned", "Candidate", "Active", "Blocked"]) {
    for (const preferredLevel of ["user_story", "technical_story", "delivery_story"]) {
      for (const candidate of candidates) {
        if (candidate.level === preferredLevel && candidate.status.includes(preferredStatus)) {
          return candidate;
        }
      }
    }
  }
  return candidates[0] ?? null;
}

/** Python `_status_marker`. Order matters: Active is tested before Candidate. */
export function statusMarker(status: string): string {
  if (status.includes("Active") || status.includes("In Progress")) return "◉ active";
  if (status.includes("Candidate")) return "◉ candidate";
  if (status.includes("Planned")) return "○ planned";
  if (status.includes("Done")) return "✓ done";
  return `○ ${status.toLowerCase()}`;
}

/** Python `_format_candidate`. */
export function formatCandidate(candidate: PullCandidate): string {
  return `${candidate.code} — ${candidate.title} [${candidate.level}] ${candidate.status} (${candidate.path})`;
}

/** Python `_candidate_lines`. */
export function candidateLines(candidates: readonly PullCandidate[]): string[] {
  return candidates.map(formatCandidate);
}
