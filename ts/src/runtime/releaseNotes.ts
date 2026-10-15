// Release-note reading for the runtime surface (CV22.DS7.TS3, plateau 2).
// Port of the release-note half of `src/memory/cli/runtime.py`.
//
// Three sources, one document shape. A tree answers "what does this tree
// contain": `docs/releases` under the root the caller names, read as files
// with no git call -- the caller passes the running tree, which for a package
// may sit inside a git work tree it does not own, such as Homebrew's prefix
// (CR133). The other two answer `release-notes pending`, "what does my channel
// hold that I do not", for the install that is running and never for the cwd
// (CR134): a clone's git ref, read in the clone's own repository -- the only
// path here that shells out to git -- and a package's channel version,
// resolved by the registry and read from that version's tarball in memory.
// Ordering is by semantic version everywhere: `v0.10.0` follows `v0.9.0`,
// which a lexical sort gets backwards.
//
// When no source answers, the bundle says so -- `unknown`, with a reason --
// rather than `none`, which means a source answered and held nothing newer.
//
// `fetch` writes remote-tracking refs in the clone, never its worktree, and
// `npm pack` one tarball into a private directory removed after the read.
// Everything else reads.

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  channelDirection,
  type NpmRunner,
  type PackageInstall,
  packTarball,
} from "#runtime/strategies/package.ts";
import { compareSemver } from "#util/semver.ts";
import { MAX_INFLATED_BYTES, readTarGzEntries } from "#util/tarEntries.ts";
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
  /** Why no source answered; null when one did, with notes or with none (CR134). */
  unknown_reason: string | null;
}

const NOTE_NAME = /^v\d+\.\d+\.\d+\.md$/;
const REF_NOTE_PATH = /docs\/releases\/v\d+\.\d+\.\d+\.md$/;
// The heading separator is an em dash, as the oracle's regex requires.
const TITLE = /^#\s+(v\d+\.\d+\.\d+)\s+—\s+(.+)$/m;

// `parseSemver` lived here as the port of `_parse_semver`; it is the one in
// `#util/semver.ts` now, re-exported so its callers and its test do not move.
export { parseSemver } from "#util/semver.ts";

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

/**
 * Notes under `<root>/docs/releases`, ordered by semantic version. The root is
 * read as given: asking git for its repository would climb out of a package
 * installed under a prefix that is itself a work tree (CR133).
 */
export function readReleaseNotes(root: string): ReleaseNote[] {
  const dir = join(resolve(root), "docs", "releases");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => NOTE_NAME.test(name))
    .sort((a, b) => compareSemver(a.replace(/\.md$/, ""), b.replace(/\.md$/, "")))
    .map((name) => {
      const path = join(dir, name);
      return releaseNoteFromText(path, readFileSync(path, "utf8"));
    });
}

export function readReleaseNote(version: string, root: string): ReleaseNote | null {
  const notes = readReleaseNotes(root);
  if (version === "latest")
    return notes.length > 0 ? (notes[notes.length - 1] as ReleaseNote) : null;
  const wanted = version.startsWith("v") ? version : `v${version}`;
  return notes.find((note) => note.version === wanted) ?? null;
}

/**
 * A ref is user-supplied (`--ref`), and git takes an argument that begins with
 * `-` as an option, `--upload-pack=<command>` among them (CR134). Such a ref is
 * refused before git runs, and every verb below also puts `--end-of-options`
 * before its operands, which covers the half of a ref after its first slash.
 */
function refusedRef(ref: string): string | null {
  if (ref === "") return "no ref was named";
  if (ref.startsWith("-")) return `ref ${JSON.stringify(ref)} begins with '-' and is refused`;
  return null;
}

function firstLine(text: string): string {
  return (
    text
      .split("\n")
      .find((line) => line.trim() !== "")
      ?.trim() ?? ""
  );
}

type RefNames = { ok: true; names: string[] } | { ok: false; detail: string };

