// CV22.DS7.US8 plateau 2 — the Builder delivery-cursor write probe.
//
// Replays the sequence `write_parity_builder.py` recorded, on a parallel copy of
// the same seed database, and reports the row after every step so the comparison
// is on the SEQUENCE rather than the end state.
//
// What it adds over the synthetic golden is the starting state. Every case in
// `builder-cursor.golden.json` begins from an empty row; a real install begins
// mid-lifecycle, with a generation above zero and possibly a pending confirmation.
// The carry-forward rule and receipt invalidation are both defined relative to a
// previous row, so a real previous row is the only way to exercise them without
// having written it here.
//
// What it does NOT add: byte parity of `metadata`. The harness canonicalizes that
// cell before comparing, so the dialect is graded by the unit golden and this
// probe grades the state a real database ends in.

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { getAriadMethod } from "#builder/ariadMethod.ts";
import { clearDeliveryCursor, setDeliveryCursor } from "#builder/deliveryCursor.ts";
import { expandDeliveryStory } from "#builder/expand.ts";
import { runBuildLoad } from "#builder/load.ts";
import { planLifecycleItem } from "#builder/plan.ts";
import { prepareLifecycleItem } from "#builder/prepare.ts";
import { pullLifecycleItem } from "#builder/pull.ts";
import { createStoryDirectory, resolveStoryDirectory } from "#builder/storyPaths.ts";
import { switchConversation } from "#conversation/logger.ts";
import type { WritableDatabase } from "#db/database.ts";
import { loadReplayEmbeddingProvider } from "#providers/embedding.ts";
import type { MutatedRow } from "./writeParity.ts";
import type { WriteProbe } from "./writeProbe.ts";

/** One recorded step: the label and the exact kwargs Python passed. */
export interface BuilderCursorStep {
  readonly label: string;
  readonly changes: Record<string, unknown>;
}

export interface BuilderCursorProbeParams {
  readonly journey: string;
  readonly session_id: string;
  readonly sequence: readonly BuilderCursorStep[];
  readonly starting_row: Record<string, unknown> | null;
  readonly starting_generation: number | null;
}

const ROW_COLUMNS = [
  "session_id",
  "interface",
  "journey",
  "active",
  "started_at",
  "updated_at",
  "closed_at",
  "metadata",
] as const;

/** Python's snake_case cursor kwargs, mapped to the TS option names. */
const CHANGE_KEYS: Record<string, string> = {
  active_item: "activeItem",
  active_item_title: "activeItemTitle",
  active_item_level: "activeItemLevel",
  active_checkpoint: "activeCheckpoint",
  pending_confirmation: "pendingConfirmation",
  last_delivery_event: "lastDeliveryEvent",
  cadence_profile: "cadenceProfile",
  cadence_limits: "cadenceLimits",
  granularity_decision: "granularityDecision",
  navigator_flow_unit: "navigatorFlowUnit",
  child_work_items: "childWorkItems",
  aggregate_checkpoint_status: "aggregateCheckpointStatus",
  cursor_generation: "cursorGeneration",
};

function toOptions(
  journey: string,
  changes: Record<string, unknown>,
): Parameters<typeof setDeliveryCursor>[1] {
  const options: Record<string, unknown> = { journey, method: "ariad" };
  for (const [key, value] of Object.entries(changes)) {
    const mapped = CHANGE_KEYS[key];
    if (mapped === undefined) {
      throw new Error(`write-parity fixture carries an unmapped cursor key: ${key}`);
    }
    options[mapped] = value;
  }
  return options as unknown as Parameters<typeof setDeliveryCursor>[1];
}

