// CV22.DS10.US2 plateau 5 — the release chain, out of the product surface.
//
// Driven against scratch repositories, never this checkout: promotion creates
// tags and moves branches, and a test that does that to the repository it runs
// in is a test that rewrites release history.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildReleaseDoctorReport,
  hasFailures,
  normalizeTarget,
  renderReleaseDoctor,
} from "../../scripts/releaseDoctor.ts";
import { renderPromotion, runReleasePromotion } from "../../scripts/releasePromote.ts";
import { stageMirrorPackage } from "../support/mirrorTree.ts";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Release Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Release Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", env: GIT_ENV });
}

interface Fixture {
  repo: string;
  cleanup: () => void;
}

/** A repository shaped like this one: version, release note, index, a commit. */
function fixture(version = "1.2.3"): Fixture {
  const repo = mkdtempSync(join(tmpdir(), "us2-release-"));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "pyproject.toml"), `[project]\nname = "x"\nversion = "${version}"\n`);
  stageMirrorPackage(repo, { version });
  mkdirSync(join(repo, "docs", "releases"), { recursive: true });
  writeFileSync(join(repo, "docs", "releases", `v${version}.md`), `# v${version} — A Release\n`);
  writeFileSync(join(repo, "docs", "releases", "index.md"), `- [v${version}](v${version}.md)\n`);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "release candidate");
  return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test("a release-ready repository passes every check the oracle makes", () => {
  const f = fixture();
  try {
    const report = buildReleaseDoctorReport({ target: "v1.2.3", start: f.repo });
    const byName = new Map(report.checks.map((c) => [c.name, c]));
    assert.equal(byName.get("git tree clean")?.state, "pass");
    assert.equal(byName.get("package version")?.state, "pass");
    assert.equal(byName.get("release note exists")?.state, "pass");
    assert.equal(byName.get("release note heading")?.state, "pass");
    assert.equal(byName.get("release index")?.state, "pass");
    // Not tagged and no stable ref yet: warnings, not failures -- the doctor
    // runs BEFORE the tag exists, which is the point of running it.
    assert.equal(byName.get("release tag")?.state, "warn");
    assert.equal(byName.get("stable ref")?.state, "warn");
    assert.equal(hasFailures(report), false);

    const render = renderReleaseDoctor(report);
    assert.match(render, /^Release doctor result: ready with warnings$/m);
    assert.match(render, /read-only; it does not tag, merge, push, fetch, or edit files/);
  } finally {
    f.cleanup();
  }
});

test("`1.2.3` and `v1.2.3` name the same release", () => {
  assert.equal(normalizeTarget("1.2.3"), "v1.2.3");
  assert.equal(normalizeTarget("v1.2.3"), "v1.2.3");
});

test("each defect the doctor exists to catch is caught", () => {
  const f = fixture();
  try {
    // A version mismatch.
    let report = buildReleaseDoctorReport({ target: "v9.9.9", start: f.repo });
    let byName = new Map(report.checks.map((c) => [c.name, c]));
    assert.equal(byName.get("package version")?.state, "fail");
    assert.match(byName.get("package version")?.detail ?? "", /expected 9\.9\.9, found 1\.2\.3/);
    assert.equal(byName.get("release note exists")?.state, "fail");
    assert.equal(hasFailures(report), true);

    // A dirty tree.
    writeFileSync(join(f.repo, "scratch.txt"), "uncommitted\n");
    report = buildReleaseDoctorReport({ target: "v1.2.3", start: f.repo });
    byName = new Map(report.checks.map((c) => [c.name, c]));
    assert.equal(byName.get("git tree clean")?.state, "fail");
  } finally {
    f.cleanup();
  }
});

test("the doctor is read-only: it creates no tag and moves no branch", () => {
  const f = fixture();
  try {
    buildReleaseDoctorReport({ target: "v1.2.3", start: f.repo });
    assert.equal(git(f.repo, "tag", "--list").trim(), "", "no tag was created");
    assert.equal(git(f.repo, "branch", "--list").trim(), "* main", "no branch was created");
    assert.equal(git(f.repo, "status", "--porcelain").trim(), "", "no file was written");
  } finally {
    f.cleanup();
  }
});

