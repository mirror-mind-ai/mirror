// Soul session-state write-parity probe (CV22.DS7.US6 plateau 2), the TS side
// of `ts/parity/write_parity_soul.py`.
//
// Replays the ritual sequence -- mature, mature again, harvest, decline -- on
// the TS copy of the same seeded real-database copy the oracle ran on, and
// grades `runtime_sessions.metadata` after EACH step. The intermediate bytes
// are the point: a port can end in the right state having passed through the
// wrong one (both keys present at once, `"{}"` where Python writes NULL).

import { createHash } from "node:crypto";
import { embeddingToBytes } from "#db/decode.ts";
import { EMBEDDING_DIMENSIONS } from "#providers/embedding.ts";
import { applyIdentityIntegration } from "#soul/apply.ts";
import { saveHarvestedFruit } from "#soul/harvest.ts";
import {
  clearFruitInMaturation,
  clearHarvestedFruit,
  harvestFruit,
  setFruitInMaturation,
} from "#soul/state.ts";
import type { MutatedRow } from "./writeParity.ts";
import type { WriteProbe } from "./writeProbe.ts";

export interface SoulStateProbeParams {
  session_id: string;
  bare_session_id: string;
  first_fruit: string;
  second_fruit: string;
}

export interface SoulApplyProbeParams {
  layer: string;
  key: string;
  content: string;
  origin: string;
  integration_id: string;
}

/**
 * The identity integration on a real-database copy: the audit row field by
 * field (the oracle's id and clock ride in the fixture, so they are comparable
 * rather than merely shaped alike) and the resulting identity DOCUMENT.
 */
export function soulApplyProbe(
  label: string,
  params: SoulApplyProbeParams,
  nowIso: string,
): WriteProbe {
  return {
    label,
    snapshots: [],
    apply(db): MutatedRow[] {
      applyIdentityIntegration(
        db,
        {
          layer: params.layer,
          key: params.key,
          content: params.content,
          origin: params.origin,
        },
        { newId: () => params.integration_id, nowIso },
      );
      const rows = db
        .prepare(
          "SELECT id, layer, key, content, source, origin, conversation_id," +
            " journal_id, created_at, status, metadata FROM identity_integrations" +
            " ORDER BY rowid",
        )
        .all() as Record<string, unknown>[];
      const state: MutatedRow[] = rows.map((row, index) => ({
        id: `integration:${index}`,
        cells: row as MutatedRow["cells"],
      }));
      const document = db
        .prepare("SELECT content FROM identity WHERE layer = ? AND key = ?")
        .get(params.layer, params.key) as { content: string };
      state.push({ id: "identity:document", cells: { content: document.content } });
      return state;
    },
  };
}

export function soulStateProbe(
  label: string,
  params: SoulStateProbeParams,
  nowIso: string,
): WriteProbe {
  return {
    label,
    snapshots: [
      {
        table: "runtime_sessions",
        keyColumn: "session_id",
        columns: ["metadata", "active"],
        selectorColumn: "session_id",
        selectorValues: [params.session_id, params.bare_session_id],
      },
    ],
    apply(db): MutatedRow[] {
      const steps: MutatedRow[] = [];
      const record = (step: string, sessionId: string) => {
        const row = db
          .prepare("SELECT metadata FROM runtime_sessions WHERE session_id = ?")
          .get(sessionId) as { metadata: string | null } | undefined;
        steps.push({ id: `soul:${step}`, cells: { metadata: row?.metadata ?? null } });
      };

      setFruitInMaturation(db, params.first_fruit, params.session_id, nowIso);
      record("1_first_maturation", params.session_id);
      setFruitInMaturation(db, params.second_fruit, params.session_id, nowIso);
      record("2_second_maturation", params.session_id);
      harvestFruit(db, { sessionId: params.session_id }, nowIso);
      record("3_harvest_promotes", params.session_id);
      clearHarvestedFruit(db, params.session_id, nowIso);
      record("4_decline_keeps_operating_mode", params.session_id);
      clearFruitInMaturation(db, params.session_id, nowIso);
      record("5_clear_absent_key_is_stable", params.session_id);

      setFruitInMaturation(db, "bare session fruit", params.bare_session_id, nowIso);
      record("6_bare_session_maturation", params.bare_session_id);
      clearFruitInMaturation(db, params.bare_session_id, nowIso);
      record("7_bare_session_clear_writes_null", params.bare_session_id);
      return steps;
    },
  };
}

export interface SoulHarvestSaveProbeParams {
  session_id: string;
  memory_id: string;
}

/**
 * `soul harvest save` on a real-database copy, with the embedding answered
 * offline by the same fixed vector the oracle used.
 *
 * The graded state is the journal row, the embedding blob's hash, and the
 * session metadata after the harvest key is cleared -- the write is only
 * complete if all three moved together.
 */
export function soulHarvestSaveProbe(
  label: string,
  params: SoulHarvestSaveProbeParams,
  nowIso: string,
): WriteProbe {
  return {
    label,
    snapshots: [],
    apply(db): MutatedRow[] {
      saveHarvestedFruit(
        db,
        { sessionId: params.session_id, journey: null },
        {
          newId: () => params.memory_id,
          nowIso,
          embed: () => embeddingToBytes(Array<number>(EMBEDDING_DIMENSIONS).fill(0.25)),
          readMessages: (conversationId) =>
            db
              .prepare(
                "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY rowid",
              )
              .all(conversationId) as { role: string; content: string }[],
        },
      );
      const row = db
        .prepare(
          "SELECT id, conversation_id, memory_type, layer, title, content, context, journey," +
            " persona, tags, created_at, relevance_score, metadata, use_count, readiness_state" +
            " FROM memories WHERE id = ?",
        )
        .get(params.memory_id) as Record<string, unknown>;
      const embedding = db
        .prepare("SELECT embedding FROM memories WHERE id = ?")
        .get(params.memory_id) as { embedding: Uint8Array };
      const session = db
        .prepare("SELECT metadata FROM runtime_sessions WHERE session_id = ?")
        .get(params.session_id) as { metadata: string | null };
      return [
        { id: "memory:row", cells: row as MutatedRow["cells"] },
        {
          id: "memory:embedding_sha256",
          cells: { sha256: createHash("sha256").update(embedding.embedding).digest("hex") },
        },
        { id: "session:metadata", cells: { metadata: session.metadata } },
      ];
    },
  };
}
