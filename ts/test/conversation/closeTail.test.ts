// CV22.DS7.US10 slice C′ — close-tail parity, graded as an ordered call sequence.
//
// Replays `ts/parity/generate_close_tail_golden.py` against the TS close tail.
// The ai-engineer plan review classed this blocking: end-state equality cannot
// expose a diverged LLM call graph, because the metadata lifecycle engine
// decides whether and how often each surface fires. A port that reached the
// same conversation row while making a different number of model calls would
// look correct under replay and cost real money at the DS8 live cutover.
//
// So each scenario asserts BOTH the ordered surface sequence and the resulting
// row state, plus the apply report (changed/skipped/actions).

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  cleanSummary,
  cleanTitle,
  createCloseHooks,
  finalizeMetadataOnClose,
  looksLikeArtifact,
  type MetadataLifecycleApplyReport,
} from "#conversation/closeTail.ts";
// The ordering contract lives in the logger's close seam (US5 slice A); this
// module supplies its two tails. Driving the real seam here means the sequence
// evidence covers the composition, not a test-only re-implementation.
import { endConversation } from "#conversation/logger.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import type { LlmProvider, LlmRequest, LlmResponse } from "#providers/llm.ts";

const GOLDEN_PATH = new URL("../goldens/close-tail.golden.json", import.meta.url);

interface Scenario {
  label: string;
  action: string;
  repeat: number;
  extraction_raises: boolean;
  seed: {
    title: string | null;
    summary: string | null;
    tags: string | null;
    metadata: string | null;
    message_count: number;
  };
  replies: Record<string, string>;
  call_sequence: string[];
  final_state: {
    title: string | null;
    summary: string | null;
    tags: string | null;
    metadata: string | null;
    ended_at_set: boolean;
  };
  reports: {
    mutated: boolean;
    changed: Record<string, unknown>;
    skipped: Record<string, string>;
    profile: string;
    actions: Record<string, string>;
  }[];
}

const golden: { scenarios: Scenario[] } = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));

const NOW = "2026-09-03T12:00:00.000000Z";

/** Records the ordered surfaces, mirroring the generator's patched send_to_model. */
class RecordingProvider implements LlmProvider {
  readonly surfaces: string[] = [];
  private readonly replies: Record<string, string>;

  constructor(replies: Record<string, string>) {
    this.replies = replies;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.surfaces.push(request.role);
    return { content: this.replies[request.role] ?? "", model: "fixture-model" };
  }
}

function fixture(scenario: Scenario): { db: WritableDatabase; conversationId: string } {
  const dir = mkdtempSync("/tmp/close-tail-");
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createRuntimeTables(db);
  const conversationId = `conv-${scenario.label}`;
  db.prepare(
    "INSERT INTO conversations (id, interface, journey, title, summary, tags, metadata, started_at) " +
      "VALUES (?, 'pi', 'mirror-ts-core', ?, ?, ?, ?, ?)",
  ).run(
    conversationId,
    scenario.seed.title,
    scenario.seed.summary,
    scenario.seed.tags,
    scenario.seed.metadata,
    NOW,
  );
  for (let index = 0; index < scenario.seed.message_count; index += 1) {
    const role = index % 2 === 0 ? "user" : "assistant";
    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(
      `${conversationId}-m${String(index).padStart(2, "0")}`,
      conversationId,
      role,
      `${role} line ${index}`,
      `2026-09-03T12:00:${String(index).padStart(2, "0")}.000000Z`,
    );
  }
  return { db, conversationId };
}

function rowState(db: WritableDatabase, conversationId: string) {
  const row = db
    .prepare("SELECT title, summary, tags, metadata, ended_at FROM conversations WHERE id = ?")
    .get(conversationId) as Record<string, unknown>;
  return {
    title: (row.title as string | null) ?? null,
    summary: (row.summary as string | null) ?? null,
    tags: (row.tags as string | null) ?? null,
    metadata: (row.metadata as string | null) ?? null,
    ended_at_set: row.ended_at !== null && row.ended_at !== undefined,
  };
}

for (const scenario of golden.scenarios) {
  test(`close tail call sequence and end state: ${scenario.label}`, async () => {
    const { db, conversationId } = fixture(scenario);
    const provider = new RecordingProvider(scenario.replies);
    const reports: MetadataLifecycleApplyReport[] = [];
    const loggerDeps = { newId: () => "unused", nowIso: () => NOW };

    for (let run = 0; run < scenario.repeat; run += 1) {
      if (scenario.action === "finalize") {
        reports.push(await finalizeMetadataOnClose(db, conversationId, { llm: provider }));
      } else if (scenario.extraction_raises) {
        await assert.rejects(
          () =>
            endConversation(
              db,
              conversationId,
              { extract: true },
              loggerDeps,
              createCloseHooks({
                llm: provider,
                runExtraction: () => {
                  throw new Error("extraction failed");
                },
              }),
            ),
          /extraction failed/,
        );
      } else {
        await endConversation(
          db,
          conversationId,
          { extract: false },
          loggerDeps,
          createCloseHooks({ llm: provider }),
        );
      }
    }

    // The blocking assertion: same surfaces, same order, same count.
    assert.deepEqual(provider.surfaces, scenario.call_sequence);

    const state = rowState(db, conversationId);
    assert.equal(state.title, scenario.final_state.title);
    assert.equal(state.summary, scenario.final_state.summary);
    assert.equal(state.tags, scenario.final_state.tags);
    assert.equal(state.ended_at_set, scenario.final_state.ended_at_set);
    // Metadata is compared as parsed JSON: key order is not a behavior.
    assert.deepEqual(
      JSON.parse(state.metadata ?? "{}"),
      JSON.parse(scenario.final_state.metadata ?? "{}"),
    );

    for (const [index, expected] of scenario.reports.entries()) {
      const actual = reports[index];
      assert.ok(actual, `missing report ${index}`);
      assert.equal(actual.mutated, expected.mutated);
      assert.deepEqual(actual.changed, expected.changed);
      assert.deepEqual(actual.skipped, expected.skipped);
      assert.equal(actual.profile, expected.profile);
      assert.deepEqual(actual.actions, expected.actions);
    }
  });
}

