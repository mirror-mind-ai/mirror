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

import { clearDeliveryCursor, setDeliveryCursor } from "#builder/deliveryCursor.ts";
import type { WritableDatabase } from "#db/database.ts";
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
