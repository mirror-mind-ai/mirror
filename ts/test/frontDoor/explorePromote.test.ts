// CV22.DS7.US8 plateau 7 — `explore story promote`, the leaf that waited.
//
// Held on Python by name since US7 because `cmd_story_promote` ends by calling
// Builder `load`. It flips here, and it is the only leaf in either family whose
// engine depends on the COMPOSED transport: its tail is a session start, so
// `MIRROR_TS_BUILD=0`, `MIRROR_TS_SEARCH=0`, and
// `MIRROR_TS_CONVERSATION_LLM_TAIL=0` each send it back to Python.
//
// Driven through the real front door, in a subprocess, because what this leaf
// adds over its parts is the ORDER of three effects across two families —
// confirm the handoff, promote the story, enter Builder — and the exit code a
// shell sees. Under the build family's replay fixtures: deterministic, no
// network, no spend.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { WritableDatabase } from "#db/database.ts";
import {
  getExplorerStory,
  setExplorerBuilderHandoff,
  updateExplorerStory,
} from "#explorer/story.ts";
import { spawnFrontDoor } from "#helpers/frontDoor.ts";
import { createJourney } from "#journey/journeyWrite.ts";

const TS_ROOT = resolve(import.meta.dirname, "..", "..");
const FIXTURES = join(TS_ROOT, "test", "fixtures", "builder-load");
const CLOCK = { now: () => "2026-01-01T00:00:00+00:00", uuid: () => "00000001" };

/** A mirror home with one journey and, optionally, a story carrying a handoff. */
function makeHome(options: { withHandoff: boolean }): { home: string; slug: string } {
  const home = mkdtempSync(join(tmpdir(), "promote-"));
  const slug = "promote-journey";
  const db: WritableDatabase = bootstrapDatabase(join(home, "memory.db"));
  try {
    createJourney(
      db,
      {
        id: "j-promote",
        slug,
        content: "# Promote journey\n\n## Description\n\nStrangler parity oracle\n",
      },
      CLOCK.now(),
    );
    updateExplorerStory(db, slug, CLOCK, {
      currentExploratoryStory: "the part we cannot name yet",
    });
    if (options.withHandoff) {
      setExplorerBuilderHandoff(db, slug, CLOCK, {
        title: "Parity is a rendering problem",
        summary: "enough shape to plan",
        readiness: "proposed",
        artifactDir: "docs/project/explorations/parity",
        indexPath: "docs/project/explorations/parity/index.md",
      });
    }
  } finally {
    db.close();
  }
  return { home, slug };
}

/**
 * The row, not the reader.
 *
 * `getExplorerStory` returns the ACTIVE story, and promotion ends activeness —
 * which is why promote is not idempotent and why the engine has to be decided
 * before it writes. Reading the table directly is the only way to assert what a
 * promoted story became.
 */
function read(home: string, slug: string) {
  const db = bootstrapDatabase(join(home, "memory.db"));
  try {
    const row = db
      .prepare(
        "SELECT status, promoted_at, builder_handoff_json FROM exploratory_stories " +
          "WHERE journey = ? ORDER BY rowid DESC LIMIT 1",
      )
      .get(slug) as
      | { status: string; promoted_at: string | null; builder_handoff_json: string | null }
      | undefined;
    return {
      row,
      handoff: row?.builder_handoff_json
        ? (JSON.parse(row.builder_handoff_json) as Record<string, unknown>)
        : null,
      activeStory: getExplorerStory(db, slug),
      sessions: db
        .prepare(
          "SELECT session_id, persona, journey, conversation_id, metadata FROM runtime_sessions " +
            "ORDER BY session_id",
        )
        .all() as Record<string, unknown>[],
    };
  } finally {
    db.close();
  }
}

/** The whole family in replay: no network, no spend, and the same vectors the corpus uses. */
const REPLAY = {
  MIRROR_TS_BUILD_EMBEDDING_REPLAY: join(FIXTURES, "replay-embedding.json"),
  MIRROR_TS_BUILD_LLM_REPLAY: join(FIXTURES, "replay-llm.json"),
};

