// CV22.DS7.US7 plateau 2 — Exploratory Story state graded against the oracle.
//
// The assertion is the stored ROW and the stored runtime payload, cell by cell,
// not a re-read through the code that wrote them. Both stores are shared with
// Python for as long as the strangler runs, so the JSON bytes, the SQL NULL,
// and the `active` flag are all contract.
//
// The family that matters most is `legacy_fallback`. It is the read an install
// that has not written a story since DS8 still performs, it has no coverage on
// either side today, and dropping it would return "no story" and exit 0.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createSchema } from "#db/schema.ts";
import {
  archiveExplorerStory,
  clearExplorerStory,
  type ExplorerStory,
  ExplorerStoryError,
  getExplorerStory,
  listExplorerStories,
  markExplorerStoryPromoted,
  projectionRefreshRequested,
  renderExplorerStoryContext,
  type StoryClock,
  setExplorerAttractors,
  setExplorerBuilderHandoff,
  setExplorerExperimentProposal,
  setExplorerSourceConversations,
  UNSET,
  updateExplorerStory,
} from "#explorer/story.ts";
import golden from "#goldens/explorer-story.golden.json" with { type: "json" };
import { upsertRuntimeSession } from "#mirror/runtimeSession.ts";

const JOURNEY = "probe-journey";
const SESSION = `__explorer_story__:${JOURNEY}`;
const CLOCK_BASE = (tick: number) => `2026-09-09T12:${String(tick).padStart(2, "0")}:00Z`;

interface StoryDict {
  journey: string;
  current_exploratory_story: string | null;
  narrative_field_summary: string | null;
  last_story_card: string | null;
  attractors: { label: string; description: string | null; status: string }[];
  experiment_proposal: { title: string; description: string | null; status: string } | null;
  builder_handoff: Record<string, string | null> | null;
  source_conversations: { conversation_id: string; title: string | null; role: string }[];
  id: string | null;
  title: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  promoted_at: string | null;
  archived_at: string | null;
}

/** Flatten a TS story into the shape the Python generator recorded. */
function toDict(story: ExplorerStory | null): StoryDict | null {
  if (story === null) return null;
  return {
    journey: story.journey,
    current_exploratory_story: story.currentExploratoryStory,
    narrative_field_summary: story.narrativeFieldSummary,
    last_story_card: story.lastStoryCard,
    attractors: story.attractors.map((a) => ({
      label: a.label,
      description: a.description,
      status: a.status,
    })),
    experiment_proposal: story.experimentProposal
      ? {
          title: story.experimentProposal.title,
          description: story.experimentProposal.description,
          status: story.experimentProposal.status,
        }
      : null,
    builder_handoff: story.builderHandoff
      ? {
          title: story.builderHandoff.title,
          summary: story.builderHandoff.summary,
          readiness: story.builderHandoff.readiness,
          artifact_dir: story.builderHandoff.artifactDir,
          index_path: story.builderHandoff.indexPath,
          exploratory_story_path: story.builderHandoff.exploratoryStoryPath,
          handoff_info_path: story.builderHandoff.handoffInfoPath,
          product_design_proposal_path: story.builderHandoff.productDesignProposalPath,
          full_conversation_path: story.builderHandoff.fullConversationPath,
        }
      : null,
    source_conversations: story.sourceConversations.map((s) => ({
      conversation_id: s.conversationId,
      title: s.title,
      role: s.role,
    })),
    id: story.id,
    title: story.title,
    status: story.status,
    created_at: story.createdAt,
    updated_at: story.updatedAt,
    promoted_at: story.promotedAt,
    archived_at: story.archivedAt,
  };
}

/** Rebuild a story from the generator's payload, for the pure-function family. */
function fromDict(payload: StoryDict | null): ExplorerStory | null {
  if (payload === null) return null;
  const handoff = payload.builder_handoff;
  return {
    journey: payload.journey,
    currentExploratoryStory: payload.current_exploratory_story,
    narrativeFieldSummary: payload.narrative_field_summary,
    lastStoryCard: payload.last_story_card,
    attractors: payload.attractors,
    experimentProposal: payload.experiment_proposal,
    builderHandoff: handoff
      ? {
          title: handoff.title as string,
          summary: handoff.summary,
          readiness: handoff.readiness as string,
          artifactDir: handoff.artifact_dir,
          indexPath: handoff.index_path,
          exploratoryStoryPath: handoff.exploratory_story_path,
          handoffInfoPath: handoff.handoff_info_path,
          productDesignProposalPath: handoff.product_design_proposal_path,
          fullConversationPath: handoff.full_conversation_path,
        }
      : null,
    sourceConversations: payload.source_conversations.map((s) => ({
      conversationId: s.conversation_id,
      title: s.title,
      role: s.role,
    })),
    id: payload.id,
    title: payload.title,
    status: payload.status,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
    promotedAt: payload.promoted_at,
    archivedAt: payload.archived_at,
  };
}

