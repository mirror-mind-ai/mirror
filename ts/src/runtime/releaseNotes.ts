// Release-note reading for the runtime surface (CV22.DS7.TS3, plateau 2).
// Port of the release-note half of `src/memory/cli/runtime.py`.
//
// Two sources, one document shape. The working tree answers "what does this
// checkout contain"; a git ref answers "what does the channel contain that I
// have not merged", which is the question `release-notes pending` exists for
// and the reason this path shells out to `ls-tree`/`show` instead of reading
// files. Ordering is by semantic version everywhere: `v0.10.0` follows
// `v0.9.0`, which a lexical sort gets backwards.
//
// `fetch` is the one command here that writes anything — remote-tracking refs,
// never the worktree — and only when `release-notes pending` is allowed to
// refresh. Everything else reads.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { GIT_NETWORK_TIMEOUT_MS, runGit } from "./git.ts";

export interface ReleaseNote {
  version: string;
  title: string;
  path: string;
  digest: string | null;
  highlights: string[];
}

export interface ReleaseNotesBundle {
  notes: ReleaseNote[];
  current_version: string | null;
  source: string | null;
}

const NOTE_NAME = /^v\d+\.\d+\.\d+\.md$/;
const REF_NOTE_PATH = /docs\/releases\/v\d+\.\d+\.\d+\.md$/;
// The heading separator is an em dash, as the oracle's regex requires.
const TITLE = /^#\s+(v\d+\.\d+\.\d+)\s+—\s+(.+)$/m;

/** Port of `_parse_semver`: unparseable versions sort below everything. */
export function parseSemver(version: string): [number, number, number] {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return [-1, -1, -1];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: string, b: string): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] as number) - (right[index] as number);
    if (diff !== 0) return diff;
  }
  return 0;
}

function isNewer(candidate: string, current: string): boolean {
  return compareSemver(candidate, current) > 0;
}

/** Port of `_extract_frontmatter_digest`: the `digest: >` block, unwrapped. */
export function extractFrontmatterDigest(text: string): string | null {
  if (!text.startsWith("---")) return null;
  const parts = text.split("---");
  if (parts.length < 3) return null;
  const frontmatter = parts[1] as string;
  const match = /digest:\s*>\s*\n((?:\s+.*\n?)*)/.exec(frontmatter);
  if (!match) return null;
  const lines = (match[1] as string)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.join(" ") || null;
}

/**
 * Port of `_extract_highlights`: the `## Highlights` section only, with
 * continuation lines folded into their bullet. A bullet under a later heading
 * belongs to that heading, not here.
 */
export function extractHighlights(text: string): string[] {
  const heading = /^## Highlights[ \t]*$/m.exec(text);
  if (!heading) return [];
  const tail = text.slice(heading.index + heading[0].length);
  const next = /^## /m.exec(tail);
  const section = next ? tail.slice(0, next.index) : tail;

  const highlights: string[] = [];
  let current: string[] = [];
  for (const line of section.split("\n")) {
    const stripped = line.trim();
    if (!stripped) continue;
    if (stripped.startsWith("- ")) {
      if (current.length > 0) highlights.push(current.join(" "));
      current = [stripped.slice(2).trim()];
    } else if (current.length > 0) {
      current.push(stripped);
    }
  }
  if (current.length > 0) highlights.push(current.join(" "));
  return highlights;
}

export function releaseNoteFromText(path: string, text: string): ReleaseNote {
  const match = TITLE.exec(text);
  const stem = basename(path).replace(/\.md$/, "");
  return {
    version: match ? (match[1] as string) : stem,
    title: match ? (match[2] as string).trim() : stem,
    path,
    digest: extractFrontmatterDigest(text),
    highlights: extractHighlights(text),
  };
}

function repositoryFor(start: string): string {
  const startPath = resolve(start);
  const top = runGit(["rev-parse", "--show-toplevel"], startPath);
  return top.code === 0 && top.stdout ? top.stdout : startPath;
}

/** Notes in the working tree, ordered by semantic version. */
export function readReleaseNotes(start: string): ReleaseNote[] {
  const dir = join(repositoryFor(start), "docs", "releases");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => NOTE_NAME.test(name))
    .sort((a, b) => compareSemver(a.replace(/\.md$/, ""), b.replace(/\.md$/, "")))
    .map((name) => {
      const path = join(dir, name);
      return releaseNoteFromText(path, readFileSync(path, "utf8"));
    });
}