/** The note paths at `ref`. A ref that does not resolve is said, not read as empty. */
function refNoteNames(ref: string, repository: string): RefNames {
  const refused = refusedRef(ref);
  if (refused !== null) return { ok: false, detail: refused };
  const listed = runGit(
    ["ls-tree", "-r", "--name-only", "--end-of-options", ref, "docs/releases"],
    repository,
  );
  if (listed.code !== 0) return { ok: false, detail: `ref ${ref} does not resolve` };
  const names = listed.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => REF_NOTE_PATH.test(line));
  return { ok: true, names };
}

function showAtRef(ref: string, path: string, repository: string): string | null {
  const shown = runGit(["show", "--end-of-options", `${ref}:${path}`], repository);
  return shown.code === 0 && shown.stdout ? shown.stdout : null;
}

type RefNotes = { ok: true; notes: ReleaseNote[] } | { ok: false; detail: string };

function readRefNotes(ref: string, repository: string): RefNotes {
  const listed = refNoteNames(ref, repository);
  if (!listed.ok) return listed;
  const names = listed.names.sort((a, b) =>
    compareSemver(basename(a).replace(/\.md$/, ""), basename(b).replace(/\.md$/, "")),
  );
  const notes: ReleaseNote[] = [];
  for (const selected of names) {
    const text = showAtRef(ref, selected, repository);
    if (text !== null) notes.push(releaseNoteFromText(selected, text));
  }
  return { ok: true, notes };
}

/**
 * Notes as the ref has them — what a channel contains, merged or not — in the
 * repository given, never one discovered from a cwd (CR134). A ref that does
 * not resolve yields none here; `buildPendingReleaseNotes` says why.
 */
export function readReleaseNotesFromRef(ref: string, repository: string): ReleaseNote[] {
  const read = readRefNotes(ref, resolve(repository));
  return read.ok ? read.notes : [];
}

export function readReleaseNoteFromRef(
  ref: string,
  version: string,
  repository: string,
): ReleaseNote | null {
  const root = resolve(repository);
  let selected: string;
  if (version === "latest") {
    const listed = refNoteNames(ref, root);
    if (!listed.ok || listed.names.length === 0) return null;
    selected = listed.names.sort((a, b) =>
      compareSemver(basename(b).replace(/\.md$/, ""), basename(a).replace(/\.md$/, "")),
    )[0] as string;
  } else {
    if (refusedRef(ref) !== null) return null;
    const wanted = version.startsWith("v") ? version : `v${version}`;
    selected = `docs/releases/${wanted}.md`;
  }
  const text = showAtRef(ref, selected, root);
  return text === null ? null : releaseNoteFromText(selected, text);
}

/** Port of `_normalize_version`: drop a leading `v`, keep the rest. */
export function normalizeVersion(version: string): string {
  const trimmed = version.trim();
  return trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
}

export type RefFetch =
  | { kind: "skipped" }
  | { kind: "fetched" }
  | { kind: "failed"; detail: string };

/**
 * Refresh the channel ref before reading it: `git fetch <remote> <branch>` for
 * a ref shaped `<remote>/<branch>`, in the clone's own repository. A ref with
 * no remote part, such as `HEAD`, has nothing to fetch, and a refused ref never
 * reaches git.
 */
export function fetchReleaseNotesRef(ref: string, repository: string): RefFetch {
  if (refusedRef(ref) !== null) return { kind: "skipped" };
  const slash = ref.indexOf("/");
  if (slash <= 0 || slash === ref.length - 1) return { kind: "skipped" };
  const remote = ref.slice(0, slash);
  const branch = ref.slice(slash + 1);
  const fetched = runGit(
    ["fetch", "--end-of-options", remote, branch],
    repository,
    GIT_NETWORK_TIMEOUT_MS,
  );
  if (fetched.code === 0) return { kind: "fetched" };
  return {
    kind: "failed",
    detail: firstLine(fetched.stderr) || `git fetch exited ${fetched.code}`,
  };
}

/** A bundle no source answered: `Pending releases: unknown`, and why. */
export function unknownReleaseNotes(
  currentVersion: string,
  source: string | null,
  reason: string,
): ReleaseNotesBundle {
  return {
    notes: [],
    current_version: `v${normalizeVersion(currentVersion)}`,
    source,
    unknown_reason: reason,
  };
}