export function builderCursorStateProbe(
  label: string,
  params: BuilderCursorProbeParams,
  nowIso: string,
): WriteProbe {
  return {
    label,
    snapshots: [
      {
        table: "runtime_sessions",
        keyColumn: "session_id",
        columns: ["interface", "journey", "active", "started_at", "closed_at", "metadata"],
        selectorColumn: "session_id",
        selectorValues: [params.session_id],
      },
    ],
    apply(db: WritableDatabase): MutatedRow[] {
      const steps: MutatedRow[] = [];
      const record = (index: number, stepLabel: string) => {
        const row = db
          .prepare("SELECT * FROM runtime_sessions WHERE session_id = ?")
          .get(params.session_id) as Record<string, unknown> | undefined;
        const cells: Record<string, string | number | bigint | boolean | null> = {};
        if (row === undefined) {
          cells.row = null;
        } else {
          for (const column of ROW_COLUMNS) {
            const value = row[column];
            cells[column] =
              value === undefined ? null : (value as string | number | bigint | boolean | null);
          }
        }
        steps.push({ id: `${String(index).padStart(2, "0")}:${stepLabel}`, cells });
      };

      // The projection seam is Python-owned and best-effort; a probe must not
      // spawn a subprocess, so no refresh callback is supplied.
      const deps = { nowIso: () => nowIso };
      params.sequence.forEach((step, index) => {
        setDeliveryCursor(db, toOptions(params.journey, step.changes), deps);
        record(index, step.label);
      });
      clearDeliveryCursor(db, params.journey, deps);
      record(params.sequence.length, "clear");
      return steps;
    },
  };
}

export interface BuilderArtifactsProbeParams {
  readonly journey: string;
  readonly session_id: string;
  readonly delivery_story: string;
  readonly delivery_story_title: string;
  readonly child_code: string;
  readonly child_title: string;
  readonly authored_plan: string;
  readonly starting_files: Record<string, string>;
}

/**
 * Materialize a story package with the TypeScript core and record the files.
 *
 * The counterpart of `builder_artifacts_probe`. Files are reported as ordinary state
 * rows (`id` = `file:<project-relative path>`, `cells.content` = its bytes), which is
 * why this needs no harness change: `MutatedRow` is an identified cell bag, not a
 * database row.
 *
 * Two properties this probe has that the golden corpus does not: the journey and the
 * starting cursor come from a copy of a REAL database, and the lifecycle runs against
 * it rather than against a synthetic store.
 *
 * It writes into its OWN disposable project, never the journey's real `project_path`
 * — the same safety rule the Python probe states. Its tree is seeded from
 * `starting_files` so both engines begin from identical bytes; sharing one directory
 * would make the second engine report `existing` where the first reported `created`.
 */
export function builderArtifactsProbe(
  label: string,
  params: BuilderArtifactsProbeParams,
  nowIso: string,
  projectRoot: string,
): WriteProbe {
  return {
    label,
    snapshots: [
      {
        table: "runtime_sessions",
        keyColumn: "session_id",
        columns: ["interface", "journey", "active", "started_at", "closed_at", "metadata"],
        selectorColumn: "session_id",
        selectorValues: [params.session_id],
      },
    ],
    apply(db: WritableDatabase): MutatedRow[] {
      rmSync(projectRoot, { recursive: true, force: true });
      for (const [relativePath, content] of Object.entries(params.starting_files)) {
        const target = join(projectRoot, relativePath);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content, "utf8");
      }

      // No refresh callback: the projection seam is Python-owned and a probe must
      // not spawn a subprocess.
      const deps = { nowIso: () => nowIso };
      setDeliveryCursor(
        db,
        {
          journey: params.journey,
          method: "ariad",
          activeItem: params.delivery_story,
          activeItemTitle: params.delivery_story_title,
          activeItemLevel: "delivery_story",
        },
        deps,
      );
      expandDeliveryStory(
        db,
        { journey: params.journey, method: "ariad", projectPath: projectRoot },
        deps,
      );
      pullLifecycleItem(
        db,
        {
          journey: params.journey,
          method: "ariad",
          item: {
            code: params.child_code,
            title: params.child_title,
            level: "user_story",
            whyNow: "write parity materialization",
          },
        },
        deps,
      );
      prepareLifecycleItem(
        db,
        { journey: params.journey, method: "ariad", projectPath: projectRoot },
        deps,
      );
      const packagePath =
        resolveStoryDirectory(projectRoot, params.child_code) ??
        createStoryDirectory(projectRoot, params.child_code, params.child_title);
      const planPath = join(packagePath, "plan.md");
      mkdirSync(dirname(planPath), { recursive: true });
      writeFileSync(planPath, params.authored_plan, "utf8");
      planLifecycleItem(
        db,
        { journey: params.journey, method: getAriadMethod(), planArtifactPath: planPath },
        deps,
      );

      return projectFileRows(projectRoot);
    },
  };
}

