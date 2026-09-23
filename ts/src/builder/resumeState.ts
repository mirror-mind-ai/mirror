// CV22.DS7.US8 plateau 2 — the DB-backed Builder resume state.
//
// Port of `read_builder_resume_state` from `src/memory/builder/resume_state.py`,
// deferred from plateau 1 because it needs both the adoption row and the delivery
// cursor, and the cursor's reader ships with its writer.
//
// Three states, in Python's order of precedence, each with its own reason and its
// own allowed-next-actions tuple:
//
//   no adopted method -> `adoption_required`
//   no cursor         -> `cursor_sync_required`
//   otherwise         -> resumable, actions chosen by the cursor
//
// CV22.DS10.TS4 removed the Workbench read that used to happen here, and with
// it an asymmetry both engines carried: Python read the Workbench unguarded
// here while the Home path wrapped the same call, so a database predating
// CV20.DS6 degraded there and RAISED on this one. Resume state is Delivery
// state now; the absent-tables case is graded in the golden.

import type { Database } from "#db/database.ts";
import { getDeliveryCursor } from "./deliveryCursor.ts";
import { getAdoptedMethod } from "./methodAdoption.ts";
import {
  ACTIVE_ITEM_ACTIONS,
  type BuilderResumeState,
  NO_ACTIVE_ITEM_ACTIONS,
  PENDING_CONFIRMATION_ACTIONS,
} from "./resumeSurface.ts";

/** Python `_normalize_journey`. */
function normalizeJourney(journey: string): string {
  const normalized = typeof journey === "string" ? journey.trim() : "";
  if (!normalized) throw new Error("journey must not be empty");
  return normalized;
}

/** Python `read_builder_resume_state`. */
export function readBuilderResumeState(db: Database, journey: string): BuilderResumeState {
  const normalizedJourney = normalizeJourney(journey);

  const adoptedMethod = getAdoptedMethod(db, normalizedJourney);
  if (!adoptedMethod) {
    return {
      journey: normalizedJourney,
      adoptedMethod: null,
      cursor: null,
      resumable: false,
      reason: "adoption_required",
      allowedNextActions: ["adopt_method", "inspect_method"],
    };
  }

  const cursor = getDeliveryCursor(db, normalizedJourney);
  if (cursor === null) {
    return {
      journey: normalizedJourney,
      adoptedMethod,
      cursor: null,
      resumable: false,
      reason: "cursor_sync_required",
      allowedNextActions: ["sync_cursor", "inspect_method"],
    };
  }

  const allowedNextActions = cursor.pendingConfirmation
    ? PENDING_CONFIRMATION_ACTIONS
    : cursor.activeItem
      ? ACTIVE_ITEM_ACTIONS
      : NO_ACTIVE_ITEM_ACTIONS;

  return {
    journey: normalizedJourney,
    adoptedMethod,
    cursor: {
      activeItem: cursor.activeItem,
      activeCheckpoint: cursor.activeCheckpoint,
      pendingConfirmation: cursor.pendingConfirmation,
      lastDeliveryEvent: cursor.lastDeliveryEvent,
      releaseIntent: cursor.releaseIntent,
      releaseIntentDeliveryStory: cursor.releaseIntentDeliveryStory,
    },
    resumable: true,
    reason: null,
    allowedNextActions: [...allowedNextActions],
  };
}
