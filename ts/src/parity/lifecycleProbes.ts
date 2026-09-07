// Extraction-lifecycle write probes (CV22.DS7.US10 slice F) -- the TypeScript
// side of `ts/parity/write_parity_lifecycle.py`.
//
// Each probe replays the operation the Python oracle ran on its copy, through
// the SAME composition the front door uses (`createLoggerRuntime`), with the
// oracle's stub replies answering every model call and a fixed vector
// answering every embedding call. The snapshots mirror `lifecycle_state`
// table for table, key for key: rows the operation creates are keyed by
// content (`memories.title`, `tasks.title`) or by insertion order
// (`llm_calls.rowid`), which also grades the ledger's call order.

import {
  diagnoseJourneyAssociations,
  type JourneyFinding,
  renderJourneyFindings,
} from "#conversation/journeyRepair.ts";
import { endConversation } from "#conversation/logger.ts";
import { createLoggerRuntime, type LoggerRuntime } from "#conversation/loggerRuntime.ts";
import { sessionMaintenance } from "#conversation/sessionComposites.ts";
import type { WritableDatabase } from "#db/database.ts";
import { EMBEDDING_DIMENSIONS } from "#providers/embedding.ts";
import type { LlmProvider, LlmRequest, LlmResponse } from "#providers/llm.ts";
import { newId, pythonJsonDumps } from "#util/pyGenerators.ts";
import { normalizeMaintenanceReport } from "./maintenanceReport.ts";
import type { MutatedRow, WriteCell } from "./writeParity.ts";
import type { SnapshotSpec, WriteProbe } from "./writeProbe.ts";

/** The oracle's stub: the same reply per surface, the same response metadata. */
export const STUB_MODEL = "fixture-model";
export const STUB_PROMPT_TOKENS = 11;
export const STUB_COMPLETION_TOKENS = 7;
export const STUB_LATENCY_MS = 3;
export const EMBEDDING_VALUE = 0.25;

export interface CloseTailProbeParams {
  conversation_id: string;
  replies: Record<string, string>;
}

export interface SessionCompositesProbeParams {
  conversation_ids: string[];
  session_ids: string[];
  replies: Record<string, string>;
  poison_marker: string;
}

export interface JourneyRepairApplyProbeParams {
  conversation_ids: string[];
}

class OracleStubProvider implements LlmProvider {
  private readonly replies: Record<string, string>;
  private readonly poisonMarker: string | null;

  constructor(replies: Record<string, string>, poisonMarker: string | null) {
    this.replies = replies;
    this.poisonMarker = poisonMarker;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    if (
      request.role === "extraction" &&
      this.poisonMarker !== null &&
      request.prompt.includes(this.poisonMarker)
    ) {
      throw new Error("provider rejected the transcript");
    }
    const content = this.replies[request.role];
    if (content === undefined) throw new Error(`oracle stub has no reply for '${request.role}'`);
    return {
      content,
      model: STUB_MODEL,
      promptTokens: STUB_PROMPT_TOKENS,
      completionTokens: STUB_COMPLETION_TOKENS,
      latencyMs: STUB_LATENCY_MS,
    };
  }
}

function stubRuntime(
  db: WritableDatabase,
  nowIso: string,
  replies: Record<string, string>,
  poisonMarker: string | null,
  env: Record<string, string> = {},
): LoggerRuntime {
  return createLoggerRuntime({
    db,
    mirrorHome: "/nonexistent/parity-home",
    homeDir: "/nonexistent/parity-user",
    env: {
      MIRROR_TS_CONVERSATION_LLM_REPLAY: "<oracle-stub>",
      MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY: "<oracle-stub>",
      PI_SESSIONS_DIR: "/nonexistent/absent-pi-sessions",
      ...env,
    },
    deps: { newId, nowIso: () => nowIso },
    loadLlm: async () => new OracleStubProvider(replies, poisonMarker),
    loadEmbeddings: async () => ({
      embed: async () => Array<number>(EMBEDDING_DIMENSIONS).fill(EMBEDDING_VALUE),
    }),
    monotonic: () => 0,
  });
}

const CONVERSATION_CELLS = [
  "title",
  "started_at",
  "ended_at",
  "interface",
  "persona",
  "journey",
  "summary",
  "tags",
  "metadata",
];
const MESSAGE_CELLS = ["conversation_id", "role", "content", "created_at"];
const MEMORY_CELLS = [
  "memory_type",
  "layer",
  "content",
  "context",
  "journey",
  "persona",
  "tags",
  "conversation_id",
  "created_at",
  "metadata",
  "embedding",
];
const TASK_CELLS = [
  "journey",
  "status",
  "due_date",
  "scheduled_at",
  "time_hint",
  "stage",
  "context",
  "source",
  "created_at",
  "updated_at",
  "completed_at",
];
// latency_ms deliberately absent, as in the oracle: the embedding stub's
// latency is measured, not fixed.
const LLM_CALL_CELLS = [
  "role",
  "model",
  "prompt",
  "response",
  "prompt_tokens",
  "completion_tokens",
  "cost_usd",
  "conversation_id",
  "called_at",
];
const RUNTIME_SESSION_CELLS = [
  "conversation_id",
  "interface",
  "active",
  "started_at",
  "updated_at",
  "closed_at",
];

