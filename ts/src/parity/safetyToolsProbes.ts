// DB-safety-tools write-parity probe (CV22.DS7.TS1 plateau 4), the TS side
// of `ts/parity/write_parity_safety_tools.py`.
//
// `repair_encoding` replays `scan -> apply -> scan` on the TS copy of the same
// seeded real-database copy the oracle ran on, and grades the ordered hit
// list (Python's `json.dumps(sort_keys=True, ensure_ascii=True)`), the apply
// count, and the seeded rows' cells afterwards -- including a legitimate
// "Âncora" row that must come through untouched.

import { applyRepairs, scanDatabase } from "#repair/encodingRepair.ts";
import { pythonJsonDumpsEnsureAscii } from "#util/pyGenerators.ts";
import type { MutatedRow } from "./writeParity.ts";
import type { WriteProbe } from "./writeProbe.ts";

export interface RepairEncodingProbeParams {
  identity_keys: string[];
  memory_ids: string[];
  conversation_ids: string[];
  message_ids: string[];
  task_ids: string[];
}

export function repairEncodingProbe(label: string, params: RepairEncodingProbeParams): WriteProbe {
  return {
    label,
    snapshots: [
      {
        table: "identity",
        keyColumn: "key",
        columns: ["content"],
        selectorColumn: "key",
        selectorValues: params.identity_keys,
      },
      {
        table: "memories",
        keyColumn: "id",
        columns: ["content", "journey", "layer"],
        selectorColumn: "id",
        selectorValues: params.memory_ids,
      },
      {
        table: "conversations",
        keyColumn: "id",
        columns: ["title", "summary", "journey", "persona"],
        selectorColumn: "id",
        selectorValues: params.conversation_ids,
      },
      {
        table: "messages",
        keyColumn: "id",
        columns: ["content"],
        selectorColumn: "id",
        selectorValues: params.message_ids,
      },
      {
        table: "tasks",
        keyColumn: "id",
        columns: ["title", "journey", "status"],
        selectorColumn: "id",
        selectorValues: params.task_ids,
      },
    ],
    apply(db): MutatedRow[] {
      const hits = scanDatabase(db);
      const applied = applyRepairs(db, hits);
      const remaining = scanDatabase(db);
      // Key order matches the oracle's sort_keys=True dump.
      const json = pythonJsonDumpsEnsureAscii(
        hits.map((hit) => ({
          after: hit.after,
          before: hit.before,
          column: hit.column,
          row_id: hit.row_id,
          table: hit.table,
        })),
      );
      return [
        { id: "hits:json", cells: { json } },
        { id: "apply:count", cells: { applied, remaining: remaining.length } },
      ];
    },
  };
}
