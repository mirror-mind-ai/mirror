// CV22.DS7.TS3 plateau 4 — `welcome`, graded against the Python oracle.
//
// Four contracts, in rising order of consequence:
//   1. the update cache's BYTES, which both cores read and write;
//   2. the cache's tolerance for junk, since a bad cache must read as no cache;
//   3. the status line, the most-executed surface in the product;
//   4. the card, including the git-plan and cached-notice update lines.
//
// The spawn spy is the one that guards the reason this story exists.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { activateOperatingMode } from "#mode/operatingMode.ts";
import { inspectGit, inspectUpdateChannel } from "#runtime/git.ts";
import { composeWelcome, localReleaseTitle, remoteTagForCommit } from "#welcome/card.ts";
import { composeStatusLine } from "#welcome/statusLine.ts";
import {
  cacheIsStale,
  readUpdateCache,
  UPDATE_CHECK_CACHE,
  type UpdateAwareness,
  writeUpdateCache,
} from "#welcome/updateCache.ts";

const GOLDEN_PATH = new URL("../goldens/welcome.golden.json", import.meta.url);

interface Golden {
  meta: {
    fixture_version: string;
    fixed_now: string;
    release_version: string;
    release_title: string;
    staleness: Record<string, boolean>;
    remote_tag: {
      upstream: string | null;
      status: string;
      tag: string | null;
      title_from_clone: string | null;
      title_after_pull: string | null;
    };
  };
  cache_writes: Record<string, { awareness: Record<string, unknown>; bytes: string }>;
  cache_reads: Record<string, { file: string | null; parsed: Record<string, unknown> | null }>;
  status_lines: Record<string, string>;
  cards: Record<string, string>;
}

const golden: Golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
const VERSION = golden.meta.fixture_version;
const FIXED_NOW = golden.meta.fixed_now;
const RELEASE_VERSION = golden.meta.release_version;
const RELEASE_TITLE = golden.meta.release_title;
const RELEASE_NOTE = `# ${RELEASE_VERSION} — ${RELEASE_TITLE}\n\nBody.\n`;

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

/** The awareness shape the oracle serializes, with the oracle's defaults. */
function awareness(fields: Partial<UpdateAwareness>): UpdateAwareness {
  return {
    availability: "up_to_date",
    checked_at: FIXED_NOW,
    channel: "stable",
    current_commit: null,
    remote_commit: null,
    version: null,
    title: null,
    note: null,
    ...fields,
  };
}

