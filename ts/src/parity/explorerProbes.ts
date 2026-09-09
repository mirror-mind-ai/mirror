// Explorer Story write-parity probe (CV22.DS7.US7 plateau 2), the TS side of
// `ts/parity/write_parity_explorer.py`.
//
// Replays one exploration -- open, thicken, clear, attractor, experiment,
// source evidence, archive -- on the TS copy of the same seeded real-database
// copy the oracle ran on, and grades BOTH stores after EACH step.
//
// The intermediate states are the point. A port can reach the right final row
// having passed through the wrong ones: an upsert that mints a new `id` instead
// of inheriting it, an explicit clear silently read as a keep, a second active
// row where the partial unique index expects one, or an archive that leaves the
// legacy runtime payload active for the next reader to resurrect.

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { type HandoffConversationSource, writeBuilderHandoffArtifacts } from "#explorer/handoff.ts";
import {
  archiveExplorerStory,
  type ExplorerStory,
  type StoryClock,
  setExplorerAttractors,
  setExplorerExperimentProposal,
  setExplorerSourceConversations,
  updateExplorerStory,
} from "#explorer/story.ts";
import { pythonJsonDumps } from "#util/pyGenerators.ts";
import type { MutatedRow } from "./writeParity.ts";
import type { WriteProbe } from "./writeProbe.ts";

export interface ExplorerStoryProbeParams {
  journey: string;
  session_id: string;
  opening_story: string;
  thickened_story: string;
  attractor_label: string;
  attractor_detail: string;
  experiment_title: string;
  source_conversation_id: string;
  uuid: string;
}

export function explorerStoryProbe(
  label: string,
  params: ExplorerStoryProbeParams,
  nowIso: string,
): WriteProbe {
  // The oracle froze both volatile fields for the whole probe, so the TS side
  // must too -- otherwise `id`, `created_at`, and `updated_at` differ by
  // construction and the comparison grades the clock instead of the write.
  const clock: StoryClock = { now: () => nowIso, uuid: () => params.uuid };

  return {
    label,
    snapshots: [
      {
        table: "exploratory_stories",
        keyColumn: "id",
        columns: [
          "journey",
          "title",
          "status",
          "current_story",
          "narrative_summary",
          "last_story_card",
          "attractors_json",
          "experiment_proposal_json",
          "builder_handoff_json",
          "source_conversations_json",
          "created_at",
          "updated_at",
          "promoted_at",
          "archived_at",
        ],
        selectorColumn: "journey",
        selectorValues: [params.journey],
      },
      {
        table: "runtime_sessions",
        keyColumn: "session_id",
        columns: ["metadata", "active"],
        selectorColumn: "session_id",
        selectorValues: [params.session_id],
      },
    ],
    apply(db): MutatedRow[] {
      const steps: MutatedRow[] = [];

      const record = (step: string) => {
        const rows = db
          .prepare(`SELECT * FROM exploratory_stories WHERE journey = ? ORDER BY created_at, id`)
          .all(params.journey);
        const session = db
          .prepare("SELECT metadata, active FROM runtime_sessions WHERE session_id = ?")
          .get(params.session_id) as { metadata: string | null; active: number } | undefined;
        steps.push({
          id: `explorer:${step}`,
          cells: {
            // Sorted keys and Python's separators, matching how the oracle
            // serialized the same rows for comparison.
            rows: pythonJsonDumps(rows.map(sortedRow)),
            session_metadata: session?.metadata ?? null,
            session_active: session?.active ?? null,
          },
        });
      };

      record("0_legacy_seed");

      updateExplorerStory(db, params.journey, clock, {
        currentExploratoryStory: params.opening_story,
      });
      record("1_open_migrates_legacy");

      updateExplorerStory(db, params.journey, clock, {
        currentExploratoryStory: params.thickened_story,
        lastStoryCard: "the oracle moved while we were reading it",
      });
      record("2_thicken_preserves_identity");

      updateExplorerStory(db, params.journey, clock, { narrativeFieldSummary: null });
      record("3_explicit_none_is_a_clear_not_a_keep");

      setExplorerAttractors(db, params.journey, clock, [
        { label: params.attractor_label, description: params.attractor_detail, status: "accepted" },
      ]);
      record("4_attractor_unicode_bytes");

      setExplorerExperimentProposal(db, params.journey, clock, {
        title: params.experiment_title,
        status: "proposed",
      });
      record("5_experiment_replaces_null_column");

      setExplorerSourceConversations(db, params.journey, clock, [
        { conversationId: params.source_conversation_id, role: "origin" },
      ]);
      record("6_source_evidence");

      archiveExplorerStory(db, params.journey, clock);
      record("7_archive_deactivates_runtime_payload");

      return steps;
    },
  };
}

