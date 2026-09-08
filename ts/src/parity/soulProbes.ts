// Soul session-state write-parity probe (CV22.DS7.US6 plateau 2), the TS side
// of `ts/parity/write_parity_soul.py`.
//
// Replays the ritual sequence -- mature, mature again, harvest, decline -- on
// the TS copy of the same seeded real-database copy the oracle ran on, and
// grades `runtime_sessions.metadata` after EACH step. The intermediate bytes
// are the point: a port can end in the right state having passed through the
// wrong one (both keys present at once, `"{}"` where Python writes NULL).

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