function tempRoot(prefix: string): { root: string; cleanup: () => void } {
  // realpath: on macOS /tmp is a symlink to /private/tmp.
  const root = realpathSync(mkdtempSync(`/tmp/${prefix}-`));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// --------------------------------------------------------------- cache bytes

test("the update cache is written byte for byte as the oracle writes it", () => {
  const w = tempRoot("welcome-cache");
  try {
    const cases: Record<string, UpdateAwareness> = {
      update_available_full: awareness({
        availability: "update_available",
        current_commit: "abc1234",
        remote_commit: "def5678",
        version: RELEASE_VERSION,
        title: RELEASE_TITLE,
      }),
      up_to_date_minimal: awareness({}),
      unknown_with_note: awareness({
        availability: "unknown",
        channel: "main",
        note: "remote query failed",
      }),
    };
    for (const [label, value] of Object.entries(cases)) {
      const home = join(w.root, label);
      mkdirSync(home, { recursive: true });
      writeUpdateCache(home, value);
      assert.equal(
        readFileSync(join(home, UPDATE_CHECK_CACHE), "utf8"),
        golden.cache_writes[label]?.bytes,
        `cache bytes mismatch for ${label}`,
      );
    }

    // The contract this test exists for: the oracle leaves ensure_ascii at
    // Python's default, so an em dash lands ESCAPED. Writing raw UTF-8 here
    // would make the two cores rewrite the file on every alternating
    // invocation and thrash the 6h TTL.
    assert.match(golden.cache_writes.update_available_full?.bytes ?? "", /\\u2014/);
  } finally {
    w.cleanup();
  }
});

test("a cache that cannot be trusted reads as no cache", () => {
  const w = tempRoot("welcome-read");
  try {
    const home = join(w.root, "home");
    mkdirSync(join(home, "runtime"), { recursive: true });
    const cacheFile = join(home, UPDATE_CHECK_CACHE);

    for (const [label, scenario] of Object.entries(golden.cache_reads)) {
      if (scenario.file === null) {
        if (existsSync(cacheFile)) unlinkSync(cacheFile);
      } else {
        writeFileSync(cacheFile, scenario.file);
      }
      const parsed = readUpdateCache(home);
      assert.deepEqual(
        parsed === null ? null : { ...parsed },
        scenario.parsed,
        `parsed cache mismatch for ${label}`,
      );
    }
  } finally {
    w.cleanup();
  }
});

test("cache staleness follows the oracle's TTL, including a naive timestamp", () => {
  const now = new Date();
  const at = (hours: number): string =>
    new Date(now.getTime() - hours * 3_600_000).toISOString().replace("Z", "+00:00");
  const cases: Record<string, string> = {
    fresh: at(1),
    just_inside_ttl: at(5 + 59 / 60),
    just_outside_ttl: at(6 + 1 / 60),
    beyond_ttl: at(7),
    // No offset. Python explicitly reads this as UTC; JavaScript would
    // otherwise read it as local time and shift the TTL by the machine's
    // offset -- a cache that is fresh in London and stale in São Paulo.
    naive_timestamp: new Date(now.getTime() - 3_600_000).toISOString().replace("Z", ""),
    unparseable: "not-a-timestamp",
  };
  for (const [label, checkedAt] of Object.entries(cases)) {
    assert.equal(
      cacheIsStale(awareness({ checked_at: checkedAt }), now),
      golden.meta.staleness[label],
      `staleness mismatch for ${label}`,
    );
  }

  // The boundary itself. The oracle reads the wall clock inside the check, so
  // a timestamp exactly at the TTL is microseconds stale by the time it looks
  // and the corpus can only bracket it -- here the clock is injected, so the
  // strictness of `>` is pinned directly.
  const exactly = new Date(now.getTime() - 6 * 3_600_000).toISOString().replace("Z", "+00:00");
  assert.equal(cacheIsStale(awareness({ checked_at: exactly }), now), false);
  assert.equal(cacheIsStale(awareness({ checked_at: exactly }), new Date(now.getTime() + 1)), true);
});

// --------------------------------------------------------------- status line

interface StatusFixture {
  root: string;
  home: string;
  noDbHome: string;
  cleanup: () => void;
}

function statusFixture(): StatusFixture {
  const w = tempRoot("welcome-status");
  const home = join(w.root, "status-home");
  mkdirSync(home, { recursive: true });
  const db = bootstrapDatabase(join(home, "memory.db"));
  const insert = db.prepare(
    "INSERT INTO identity (id, layer, key, content, created_at, updated_at) VALUES (?, ?, ?, ?, 't', 't')",
  );
  insert.run("i1", "persona", "engineer", "Engineer");
  insert.run("i2", "persona", "therapist", "Therapist");
  insert.run(
    "i3",
    "journey",
    "mirror-ts-core",
    "# Mirror TypeScript Core Port\n**Status:** active\n\n## Description\nPort.\n\n## End",
  );
  insert.run(
    "i4",
    "journey",
    "no-heading",
    "plain first line\n**Status:** active\n\n## Description\nX.\n\n## End",
  );
  insert.run(
    "i5",
    "journey",
    "done-one",
    "# Done\n**Status:** archived\n\n## Description\nX.\n\n## End",
  );

  activateOperatingMode(
    db,
    { mode: "Builder Mode", journey: "mirror-ts-core", sessionId: "s1" },
    "t",
  );
  activateOperatingMode(db, { mode: "Soul Mode", journey: null, sessionId: "s3" }, "t");
  activateOperatingMode(db, { mode: "Explorer Mode", journey: "no-heading", sessionId: "s4" }, "t");
  activateOperatingMode(db, { mode: "Custom Lens", journey: null, sessionId: "s5" }, "t");
  db.close();

  const noDbHome = join(w.root, "no-db-home");
  mkdirSync(noDbHome, { recursive: true });
  return { root: w.root, home, noDbHome, cleanup: w.cleanup };
}

test("every status line renders exactly as the oracle renders it", () => {
  const f = statusFixture();
  try {
    const env = { MEMORY_ENV: undefined } as NodeJS.ProcessEnv;
    const line = (sessionId: string | null): string =>
      composeStatusLine({ mirrorHome: f.home, sessionId, env });

    assert.equal(line(null), golden.status_lines.no_mode_no_cache);
    assert.equal(line("s1"), golden.status_lines.builder_mode_with_journey);
    assert.equal(line("s2"), golden.status_lines.other_session_sees_no_mode);
    assert.equal(line("s3"), golden.status_lines.soul_mode_no_journey);
    assert.equal(line("s4"), golden.status_lines.journey_without_heading);
    assert.equal(line("s5"), golden.status_lines.unknown_mode_has_no_icon);

    // The marker comes from the CACHE only.
    writeUpdateCache(
      f.home,
      awareness({ availability: "update_available", version: RELEASE_VERSION }),
    );
    assert.equal(line("s1"), golden.status_lines.cached_update_available);
    writeUpdateCache(f.home, awareness({ availability: "update_available" }));
    assert.equal(line("s1"), golden.status_lines.cached_update_without_version);
    writeUpdateCache(f.home, awareness({ availability: "up_to_date" }));
    assert.equal(line("s1"), golden.status_lines.cached_up_to_date);

    // MEMORY_ENV selects the database NAME, so a dev session finds no
    // memory_dev.db here and drops the mode segment entirely -- the oracle
    // does the same, and the corpus records it.
    for (const [memoryEnv, label] of [
      ["development", "development_env"],
      ["test", "test_env"],
    ] as const) {
      assert.equal(
        composeStatusLine({ mirrorHome: f.home, sessionId: "s1", env: { MEMORY_ENV: memoryEnv } }),
        golden.status_lines[label],
        `status line mismatch for ${label}`,
      );
    }

    assert.equal(
      composeStatusLine({ mirrorHome: f.noDbHome, env }),
      golden.status_lines.no_database,
    );
    assert.equal(
      composeStatusLine({ mirrorHome: null, env }),
      golden.status_lines.unresolvable_home,
    );
  } finally {
    f.cleanup();
  }
});

test("the status line spawns nothing — no git, no network", () => {
  // The guard on the reason this story exists. A recording `git` shim goes
  // FIRST on PATH: if the hot path shells out, the marker file appears.
  // Asserting on source text would not catch a spawn added behind an import.
  const f = statusFixture();
  const shim = tempRoot("welcome-spy");
  try {
    const marker = join(shim.root, "git-was-called");
    writeFileSync(join(shim.root, "git"), `#!/bin/sh\necho called >> "${marker}"\nexit 1\n`);
    chmodSync(join(shim.root, "git"), 0o755);

    const originalPath = process.env.PATH;
    process.env.PATH = `${shim.root}:${originalPath ?? ""}`;
    try {
      writeUpdateCache(f.home, awareness({ availability: "update_available", version: "v1.2.3" }));
      const line = composeStatusLine({
        mirrorHome: f.home,
        sessionId: "s1",
        env: { MEMORY_ENV: undefined },
      });
      assert.ok(line.length > 0, "expected a rendered status line");
      assert.equal(existsSync(marker), false, "the status line spawned git");

      // The spy works: the CARD does reach for git, and the marker proves the
      // shim is on PATH and recording. Without this the test above could pass
      // for the wrong reason.
      composeWelcome({
        mirrorHome: f.home,
        cwd: f.root,
        env: { MEMORY_ENV: undefined, MIRROR_WELCOME_REMOTE_UPDATE_CHECK: "off" },
        version: VERSION,
        updateChannel: { value: "stable", source: null, note: null },
      });
      assert.equal(existsSync(marker), true, "the spy never recorded a spawn — PATH shim broken");
    } finally {
      process.env.PATH = originalPath;
    }
  } finally {
    shim.cleanup();
    f.cleanup();
  }
});

// ---------------------------------------------------------------------- card

interface CardFixture {
  root: string;
  clone: string;
  home: string;
  noDbHome: string;
  statsHome: string;
  cleanup: () => void;
}

function cardFixture(): CardFixture {
  const status = statusFixture();
  const remote = join(status.root, "remote.git");
  const seed = join(status.root, "seed");
  mkdirSync(seed, { recursive: true });
  git(seed, "init", "--initial-branch=stable");
  writeFileSync(
    join(seed, "pyproject.toml"),
    `[project]\nname = "mirror"\nversion = "${VERSION}"\n`,
  );
  writeFileSync(join(seed, "README.md"), "fixture\n");
  git(seed, "add", ".");
  git(seed, "commit", "-m", "first");
  git(status.root, "clone", "--bare", seed, remote);

  const clone = join(status.root, "clone");
  git(status.root, "clone", remote, clone);
  git(clone, "checkout", "stable");

  mkdirSync(join(seed, "docs", "releases"), { recursive: true });
  writeFileSync(join(seed, "docs", "releases", `${RELEASE_VERSION}.md`), RELEASE_NOTE);
  git(seed, "add", ".");
  git(seed, "commit", "-m", "second");
  git(seed, "tag", RELEASE_VERSION);
  git(seed, "push", remote, "stable");
  git(seed, "push", remote, RELEASE_VERSION);

  const statsHome = join(status.root, "stats-home");
  mkdirSync(statsHome, { recursive: true });
  const db = bootstrapDatabase(join(statsHome, "memory.db"));
  const insert = db.prepare(
    "INSERT INTO conversations (id, started_at, interface) VALUES (?, ?, 'pi')",
  );
  insert.run("c1", "2025-03-14T10:00:00Z");
  insert.run("c2", "2026-01-02T10:00:00Z");
  db.close();

  return {
    root: status.root,
    clone,
    home: status.home,
    noDbHome: status.noDbHome,
    statsHome,
    cleanup: status.cleanup,
  };
}

test("every welcome card renders exactly as the oracle renders it", () => {
  const f = cardFixture();
  try {
    const env = {
      MEMORY_ENV: undefined,
      MIRROR_WELCOME_REMOTE_UPDATE_CHECK: "off",
    } as NodeJS.ProcessEnv;
    const channel = inspectUpdateChannel(f.clone, null);
    const card = (home: string | null): string =>
      composeWelcome({
        mirrorHome: home,
        cwd: f.clone,
        env,
        version: VERSION,
        updateChannel: channel,
      });

    const cacheFile = join(f.home, UPDATE_CHECK_CACHE);
    if (existsSync(cacheFile)) unlinkSync(cacheFile);

    // Unfetched: `origin/stable` does not resolve locally, so the plan is
    // blocked and the card carries no update line.
    assert.equal(card(f.home), golden.cards.remote_check_disabled_unfetched);

    git(f.clone, "fetch", "origin");
    assert.equal(card(f.home), golden.cards.remote_check_disabled_behind);

    const fresh = (): string => new Date().toISOString().replace("Z", "+00:00");
    writeUpdateCache(
      f.home,
      awareness({
        availability: "update_available",
        checked_at: fresh(),
        version: RELEASE_VERSION,
        title: RELEASE_TITLE,
      }),
    );
    assert.equal(card(f.home), golden.cards.cached_update_with_title);
    writeUpdateCache(
      f.home,
      awareness({
        availability: "update_available",
        checked_at: fresh(),
        version: RELEASE_VERSION,
      }),
    );
    assert.equal(card(f.home), golden.cards.cached_update_without_title);
    writeUpdateCache(f.home, awareness({ availability: "update_available", checked_at: fresh() }));
    assert.equal(card(f.home), golden.cards.cached_update_without_version);

    unlinkSync(cacheFile);
    assert.equal(card(f.noDbHome), golden.cards.empty_database);
    assert.equal(card(null), golden.cards.unresolvable_home);

    git(f.clone, "pull", "--ff-only");
    assert.equal(card(f.statsHome), golden.cards.stats_since_earliest_conversation);
  } finally {
    f.cleanup();
  }
});

test("the tag lookup and release title match the oracle on the fixture remote", () => {
  const f = cardFixture();
  try {
    git(f.clone, "fetch", "origin");
    const expected = golden.meta.remote_tag;
    const repository = inspectGit(f.clone).repository;

    // Before pulling, the note is only on the remote: the tag resolves and the
    // LOCAL title does not, which is exactly what the oracle recorded.
    const tag = remoteTagForCommit(
      expected.upstream ?? "",
      git(f.clone, "rev-parse", "origin/stable"),
      repository,
    );
    assert.equal(tag, expected.tag);
    assert.equal(localReleaseTitle(tag, f.clone), expected.title_from_clone);

    git(f.clone, "pull", "--ff-only");
    assert.equal(localReleaseTitle(tag, f.clone), expected.title_after_pull);

    // An annotated tag's `^{}` peel must not be counted twice, and an
    // unrelated commit must find nothing.
    assert.equal(remoteTagForCommit("origin/stable", "0".repeat(40), repository), null);
    assert.equal(remoteTagForCommit("no-slash", "abc", repository), null);
  } finally {
    f.cleanup();
  }
});