const directories: string[] = [];

/** A fresh database plus the same advancing clock/uuid the generator used. */
function fixture(): { db: WritableDatabase; clock: StoryClock } {
  const dir = mkdtempSync(join(tmpdir(), "explorer-story-"));
  directories.push(dir);
  // The DS4 copy guard fails closed: the write target must sit under a literal
  // `tmp/` segment, which macOS's `/var/folders/...` tmpdir does not provide.
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createSchema(db);
  let clockTick = 0;
  let uuidTick = 0;
  return {
    db,
    clock: {
      now: () => CLOCK_BASE(++clockTick),
      uuid: () => `explorer-${String(++uuidTick).padStart(2, "0")}`,
    },
  };
}

test.after(() => {
  for (const dir of directories) rmSync(dir, { recursive: true, force: true });
});

function rows(db: WritableDatabase): Record<string, unknown>[] {
  return db
    .prepare("SELECT * FROM exploratory_stories WHERE journey = ? ORDER BY created_at, id")
    .all(JOURNEY);
}

function runtime(db: WritableDatabase): {
  row_present: boolean;
  metadata: string | null;
  active: number | null;
} {
  const row = db
    .prepare("SELECT metadata, active FROM runtime_sessions WHERE session_id = ?")
    .get(SESSION);
  if (!row) return { row_present: false, metadata: null, active: null };
  return {
    row_present: true,
    metadata: (row.metadata ?? null) as string | null,
    active: Number(row.active),
  };
}

function assertRows(actual: Record<string, unknown>[], expected: unknown, message: string): void {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);
}

// --- A. the _UNSET / None / blank matrix -----------------------------------

for (const scenario of golden.update_matrix) {
  test(`explorer story update: ${scenario.name}`, () => {
    const { db, clock } = fixture();
    if (scenario.seeded) {
      updateExplorerStory(db, JOURNEY, clock, {
        currentExploratoryStory: "seeded story",
        narrativeFieldSummary: "seeded summary",
        lastStoryCard: "seeded card",
      });
    }
    const argument = scenario.argument === "__UNSET__" ? UNSET : scenario.argument;
    const field = scenario.field as
      | "current_exploratory_story"
      | "narrative_field_summary"
      | "last_story_card";
    const key = {
      current_exploratory_story: "currentExploratoryStory",
      narrative_field_summary: "narrativeFieldSummary",
      last_story_card: "lastStoryCard",
    }[field];

    const { story } = updateExplorerStory(db, JOURNEY, clock, { [key]: argument });
    assert.deepEqual(toDict(story), scenario.result, "returned story diverged");
    assertRows(rows(db), scenario.rows, "durable row diverged");
    assert.deepEqual(runtime(db), scenario.runtime, "runtime payload diverged");
  });
}

// --- B. the legacy runtime-state fallback ----------------------------------

for (const scenario of golden.legacy_fallback) {
  test(`explorer story legacy fallback: ${scenario.name}`, () => {
    const { db, clock } = fixture();
    if (scenario.name === "legacy_story_migrates_into_durable_on_update") {
      upsertRuntimeSession(
        db,
        SESSION,
        {
          interface: "explorer_story",
          journey: JOURNEY,
          active: true,
          metadata: JSON.stringify({
            current_exploratory_story: "legacy text",
            last_story_card: "lc",
          }),
        },
        CLOCK_BASE(0),
      );
      const { story } = updateExplorerStory(db, JOURNEY, clock, {
        narrativeFieldSummary: "added later",
      });
      assert.deepEqual(toDict(story), scenario.story, "migrated story diverged");
      assertRows(rows(db), scenario.rows, "durable row diverged after migration");
      assert.deepEqual(runtime(db), scenario.runtime, "runtime payload diverged");
      return;
    }

    upsertRuntimeSession(
      db,
      SESSION,
      {
        interface: "explorer_story",
        journey: JOURNEY,
        active: scenario.seed_active,
        metadata: scenario.seed_metadata,
      },
      CLOCK_BASE(0),
    );
    assert.deepEqual(
      toDict(getExplorerStory(db, JOURNEY)),
      scenario.story,
      "legacy read diverged from the oracle",
    );
  });
}