test("the discarded second summary call is real, not a fixture artifact", () => {
  // Documents the wasted spend the port preserves: `_suggest_tags` declares a
  // `generated_summary` parameter and never reads it, so when the first
  // generation comes back blank and the summary decision is refine_candidate,
  // Python pays for a summary it throws away.
  const scenario = golden.scenarios.find(
    (s) => s.label === "double_summary_when_generation_is_blank",
  );
  assert.ok(scenario);
  const summaryCalls = scenario.call_sequence.filter((s) => s === "conversation_summary");
  assert.equal(summaryCalls.length, 2);
  // Both calls came back blank, so nothing was applied: the stored summary is
  // untouched and the report records the failure. Two model calls were paid
  // for and neither changed a byte.
  assert.equal(scenario.final_state.summary, "- bullet one\n- bullet two");
  assert.equal(scenario.seed.summary, scenario.final_state.summary);
  assert.equal(scenario.reports[0]?.skipped.summary, "generation_failed");
});

test("re-running the close tail is not free", () => {
  // A generated title plus six messages decides refine_candidate, which the
  // close_time profile regenerates — so a second close costs three more calls.
  const scenario = golden.scenarios.find((s) => s.label === "rerun_over_finalized_conversation");
  assert.ok(scenario);
  assert.equal(scenario.call_sequence.length, 6);
});

test("a manual title lock survives the force profile", () => {
  const scenario = golden.scenarios.find((s) => s.label === "manual_title_lock_is_preserved");
  assert.ok(scenario);
  assert.ok(!scenario.call_sequence.includes("conversation_title"));
  assert.equal(scenario.final_state.title, "Human chosen title");
});

test("ended_at is written before extraction runs", async () => {
  const scenario = golden.scenarios[0] as Scenario;
  const { db, conversationId } = fixture({ ...scenario, label: "ordering-probe" });
  let endedAtDuringExtraction: unknown = "unset";

  await endConversation(
    db,
    conversationId,
    { extract: true },
    { newId: () => "unused", nowIso: () => NOW },
    createCloseHooks({
      llm: new RecordingProvider(scenario.replies),
      runExtraction: () => {
        endedAtDuringExtraction = (
          db
            .prepare("SELECT ended_at FROM conversations WHERE id = ?")
            .get(conversationId) as Record<string, unknown>
        ).ended_at;
      },
    }),
  );

  assert.equal(endedAtDuringExtraction, NOW, "extraction must observe a closed conversation");
});

test("finalization still runs when extraction throws", async () => {
  const scenario = golden.scenarios[0] as Scenario;
  const { db, conversationId } = fixture({ ...scenario, label: "finally-probe" });
  const provider = new RecordingProvider(scenario.replies);

  await assert.rejects(
    () =>
      endConversation(
        db,
        conversationId,
        { extract: true },
        { newId: () => "unused", nowIso: () => NOW },
        createCloseHooks({
          llm: provider,
          runExtraction: () => {
            throw new Error("boom");
          },
        }),
      ),
    /boom/,
  );

  assert.ok(provider.surfaces.length > 0, "the finally block must still finalize metadata");
  assert.equal(rowState(db, conversationId).title, "A generated title");
});

// --- helper parity ----------------------------------------------------------

test("cleanTitle matches Python's _clean_title", () => {
  assert.equal(cleanTitle("  spaced   out  "), "spaced out");
  assert.throws(() => cleanTitle("   "), /title is required/);
  assert.throws(() => cleanTitle("x".repeat(161)), /at most 160 characters/);
  assert.equal(cleanTitle("x".repeat(160)).length, 160);
});

test("cleanSummary collapses paragraphs and truncates at 1000", () => {
  assert.equal(cleanSummary("  one   two  \n\n  three  "), "one two\n\nthree");
  assert.equal(cleanSummary("a\n\n\n\nb"), "a\n\nb");
  assert.equal(cleanSummary("   "), "");
  assert.ok(cleanSummary("word ".repeat(400)).length <= 1000);
});

test("looksLikeArtifact rejects digits, hashes and CSS sizes", () => {
  assert.ok(looksLikeArtifact("123"));
  assert.ok(looksLikeArtifact("1b63c00"));
  assert.ok(looksLikeArtifact("10px"));
  assert.ok(looksLikeArtifact("v2"));
  assert.ok(!looksLikeArtifact("ariad"));
  assert.ok(!looksLikeArtifact("metadata lifecycle"));
});
