// CV22.DS7.TS3 plateau 2 — release-note reading, graded against the Python
// oracle over the same fixture repository the golden was generated from:
// notes in the working tree, more notes only on the remote ref, and a clone
// that must fetch before it can see them.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  buildPendingReleaseNotes,
  parseSemver,
  type ReleaseNote,
  readReleaseNote,
  readReleaseNoteFromRef,
  readReleaseNotes,
  readReleaseNotesFromRef,
  renderReleaseNote,
  renderReleaseNotesBundle,
} from "#runtime/releaseNotes.ts";

const GOLDEN_PATH = new URL("../goldens/release-notes.golden.json", import.meta.url);

interface Golden {
  meta: { current_version: string };
  local_notes: Record<string, string>;
  remote_only_notes: Record<string, string>;
  working_tree: {
    notes: ReleaseNote[];
    latest_render: string;
    by_version_render: string;
    by_v_prefixed_render: string;
    missing_render: string;
    malformed_heading: ReleaseNote;
    heading_filename_mismatch: ReleaseNote;
    mismatch_by_filename: ReleaseNote | null;
    order: string[];
  };
  ref_before_fetch: { notes: ReleaseNote[]; pending_render: string };
  ref_after_fetch: {
    notes: ReleaseNote[];
    latest_from_ref: ReleaseNote;
    explicit_from_ref: ReleaseNote;
    missing_from_ref: ReleaseNote | null;
    pending_render: string;
    pending_render_current_is_newest: string;
  };
  unknown_ref: { notes: ReleaseNote[]; pending_render: string };
  semver_keys: Record<string, number[]>;
}

const golden: Golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
const CURRENT = golden.meta.current_version;

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Mirror Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Mirror Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  GIT_AUTHOR_DATE: "2026-09-01T12:00:00+00:00",
  GIT_COMMITTER_DATE: "2026-09-01T12:00:00+00:00",
  GIT_TERMINAL_PROMPT: "0",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" }).trim();
}