// --- C. JSON column bytes and the NULL contract ----------------------------

const columnMutations: Record<string, (db: WritableDatabase, clock: StoryClock) => unknown> = {
  base_has_null_experiment_and_handoff: (db) => getExplorerStory(db, JOURNEY),
  attractors_unicode_insertion_order: (db, clock) =>
    setExplorerAttractors(db, JOURNEY, clock, [
      {
        label: "🌱 a seed 🎯 and a target",
        description: "沉默不是空白而是尚未成形的語言",
        status: "accepted",
      },
      { label: "  padded  ", status: "invented" },
    ]).story,
  attractors_empty_list_clears: (db, clock) => setExplorerAttractors(db, JOURNEY, clock, []).story,
  attractor_blank_label_refuses: (db, clock) =>
    setExplorerAttractors(db, JOURNEY, clock, [{ label: "   " }]).story,
  experiment_written: (db, clock) =>
    setExplorerExperimentProposal(db, JOURNEY, clock, {
      title: "沉默不是空白而是尚未成形的語言",
      description: null,
      status: "accepted",
    }).story,
  experiment_blank_title_refuses: (db, clock) =>
    setExplorerExperimentProposal(db, JOURNEY, clock, { title: " " }).story,
  handoff_written: (db, clock) =>
    setExplorerBuilderHandoff(db, JOURNEY, clock, {
      title: "a handoff",
      summary: null,
      readiness: "confirmed",
      artifactDir: "/tmp/x",
      indexPath: "/tmp/x/index.md",
    }).story,
  handoff_invalid_readiness_falls_back: (db, clock) =>
    setExplorerBuilderHandoff(db, JOURNEY, clock, { title: "a handoff", readiness: "whatever" })
      .story,
  handoff_blank_title_refuses: (db, clock) =>
    setExplorerBuilderHandoff(db, JOURNEY, clock, { title: "" }).story,
  source_conversations_written: (db, clock) =>
    setExplorerSourceConversations(db, JOURNEY, clock, [
      { conversationId: "c1", title: "🌱 a seed 🎯 and a target", role: "origin" },
      { conversationId: "c2", title: null, role: "   " },
    ]).story,
  source_conversation_blank_id_refuses: (db, clock) =>
    setExplorerSourceConversations(db, JOURNEY, clock, [{ conversationId: "  " }]).story,
};

for (const scenario of golden.columns) {
  test(`explorer story columns: ${scenario.name}`, () => {
    const { db, clock } = fixture();
    updateExplorerStory(db, JOURNEY, clock, { currentExploratoryStory: "base story" });
    const mutate = columnMutations[scenario.name];
    assert.ok(mutate, `no mutation wired for golden scenario ${scenario.name}`);

    if ("expected_error" in scenario) {
      assert.throws(
        () => mutate(db, clock),
        (error: unknown) =>
          error instanceof ExplorerStoryError && error.message === scenario.expected_error,
        "refusal message diverged",
      );
    } else {
      assert.deepEqual(toDict(mutate(db, clock) as ExplorerStory), scenario.result);
    }
    assertRows(rows(db), scenario.rows, "durable row diverged");
    assert.deepEqual(runtime(db), scenario.runtime, "runtime payload diverged");
  });
}

// --- D. upsert identity ----------------------------------------------------

test("explorer story upsert preserves id and created_at, moves updated_at", () => {
  const { db, clock } = fixture();
  const first = updateExplorerStory(db, JOURNEY, clock, { currentExploratoryStory: "first" });
  const second = updateExplorerStory(db, JOURNEY, clock, { currentExploratoryStory: "second" });
  assert.deepEqual(toDict(first.story), golden.upsert_identity.first);
  assert.deepEqual(toDict(second.story), golden.upsert_identity.second);
  assertRows(rows(db), golden.upsert_identity.rows, "a second write must not create a second row");
});

// --- E. lifecycle ----------------------------------------------------------