/** Every authored file as a state row, sorted so the two engines align positionally. */
function projectFileRows(projectRoot: string): MutatedRow[] {
  const paths: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else paths.push(absolute);
    }
  };
  walk(projectRoot);
  return paths
    .map((absolute) => relative(projectRoot, absolute).split(sep).join("/"))
    .sort((a, b) => (a < b ? -1 : 1))
    .map((relativePath) => ({
      id: `file:${relativePath}`,
      cells: { content: readFileSync(join(projectRoot, relativePath), "utf8") },
    }));
}

// --- CV22.DS7.US8 plateau 7 — `build load` on a real corpus ------------------

export interface BuilderLoadProbeParams {
  readonly journey: string;
  readonly session_id: string;
  readonly sticky_session_id: string;
  readonly replay_embedding_path: string;
  readonly base_access_log_id: number;
  readonly conversation_id: string | null;
  readonly touched_memory_ids: readonly string[];
}

/**
 * Run a whole session start against a copy of a REAL database.
 *
 * What this adds over `builder-load.golden.json`, whose nine cases seed at most
 * nine memories: the ranker runs over the Navigator's actual corpus, with real
 * vectors, real access history feeding the reinforcement term, and genuine
 * near-ties for the merge to break. The composition is the same; the data is the
 * part a synthetic case cannot imitate.
 *
 * Everything graded is content-free by construction — opaque memory ids, counts,
 * ledger roles, and DIGESTS of the rendered surfaces. A digest still fails when
 * the engines disagree; `--debug-sensitive-output` stays the deliberate way to
 * find out why.
 *
 * Both engines read the SAME embedding fixture (Python through the patched seam
 * in `build_load_oracle.py`, TypeScript through its replay provider), so a
 * ranking difference is a ranking difference and never a different query vector.
 */