function fixture(): { root: string; clone: string; cleanup: () => void } {
  const root = realpathSync(mkdtempSync("/tmp/release-notes-"));
  const seed = join(root, "seed");
  const remote = join(root, "remote.git");
  const clone = join(root, "clone");
  mkdirSync(join(seed, "docs", "releases"), { recursive: true });
  writeFileSync(
    join(seed, "pyproject.toml"),
    `[project]\nname = "mirror"\nversion = "${CURRENT}"\n`,
  );
  for (const [name, body] of Object.entries(golden.local_notes)) {
    writeFileSync(join(seed, "docs", "releases", name), body);
  }
  git(seed, "init", "--initial-branch=stable");
  git(seed, "add", ".");
  git(seed, "commit", "-m", "notes");
  git(root, "clone", "--bare", seed, remote);
  git(root, "clone", remote, clone);
  git(clone, "checkout", "stable");
  for (const [name, body] of Object.entries(golden.remote_only_notes)) {
    writeFileSync(join(seed, "docs", "releases", name), body);
  }
  git(seed, "add", ".");
  git(seed, "commit", "-m", "pending releases");
  git(seed, "push", remote, "stable");
  return { root, clone, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function normalize<T>(value: T, root: string): T {
  return JSON.parse(JSON.stringify(value).replaceAll(root, "<root>")) as T;
}

test("working-tree notes match the oracle, ordered semantically", () => {
  const f = fixture();
  try {
    assert.deepEqual(normalize(readReleaseNotes(f.clone), f.root), golden.working_tree.notes);
    assert.deepEqual(
      readReleaseNotes(f.clone).map((note) => note.version),
      golden.working_tree.order,
      "v0.10.0 follows v0.9.0 — a lexical sort gets this backwards",
    );
    assert.equal(
      normalize(renderReleaseNote(readReleaseNote("latest", f.clone)), f.root),
      golden.working_tree.latest_render,
    );
    assert.equal(
      normalize(renderReleaseNote(readReleaseNote("0.8.0", f.clone)), f.root),
      golden.working_tree.by_version_render,
    );
    assert.equal(
      normalize(renderReleaseNote(readReleaseNote("v0.10.0", f.clone)), f.root),
      golden.working_tree.by_v_prefixed_render,
      "the v prefix is optional on the way in",
    );
    assert.equal(
      renderReleaseNote(readReleaseNote("9.9.9", f.clone)),
      golden.working_tree.missing_render,
    );
    assert.deepEqual(
      normalize(readReleaseNote("0.7.0", f.clone), f.root),
      golden.working_tree.malformed_heading,
      "a heading the regex misses falls back to the file stem",
    );
    // The reader reports the HEADING's version while ordering by the
    // FILENAME's: v0.6.0.md declares v0.6.1, so it is found by 0.6.1, not by
    // 0.6.0, and still sorts first. Only a mismatched note separates the rules.
    assert.deepEqual(
      normalize(readReleaseNote("0.6.1", f.clone), f.root),
      golden.working_tree.heading_filename_mismatch,
    );
    assert.equal(readReleaseNote("0.6.0", f.clone), golden.working_tree.mismatch_by_filename);
  } finally {
    f.cleanup();
  }
});

test("ref reads see only what the clone has fetched", () => {
  const f = fixture();
  try {
    assert.deepEqual(
      normalize(readReleaseNotesFromRef("origin/stable", f.clone), f.root),
      golden.ref_before_fetch.notes,
      "before fetching, the ref is the clone's stale copy",
    );
    assert.equal(
      renderReleaseNotesBundle(
        buildPendingReleaseNotes({
          currentVersion: CURRENT,
          ref: "origin/stable",
          start: f.clone,
          fetch: false,
        }),
      ),
      golden.ref_before_fetch.pending_render,
    );

    git(f.clone, "fetch", "origin");
    assert.deepEqual(
      normalize(readReleaseNotesFromRef("origin/stable", f.clone), f.root),
      golden.ref_after_fetch.notes,
    );
    assert.deepEqual(
      readReleaseNotesFromRef("origin/stable", f.clone).map((note) => note.version),
      golden.ref_after_fetch.notes.map((note) => note.version),
    );
    assert.deepEqual(
      normalize(readReleaseNoteFromRef("origin/stable", "latest", f.clone), f.root),
      golden.ref_after_fetch.latest_from_ref,
    );
    assert.deepEqual(
      normalize(readReleaseNoteFromRef("origin/stable", "0.11.0", f.clone), f.root),
      golden.ref_after_fetch.explicit_from_ref,
    );
    assert.equal(
      readReleaseNoteFromRef("origin/stable", "9.9.9", f.clone),
      golden.ref_after_fetch.missing_from_ref,
    );
    assert.equal(
      renderReleaseNotesBundle(
        buildPendingReleaseNotes({
          currentVersion: CURRENT,
          ref: "origin/stable",
          start: f.clone,
          fetch: false,
        }),
      ),
      golden.ref_after_fetch.pending_render,
    );
    assert.equal(
      renderReleaseNotesBundle(
        buildPendingReleaseNotes({
          currentVersion: "0.12.0",
          ref: "origin/stable",
          start: f.clone,
          fetch: false,
        }),
      ),
      golden.ref_after_fetch.pending_render_current_is_newest,
      "nothing is pending when the checkout is the newest release",
    );
  } finally {
    f.cleanup();
  }
});

test("an unknown ref yields nothing rather than failing", () => {
  const f = fixture();
  try {
    assert.deepEqual(readReleaseNotesFromRef("origin/nope", f.clone), golden.unknown_ref.notes);
    assert.equal(
      renderReleaseNotesBundle(
        buildPendingReleaseNotes({
          currentVersion: CURRENT,
          ref: "origin/nope",
          start: f.clone,
          fetch: false,
        }),
      ),
      golden.unknown_ref.pending_render,
    );
  } finally {
    f.cleanup();
  }
});

test("parseSemver matches the oracle, including what it refuses", () => {
  for (const [value, expected] of Object.entries(golden.semver_keys)) {
    assert.deepEqual(parseSemver(value), expected, value);
  }
});

test("a ref shaped like a git option cannot become one", () => {
  // `--ref` is user-supplied and reaches `git show <ref>:<path>`. Passing argv
  // (never a shell string) is what keeps it an operand: git reads it as a
  // revision, fails to resolve it, and the reader returns nothing.
  const f = fixture();
  try {
    const marker = join(f.root, "pwned.txt");
    assert.deepEqual(readReleaseNotesFromRef(`--output=${marker}`, f.clone), []);
    assert.equal(readReleaseNoteFromRef(`--upload-pack=touch ${marker}`, "latest", f.clone), null);
    assert.equal(
      renderReleaseNotesBundle(
        buildPendingReleaseNotes({
          currentVersion: CURRENT,
          ref: `--upload-pack=touch ${marker}`,
          start: f.clone,
          fetch: true,
        }),
      ).includes("Pending releases: none"),
      true,
    );
    assert.equal(
      readFileSync(join(f.clone, "pyproject.toml"), "utf8").includes(CURRENT),
      true,
      "the repository is untouched",
    );
  } finally {
    f.cleanup();
  }
});