/** `lifecycle_state` in the oracle, spec for spec. */
function lifecycleSnapshots(conversationIds: string[], sessionIds: string[] = []): SnapshotSpec[] {
  const byConversation = (table: string, keyColumn: string, columns: string[]): SnapshotSpec => ({
    table,
    keyColumn,
    columns,
    selectorColumn: "conversation_id",
    selectorValues: conversationIds,
  });
  const specs: SnapshotSpec[] = [
    {
      table: "conversations",
      keyColumn: "id",
      columns: CONVERSATION_CELLS,
      selectorColumn: "id",
      selectorValues: conversationIds,
    },
    byConversation("messages", "id", MESSAGE_CELLS),
    byConversation("memories", "title", MEMORY_CELLS),
    byConversation("conversation_embeddings", "conversation_id", ["summary_embedding"]),
    {
      table: "tasks",
      keyColumn: "title",
      columns: TASK_CELLS,
      selectorColumn: "source",
      selectorValues: ["conversation"],
    },
    byConversation("llm_calls", "rowid", LLM_CALL_CELLS),
  ];
  if (sessionIds.length > 0) {
    specs.push({
      table: "runtime_sessions",
      keyColumn: "session_id",
      columns: RUNTIME_SESSION_CELLS,
      selectorColumn: "session_id",
      selectorValues: sessionIds,
    });
  }
  return specs;
}

export function closeTailProbe(
  label: string,
  nowIso: string,
  params: CloseTailProbeParams,
): WriteProbe {
  return {
    label,
    snapshots: lifecycleSnapshots([params.conversation_id]),
    async apply(db) {
      const runtime = stubRuntime(db, nowIso, params.replies, null);
      await endConversation(
        db,
        params.conversation_id,
        { extract: true },
        runtime.deps,
        await runtime.closeHooks(),
      );
    },
  };
}

export function sessionCompositesProbe(
  label: string,
  nowIso: string,
  params: SessionCompositesProbeParams,
): WriteProbe {
  return {
    label,
    snapshots: lifecycleSnapshots(params.conversation_ids, params.session_ids),
    async apply(db) {
      const runtime = stubRuntime(db, nowIso, params.replies, params.poison_marker);
      const report = await sessionMaintenance(db, await runtime.maintenanceDeps());
      return [
        {
          id: "report:session_maintenance",
          cells: { report_normalized: normalizeMaintenanceReport(report) },
        },
      ];
    },
  };
}

export function journeyRepairApplyProbe(
  label: string,
  params: JourneyRepairApplyProbeParams,
): WriteProbe {
  const journeys = (db: WritableDatabase): Record<string, WriteCell> => {
    const cells: Record<string, WriteCell> = {};
    const placeholders = params.conversation_ids.map(() => "?").join(", ");
    for (const row of db
      .prepare(`SELECT id, journey FROM conversations WHERE id IN (${placeholders}) ORDER BY id`)
      .all(...params.conversation_ids)) {
      cells[String(row.id)] = typeof row.journey === "string" ? row.journey : null;
    }
    return cells;
  };
  // Python `json.dumps(findings, sort_keys=True)`.
  const findingsJson = (findings: readonly JourneyFinding[]): string =>
    pythonJsonDumps(
      findings.map((finding) =>
        Object.fromEntries(Object.entries(finding).sort(([a], [b]) => (a < b ? -1 : 1))),
      ),
    );
  return {
    label,
    // Everything graded is carried as extra rows, exactly as the oracle records it.
    snapshots: [],
    apply(db): MutatedRow[] {
      const before = journeys(db);
      const dryRun = diagnoseJourneyAssociations(db, { apply: false });
      const afterDryRun = journeys(db);
      const applied = diagnoseJourneyAssociations(db, {
        apply: true,
        backup: () => "<front-door pre-write backup>",
      });
      const afterApply = journeys(db);
      return [
        { id: "journeys:before", cells: before },
        { id: "journeys:after_dry_run", cells: afterDryRun },
        { id: "journeys:after_apply", cells: afterApply },
        { id: "findings:dry_run", cells: { json: findingsJson(dryRun) } },
        { id: "findings:applied", cells: { json: findingsJson(applied) } },
        { id: "rendered:dry_run", cells: { text: renderJourneyFindings(dryRun, false) } },
        { id: "rendered:applied", cells: { text: renderJourneyFindings(applied, true) } },
      ];
    },
  };
}