test("promote confirms the handoff, promotes the story, and enters Builder", () => {
  const { home, slug } = makeHome({ withHandoff: true });
  try {
    const before = read(home, slug);
    assert.equal(before.handoff?.readiness, "proposed");
    assert.equal(before.row?.status, "active");

    const result = spawnFrontDoor(["explore", "story", "promote", slug], {
      MIRROR_HOME: home,
      ...REPLAY,
    });

    assert.equal(result.status, 0, result.stderr);
    // Builder's entry surface, on stdout: the tail RAN, rather than the command
    // stopping at the two writes.
    assert.match(result.stdout, /BUILDER MODE ACTIVE/u);
    assert.match(result.stderr, /Builder Mode active — journey: promote-journey/u);

    const after = read(home, slug);
    // Only `readiness` changes; every artifact path the handoff recorded survives.
    assert.equal(after.handoff?.readiness, "confirmed");
    assert.equal(after.handoff?.title, "Parity is a rendering problem");
    assert.equal(after.handoff?.index_path, "docs/project/explorations/parity/index.md");
    assert.equal(after.row?.status, "promoted");
    assert.ok(after.row?.promoted_at, "the promotion is stamped");
    // And the story is no longer ACTIVE, which is what makes a second promote
    // render `no_builder_handoff` rather than promoting twice.
    assert.equal(after.activeStory, null);

    // The session start's own state: sticky defaults and the operating-mode row
    // Builder Mode writes. Without them, `promote` would confirm a handoff and
    // leave the Navigator in no mode at all.
    const sticky = after.sessions.find((row) => row.session_id === "__global_sticky_defaults__");
    assert.equal(sticky?.persona, "engineer");
    assert.equal(sticky?.journey, slug);
    assert.ok(
      after.sessions.some((row) => String(row.metadata ?? "").includes("Builder Mode")),
      "an operating-mode row records Builder Mode",
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("promote without a handoff renders the refusal surface and mutates nothing", () => {
  // Python returns before `cmd_load`, so no provider is reached either — which
  // is why this case runs with NO replay fixtures configured and still must not
  // touch the network.
  const { home, slug } = makeHome({ withHandoff: false });
  try {
    const result = spawnFrontDoor(["explore", "story", "promote", slug], { MIRROR_HOME: home });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[\[MIRROR_REQUIRED_SURFACE_BEGIN:no_builder_handoff\]\]/u);
    assert.match(result.stdout, /NO BUILDER HANDOFF/u);
    assert.doesNotMatch(result.stdout, /BUILDER MODE ACTIVE/u, "no session start happened");

    const after = read(home, slug);
    assert.equal(after.row?.status, "active", "the story is untouched");
    assert.equal(after.row?.promoted_at, null);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a reverted Builder family sends promote to Python, before it writes anything", () => {
  // The important half is the SECOND assertion. Promote is not idempotent —
  // once the story is promoted a second run finds none — so a revert discovered
  // after the writes would leave a journey neither engine can finish. The
  // fallback here reaches Python, which is absent in this environment, so the
  // command fails; what must hold is that the story is untouched.
  const { home, slug } = makeHome({ withHandoff: true });
  try {
    const result = spawnFrontDoor(["explore", "story", "promote", slug], {
      MIRROR_HOME: home,
      MIRROR_TS_SEARCH: "0",
      ...REPLAY,
    });

    assert.notEqual(result.status, 0, "the TS route did not answer");
    const after = read(home, slug);
    assert.equal(after.row?.status, "active");
    assert.equal(after.handoff?.readiness, "proposed");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("half a replay fixture refuses instead of reaching the live provider", () => {
  const { home, slug } = makeHome({ withHandoff: true });
  try {
    const result = spawnFrontDoor(["explore", "story", "promote", slug], {
      MIRROR_HOME: home,
      MIRROR_TS_BUILD_EMBEDDING_REPLAY: REPLAY.MIRROR_TS_BUILD_EMBEDDING_REPLAY,
    });

    assert.notEqual(result.status, 0);
    const after = read(home, slug);
    assert.equal(after.row?.status, "active", "a refused promote writes nothing");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