test("a dry-run promotion names every step and performs none of them", () => {
  const f = fixture();
  try {
    const result = runReleasePromotion({
      target: "v1.2.3",
      start: f.repo,
      dryRun: true,
      push: true,
    });
    assert.equal(result.success, true);
    const states = new Map(result.steps.map((s) => [s.name, s.state]));
    assert.equal(states.get("release doctor"), "pass");
    assert.equal(states.get("tag"), "skip");
    assert.equal(states.get("stable branch"), "skip");
    assert.equal(states.get("push tag"), "skip");
    assert.equal(states.get("push stable"), "skip");

    assert.equal(git(f.repo, "tag", "--list").trim(), "", "a dry run must create no tag");
    assert.equal(git(f.repo, "branch", "--list").trim(), "* main", "and move no branch");
    assert.match(renderPromotion(result), /^Mode: dry-run$/m);
  } finally {
    f.cleanup();
  }
});

test("promotion tags HEAD and fast-forwards stable, without pushing", () => {
  const f = fixture();
  try {
    const result = runReleasePromotion({ target: "v1.2.3", start: f.repo });
    assert.equal(result.success, true, JSON.stringify(result.steps));
    assert.equal(git(f.repo, "tag", "--list").trim(), "v1.2.3");
    assert.match(git(f.repo, "branch", "--list"), /stable/);
    const states = new Map(result.steps.map((s) => [s.name, s.state]));
    assert.equal(states.get("push"), "skip", "a remote is reached only under --push");
  } finally {
    f.cleanup();
  }
});

test("a tag that points somewhere else stops promotion at the doctor", () => {
  // A release tag is a fact about history, and moving it silently is how a
  // release stops being reproducible.
  //
  // The guard fires EARLIER than this test first assumed: the doctor's own
  // `release tag` check fails, so promotion never reaches its tag step. That
  // is also exactly what the oracle does -- `run_release_promotion` returns on
  // `doctor.has_failures` before its own tag branch -- so promotion's
  // tag-mismatch refusal is defense in depth for the case where the tag moves
  // between the two reads, not the primary guard. Asserting the primary one.
  const f = fixture();
  try {
    git(f.repo, "tag", "v1.2.3");
    writeFileSync(join(f.repo, "later.txt"), "later\n");
    git(f.repo, "add", "-A");
    git(f.repo, "commit", "-qm", "a commit after the tag");

    const doctor = buildReleaseDoctorReport({ target: "v1.2.3", start: f.repo });
    const tagCheck = doctor.checks.find((c) => c.name === "release tag");
    assert.equal(tagCheck?.state, "fail");
    assert.match(tagCheck?.detail ?? "", /points to [0-9a-f]{7}/);

    const result = runReleasePromotion({ target: "v1.2.3", start: f.repo });
    assert.equal(result.success, false);
    assert.equal(result.steps[0]?.name, "release doctor");
    assert.equal(result.steps[0]?.state, "fail");
    // Nothing beyond the doctor ran, so no branch was created either.
    assert.ok(!result.steps.some((s) => s.name === "stable branch"));
    assert.equal(git(f.repo, "branch", "--list").trim(), "* main");
  } finally {
    f.cleanup();
  }
});

test("promotion refuses when the doctor fails, before touching anything", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.repo, "dirty.txt"), "uncommitted\n");
    const result = runReleasePromotion({ target: "v1.2.3", start: f.repo, push: true });
    assert.equal(result.success, false);
    assert.equal(result.steps[0]?.name, "release doctor");
    assert.equal(result.steps[0]?.state, "fail");
    assert.equal(git(f.repo, "tag", "--list").trim(), "", "no tag on a failed doctor");
    assert.ok(
      result.recovery.some((line) => line.includes("npm run release:doctor")),
      "the recovery names the new entry point, not the retired command",
    );
    assert.ok(!result.recovery.some((line) => line.includes("python -m memory")));
  } finally {
    f.cleanup();
  }
});

test("stable is refused when it is not an ancestor of HEAD", () => {
  const f = fixture();
  try {
    // A `stable` that diverged: reconciling it is a human decision.
    git(f.repo, "branch", "stable");
    git(f.repo, "checkout", "-q", "stable");
    writeFileSync(join(f.repo, "on-stable.txt"), "divergent\n");
    git(f.repo, "add", "-A");
    git(f.repo, "commit", "-qm", "work only on stable");
    git(f.repo, "checkout", "-q", "main");

    const result = runReleasePromotion({ target: "v1.2.3", start: f.repo });
    assert.equal(result.success, false);
    const stableStep = result.steps.find((s) => s.name === "stable branch");
    assert.equal(stableStep?.state, "fail");
    assert.ok(result.recovery.some((line) => line.includes("Reconcile stable branch")));
  } finally {
    f.cleanup();
  }
});