export function readReleaseNote(version: string, start: string): ReleaseNote | null {
  const notes = readReleaseNotes(start);
  if (version === "latest")
    return notes.length > 0 ? (notes[notes.length - 1] as ReleaseNote) : null;
  const wanted = version.startsWith("v") ? version : `v${version}`;
  return notes.find((note) => note.version === wanted) ?? null;
}

function refNoteNames(ref: string, repository: string): string[] {
  const listed = runGit(["ls-tree", "-r", "--name-only", ref, "docs/releases"], repository);
  if (listed.code !== 0 || !listed.stdout) return [];
  return listed.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => REF_NOTE_PATH.test(line));
}

/** Notes as the ref has them — what a channel contains, merged or not. */
export function readReleaseNotesFromRef(ref: string, start: string): ReleaseNote[] {
  const repository = repositoryFor(start);
  const names = refNoteNames(ref, repository).sort((a, b) =>
    compareSemver(basename(a).replace(/\.md$/, ""), basename(b).replace(/\.md$/, "")),
  );
  const notes: ReleaseNote[] = [];
  for (const selected of names) {
    const shown = runGit(["show", `${ref}:${selected}`], repository);
    if (shown.code !== 0 || !shown.stdout) continue;
    notes.push(releaseNoteFromText(selected, shown.stdout));
  }
  return notes;
}

export function readReleaseNoteFromRef(
  ref: string,
  version: string,
  start: string,
): ReleaseNote | null {
  const repository = repositoryFor(start);
  let selected: string;
  if (version === "latest") {
    const names = refNoteNames(ref, repository);
    if (names.length === 0) return null;
    selected = names.sort((a, b) =>
      compareSemver(basename(b).replace(/\.md$/, ""), basename(a).replace(/\.md$/, "")),
    )[0] as string;
  } else {
    const wanted = version.startsWith("v") ? version : `v${version}`;
    selected = `docs/releases/${wanted}.md`;
  }
  const shown = runGit(["show", `${ref}:${selected}`], repository);
  if (shown.code !== 0 || !shown.stdout) return null;
  return releaseNoteFromText(selected, shown.stdout);
}

/** Port of `_normalize_version`: drop a leading `v`, keep the rest. */
export function normalizeVersion(version: string): string {
  const trimmed = version.trim();
  return trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
}

/** Refresh the channel ref before reading it. The only write in this module. */
export function fetchReleaseNotesRef(ref: string, repository: string): void {
  const slash = ref.indexOf("/");
  if (slash <= 0 || slash === ref.length - 1) return;
  const remote = ref.slice(0, slash);
  const branch = ref.slice(slash + 1);
  runGit(["fetch", remote, branch], repository, GIT_NETWORK_TIMEOUT_MS);
}

export interface PendingOptions {
  currentVersion: string;
  ref: string;
  start: string;
  fetch: boolean;
}

export function buildPendingReleaseNotes(options: PendingOptions): ReleaseNotesBundle {
  const repository = repositoryFor(options.start);
  const current = normalizeVersion(options.currentVersion);
  if (options.fetch) fetchReleaseNotesRef(options.ref, repository);
  const notes = readReleaseNotesFromRef(options.ref, repository).filter((note) =>
    isNewer(note.version, current),
  );
  return { notes, current_version: `v${current}`, source: options.ref };
}

export function renderReleaseNote(note: ReleaseNote | null): string {
  if (note === null) return "Mirror runtime release notes\n\nRelease notes: not found\n";
  const lines = ["Mirror runtime release notes", ""];
  lines.push(`Release: ${note.version} — ${note.title}`);
  lines.push(`Path: ${note.path}`);
  if (note.digest) {
    lines.push("");
    lines.push("Summary:");
    lines.push(note.digest);
  }
  if (note.highlights.length > 0) {
    lines.push("");
    lines.push("Highlights:");
    for (const highlight of note.highlights) lines.push(`- ${highlight}`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderReleaseNotesBundle(bundle: ReleaseNotesBundle): string {
  const lines = ["Mirror runtime release notes", ""];
  if (bundle.current_version) lines.push(`Current version: ${bundle.current_version}`);
  if (bundle.source) lines.push(`Source: ${bundle.source}`);
  if (bundle.notes.length === 0) {
    lines.push("Pending releases: none");
    return `${lines.join("\n")}\n`;
  }
  lines.push(`Pending releases: ${bundle.notes.length}`);
  for (const note of bundle.notes) {
    lines.push("");
    lines.push(`## ${note.version} — ${note.title}`);
    if (note.digest) lines.push(note.digest);
    if (note.highlights.length > 0) {
      lines.push("Highlights:");
      for (const highlight of note.highlights) lines.push(`- ${highlight}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
