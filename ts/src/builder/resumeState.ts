// CV22.DS7.US8 plateau 2 — the DB-backed Builder resume state.
//
// Port of `read_builder_resume_state` from `src/memory/builder/resume_state.py`,
// deferred from plateau 1 because it needs both the adoption row and the delivery
// cursor, and the cursor's reader ships with its writer.
//
// Three states, in Python's order of precedence, each with its own reason:
//
//   no adopted method -> `adoption_required`
//   no cursor         -> `cursor_sync_required`
//   otherwise         -> resumable
//
// CR114: the actions come from `allowedNextActions` in `cursorPosition.ts`, the list
// `build show` prints too, except for a journey that adopted no method, which `build
// show` refuses. Python chose them here, from two facts and never the cursor's last
// event, so it offered Prepare at every position with nothing pending.
//
// CV22.DS10.TS4 removed the Workbench read that used to happen here, and with
// it an asymmetry both engines carried: Python read the Workbench unguarded
// here while the Home path wrapped the same call, so a database predating
// CV20.DS6 degraded there and RAISED on this one. Resume state is Delivery
// state now; the absent-tables case is graded in the golden.

import type { Database } from "#db/database.ts";
import { allowedNextActions, NOT_ADOPTED_ACTIONS } from "./cursorPosition.ts";
import { getDeliveryCursor } from "./deliveryCursor.ts";
import { getAdoptedMethod } from "./methodAdoption.ts";
import type { BuilderResumeState, ResumeCursorView } from "./resumeSurface.ts";

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
      allowedNextActions: [...NOT_ADOPTED_ACTIONS],
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
      allowedNextActions: [...allowedNextActions(null)],
    };
  }

  const view: ResumeCursorView = {
    activeItem: cursor.activeItem,
    activeItemLevel: cursor.activeItemLevel,
    activeCheckpoint: cursor.activeCheckpoint,
    pendingConfirmation: cursor.pendingConfirmation,
    lastDeliveryEvent: cursor.lastDeliveryEvent,
    releaseIntent: cursor.releaseIntent,
    releaseIntentDeliveryStory: cursor.releaseIntentDeliveryStory,
  };
  return {
    journey: normalizedJourney,
    adoptedMethod,
    cursor: view,
    resumable: true,
    reason: null,
    allowedNextActions: [...allowedNextActions(view)],
  };
}