export function builderLoadProbe(
  label: string,
  params: BuilderLoadProbeParams,
  nowIso: string,
): WriteProbe {
  return {
    label,
    snapshots: [
      {
        table: "runtime_sessions",
        keyColumn: "session_id",
        columns: [
          "conversation_id",
          "interface",
          "persona",
          "journey",
          "active",
          "started_at",
          "closed_at",
          "metadata",
        ],
        selectorColumn: "session_id",
        selectorValues: [params.session_id, params.sticky_session_id],
      },
      {
        table: "conversations",
        keyColumn: "id",
        columns: ["started_at", "ended_at", "interface", "persona", "journey"],
        selectorColumn: "id",
        selectorValues: params.conversation_id ? [params.conversation_id] : [],
      },
      {
        // Retrieval logs ACCESS, never USE: `use_count` feeds the reinforcement
        // term, so a port that bumped it here would re-rank the whole corpus.
        table: "memories",
        keyColumn: "id",
        columns: ["use_count"],
        selectorColumn: "id",
        selectorValues: [...params.touched_memory_ids],
      },
    ],
    async apply(db: WritableDatabase): Promise<MutatedRow[]> {
      const baseAccessId = maxAccessLogId(db);
      if (baseAccessId !== params.base_access_log_id) {
        // The two copies must come from one seed. If they do not, every row below
        // is a comparison between different databases, and a green verdict would
        // mean nothing at all.
        throw new Error(
          `builder_load: the TS copy starts at memory_access_log id ${baseAccessId} ` +
            `but the oracle recorded ${params.base_access_log_id}; the copies are not ` +
            "the same seed",
        );
      }
      const provider = await loadReplayEmbeddingProvider(params.replay_embedding_path);
      // Python's frozen `_uuid` is a hex counter, and `load` consumes it for the
      // conversation the switch creates. `log_llm_call` imports the name directly
      // so the ledger's own ids never reach the counter -- which is why the
      // conversation id is `00000001` on both engines and the ledger ids are
      // graded by role, not by value.
      let generated = 0;
      const newId = (): string => (++generated).toString(16).padStart(8, "0");
      const result = await runBuildLoad(
        db,
        { slug: params.journey, sessionId: params.session_id },
        {
          nowIso: () => nowIso,
          newId,
          embeddingProvider: provider,
          switchConversation: async (journey, sessionId) => {
            await switchConversation(
              db,
              sessionId,
              { persona: "engineer", journey },
              { nowIso: () => nowIso, newId },
            );
          },
        },
      );

      const accessed = db
        .prepare("SELECT memory_id FROM memory_access_log WHERE id > ? ORDER BY id")
        .all(baseAccessId) as { memory_id: string }[];
      const ledger = db
        .prepare(
          "SELECT role, model, prompt_tokens, completion_tokens, cost_usd " +
            "FROM llm_calls WHERE called_at = ? ORDER BY rowid",
        )
        .all(nowIso) as Record<string, unknown>[];
      const conversationId = (
        db
          .prepare("SELECT conversation_id FROM runtime_sessions WHERE session_id = ?")
          .get(params.session_id) as { conversation_id: string | null } | undefined
      )?.conversation_id;
      const flags = conversationId
        ? (db
            .prepare(
              "SELECT (title IS NOT NULL) AS has_title, (summary IS NOT NULL) AS has_summary, " +
                "(SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS messages " +
                "FROM conversations c WHERE c.id = ?",
            )
            .get(conversationId) as Record<string, number> | undefined)
        : undefined;

      return [
        ...accessed.map((row, index) => ({
          id: `access:${String(index).padStart(3, "0")}`,
          cells: { memory_id: row.memory_id },
        })),
        ...ledger.map((row, index) => ({
          id: `llm:${String(index).padStart(3, "0")}`,
          cells: {
            role: row.role as string,
            model: row.model as string,
            prompt_tokens: (row.prompt_tokens ?? null) as number | null,
            completion_tokens: (row.completion_tokens ?? null) as number | null,
            cost_usd: (row.cost_usd ?? null) as number | null,
          },
        })),
        {
          id: "stdout:sha256",
          cells: {
            stdout: digest(result.stdout),
            stderr: digest(result.stderr),
            memories_block: digest(memoriesBlock(result.stdout)),
            memories_rendered: memoriesBlock(result.stdout).split("\n[").length - 1,
          },
        },
        {
          id: "conversation:flags",
          cells: {
            has_title: flags ? Number(flags.has_title) : -1,
            has_summary: flags ? Number(flags.has_summary) : -1,
            messages: flags ? Number(flags.messages) : -1,
          },
        },
      ];
    },
  };
}

const MEMORIES_HEADING = "=== recent memories ===";

/** The rendered block alone, so its digest fails independently of the cards. */
function memoriesBlock(stdout: string): string {
  const index = stdout.indexOf(MEMORIES_HEADING);
  return index === -1 ? "" : stdout.slice(index + MEMORIES_HEADING.length);
}

function digest(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function maxAccessLogId(db: WritableDatabase): number {
  const row = db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM memory_access_log").get() as {
    id: number | bigint;
  };
  return Number(row.id);
}