/** `json.dumps(..., sort_keys=True)` over one row, for a comparable cell. */
function sortedRow(row: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(row).sort()) sorted[key] = row[key];
  return sorted;
}

export interface ExplorerHandoffProbeParams {
  ts_project_dir: string;
  journey: string;
  story_id: string;
  title: string;
  summary: string;
  editorial_synthesis: string;
  current_story: string;
  narrative_summary: string;
  last_story_card: string;
  attractor_label: string;
  attractor_detail: string;
  experiment_title: string;
  source_conversation_id: string;
  source_title: string;
  collisions: string[];
  transcript: { role: string; content: string }[];
}

/**
 * The handoff artifacts on a scratch project directory.
 *
 * The only probe in this harness whose graded state is FILESYSTEM state, because
 * that is what the command produces: documents inside the user's own repository.
 * Each core writes into its own scratch project beside the database copies, so
 * neither can observe the other's files, and the comparison is the chosen
 * directory plus every document byte for byte.
 *
 * The transcript carries one instance of every redaction pattern, including a
 * Devanagari phone number -- the row that separates Python's Unicode-aware `\d`
 * from JavaScript's ASCII one, and the only place in this story where a port can
 * leak a real secret into a file the user commits.
 */
export function explorerHandoffProbe(
  label: string,
  params: ExplorerHandoffProbeParams,
): WriteProbe {
  return {
    label,
    // No table is declared: this write never touches the database.
    snapshots: [],
    apply(): MutatedRow[] {
      const project = params.ts_project_dir;
      rmSync(project, { recursive: true, force: true });
      const explorations = join(project, "docs", "project", "explorations");
      for (const collision of params.collisions) {
        mkdirSync(join(explorations, collision), { recursive: true });
      }

      const story: ExplorerStory = {
        journey: params.journey,
        currentExploratoryStory: params.current_story,
        narrativeFieldSummary: params.narrative_summary,
        lastStoryCard: params.last_story_card,
        attractors: [
          {
            label: params.attractor_label,
            description: params.attractor_detail,
            status: "accepted",
          },
        ],
        experimentProposal: {
          title: params.experiment_title,
          description: null,
          status: "proposed",
        },
        builderHandoff: null,
        sourceConversations: [],
        id: params.story_id,
        title: params.title,
        status: "active",
        createdAt: null,
        updatedAt: null,
        promotedAt: null,
        archivedAt: null,
      };

      const sources: HandoffConversationSource[] = [
        {
          conversationId: params.source_conversation_id,
          title: params.source_title,
          role: "origin",
          messages: params.transcript,
        },
      ];

      const handoff = writeBuilderHandoffArtifacts(project, story, {
        title: params.title,
        summary: params.summary,
        editorialSynthesis: params.editorial_synthesis,
        sourceConversations: sources,
        includeFullConversation: true,
      });

      const base = handoff.artifactDir as string;
      const steps: MutatedRow[] = [
        {
          id: "handoff:artifact_dir",
          cells: { path: relative(project, base).split("\\").join("/") },
        },
      ];
      const walk = (directory: string): void => {
        for (const entry of readdirSync(directory).sort()) {
          const path = join(directory, entry);
          if (statSync(path).isDirectory()) walk(path);
          else {
            steps.push({
              id: `handoff:${relative(base, path).split("\\").join("/")}`,
              cells: { content: readFileSync(path, "utf-8") },
            });
          }
        }
      };
      walk(base);
      return steps;
    },
  };
}