export interface PendingOptions {
  currentVersion: string;
  ref: string;
  /** The install's own checkout, used as given: never discovered from a cwd (CR134). */
  repository: string;
  fetch: boolean;
}

/**
 * A clone's pending notes: the releases at `ref` newer than the installed
 * version. A fetch that fails is `unknown`, not a quiet read of a stale ref;
 * `--no-fetch` is how to ask for the ref as last fetched (CR134, decision 2).
 */
export function buildPendingReleaseNotes(options: PendingOptions): ReleaseNotesBundle {
  const repository = resolve(options.repository);
  const current = normalizeVersion(options.currentVersion);
  const unknown = (reason: string) => unknownReleaseNotes(current, options.ref, reason);
  const refused = refusedRef(options.ref);
  if (refused !== null) return unknown(refused);
  if (options.fetch) {
    const fetched = fetchReleaseNotesRef(options.ref, repository);
    if (fetched.kind === "failed") return unknown(`fetch failed: ${fetched.detail}`);
  }
  const read = readRefNotes(options.ref, repository);
  if (!read.ok) return unknown(read.detail);
  return {
    notes: read.notes.filter((note) => isNewer(note.version, current)),
    current_version: `v${current}`,
    source: options.ref,
    unknown_reason: null,
  };
}

export interface RegistryPendingOptions {
  currentVersion: string;
  install: PackageInstall;
  channel: string;
  npm: NpmRunner;
}

const TARBALL_NOTE = /^package\/docs\/releases\/v\d+\.\d+\.\d+\.md$/;

/**
 * A package's pending notes (CR134). The registry resolves the channel's
 * dist-tag to a version, as `runtime update` does at plan. When that version is
 * ahead, its exact tarball is fetched into a private directory and the notes
 * are read in memory, within the reader's bound; when it is current or behind,
 * nothing is downloaded. Every npm call runs in the install's root (CR135).
 */
export function buildPendingReleaseNotesFromRegistry(
  options: RegistryPendingOptions,
): ReleaseNotesBundle {
  const { install, channel, npm } = options;
  const current = normalizeVersion(options.currentVersion);
  const tag = `npm ${install.name}@${channel}`;
  const direction = channelDirection({ ...install, version: current }, channel, npm);
  if (direction.kind === "unresolved") return unknownReleaseNotes(current, tag, direction.detail);
  const target = direction.version;
  const source = `${tag} (${target})`;
  if (direction.kind !== "ahead") {
    return { notes: [], current_version: `v${current}`, source, unknown_reason: null };
  }

  const destination = mkdtempSync(join(tmpdir(), "mirror-release-notes-"));
  try {
    const packed = packTarball(install.name, target, install.root, destination, npm);
    if (!packed.ok) return unknownReleaseNotes(current, source, packed.detail);
    // The compressed file is read whole before it is inflated, so it is bounded too.
    if (statSync(packed.path).size > MAX_INFLATED_BYTES) {
      return unknownReleaseNotes(
        current,
        source,
        `the tarball is larger than ${MAX_INFLATED_BYTES} bytes`,
      );
    }
    const read = readTarGzEntries(readFileSync(packed.path), (name) => TARBALL_NOTE.test(name));
    if (!read.ok) return unknownReleaseNotes(current, source, read.detail);
    const notes = [...read.entries]
      .sort(([a], [b]) =>
        compareSemver(basename(a).replace(/\.md$/, ""), basename(b).replace(/\.md$/, "")),
      )
      .map(([name, bytes]) =>
        releaseNoteFromText(
          `${install.name}@${target}:${name.slice("package/".length)}`,
          bytes.toString("utf8"),
        ),
      )
      .filter((note) => isNewer(note.version, current));
    return { notes, current_version: `v${current}`, source, unknown_reason: null };
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
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
  if (bundle.unknown_reason !== null) {
    lines.push("Pending releases: unknown");
    lines.push(`Reason: ${bundle.unknown_reason}`);
    return `${lines.join("\n")}\n`;
  }
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