test("explorer story lifecycle: archive, promote, list ordering", () => {
  const { db, clock } = fixture();
  updateExplorerStory(db, JOURNEY, clock, { currentExploratoryStory: "story one" });
  const archived = archiveExplorerStory(db, JOURNEY, clock);
  const runtimeAfterArchive = runtime(db);
  updateExplorerStory(db, JOURNEY, clock, { currentExploratoryStory: "story two" });
  const promoted = markExplorerStoryPromoted(db, JOURNEY, clock);
  updateExplorerStory(db, JOURNEY, clock, { currentExploratoryStory: "story three" });

  assert.deepEqual(toDict(archived.story), golden.lifecycle.archived);
  assert.deepEqual(runtimeAfterArchive, golden.lifecycle.runtime_after_archive);
  assert.deepEqual(toDict(promoted.story), golden.lifecycle.promoted);
  assert.deepEqual(
    listExplorerStories(db, JOURNEY).map(toDict),
    golden.lifecycle.list,
    "list ordering diverged: active, then promoted, then archived, each by updated_at DESC",
  );
  assertRows(rows(db), golden.lifecycle.rows, "durable rows diverged");
});

test("explorer story archive with nothing active still clears the runtime payload", () => {
  const { db, clock } = fixture();
  const result = archiveExplorerStory(db, JOURNEY, clock);
  assert.equal(toDict(result.story), golden.archive_without_story.result);
  assert.deepEqual(runtime(db), golden.archive_without_story.runtime);
});

test("explorer story promote with nothing active still clears the runtime payload", () => {
  const { db, clock } = fixture();
  const result = markExplorerStoryPromoted(db, JOURNEY, clock);
  assert.equal(toDict(result.story), golden.promote_without_story.result);
  assert.deepEqual(runtime(db), golden.promote_without_story.runtime);
});

test("explorer story clear is archive under the pre-DS8 command's name", () => {
  const { db, clock } = fixture();
  updateExplorerStory(db, JOURNEY, clock, { currentExploratoryStory: "to be cleared" });
  clearExplorerStory(db, JOURNEY, clock);
  assertRows(rows(db), golden.clear_is_archive.rows, "clear must archive, not delete");
  assert.deepEqual(runtime(db), golden.clear_is_archive.runtime);
});

// --- F. _derive_title ------------------------------------------------------

for (const scenario of golden.derive_title) {
  test(`explorer story title derivation: ${scenario.name}`, () => {
    const { db, clock } = fixture();
    updateExplorerStory(db, JOURNEY, clock, {
      currentExploratoryStory: scenario.current_story,
      narrativeFieldSummary: scenario.narrative_summary,
    });
    const row = rows(db)[0];
    assert.equal((row?.title ?? null) as string | null, scenario.title);
  });
}

// --- G. projection refresh decision ----------------------------------------

for (const scenario of golden.projection_change_detection) {
  test(`explorer projection refresh decision: ${scenario.name}`, () => {
    assert.equal(
      projectionRefreshRequested(
        fromDict(scenario.left as StoryDict | null),
        fromDict(scenario.right as StoryDict | null),
      ),
      scenario.refresh_requested,
    );
  });
}

test("the projection decision is asymmetric by design and stays that way", () => {
  const base = fromDict(golden.projection_change_detection[0]?.left as StoryDict) as ExplorerStory;
  assert.equal(
    projectionRefreshRequested(base, { ...base, lastStoryCard: "changed" }),
    false,
    "last_story_card must not request a refresh",
  );
  assert.equal(
    projectionRefreshRequested(base, { ...base, title: "changed" }),
    true,
    "title must request a refresh, and _derive_title derives it from the story text",
  );
});

// --- H. context render -----------------------------------------------------

for (const scenario of golden.context_render) {
  test(`explorer story context render: ${scenario.name}`, () => {
    assert.equal(
      renderExplorerStoryContext(fromDict(scenario.story as StoryDict) as ExplorerStory),
      scenario.expected_stdout,
    );
  });
}

// --- I. journey normalization ----------------------------------------------

for (const scenario of golden.journey_normalization) {
  test(`explorer story journey normalization: ${scenario.name}`, () => {
    const { db, clock } = fixture();
    if ("expected_error" in scenario) {
      assert.throws(
        () =>
          updateExplorerStory(db, JOURNEY.replace(JOURNEY, scenario.journey), clock, {
            currentExploratoryStory: "x",
          }),
        (error: unknown) =>
          error instanceof ExplorerStoryError && error.message === scenario.expected_error,
      );
    } else {
      const { story } = updateExplorerStory(db, scenario.journey, clock, {
        currentExploratoryStory: "x",
      });
      assert.deepEqual(toDict(story), scenario.result);
    }
  });
}
