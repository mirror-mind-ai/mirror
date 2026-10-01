// CR115 — the cadence a journey runs at, and the rows that print it.
//
// A journey's cadence changes what Plan does: under `accelerated`, Plan records a story
// preauthorization and the Driver continues into implementation without a Navigator
// turn. The cursor stores the profile and, for `autonomous`, its limits, and only the
// cursor sync report printed them, when the cadence was being changed. Every surface
// that orients the Navigator now prints them, from this module: the Builder resume and
// `build show` in their label-and-value pairs, the Builder orientation in its own rows.
//
// A cursor that stores no profile runs `stepwise`. The sync report and
// `continue-lifecycle` each held that default before; they read it here now.
//
// This module reads two fields and declares them itself, so it imports nothing from the
// cursor's persistence module, which imports it.

import { cardText, cardWrapped } from "./card.ts";

const FRAME_BLANK = cardText("");

/** The cursor fields the cadence is read from. */
export interface CadenceView {
  readonly cadenceProfile: string | null;
  readonly cadenceLimits: readonly string[];
}

/** The profile the runtime applies: a cursor that stores none runs `stepwise`. */
export function effectiveCadenceProfile(cursor: CadenceView): string {
  return cursor.cadenceProfile || "stepwise";
}

/**
 * The limits as one line, or `none`. They bound continuation only under `autonomous`,
 * so only that profile prints them: a limit stored beside another profile bounds
 * nothing, and printing it would say it did.
 */
function limitsUnder(cursor: CadenceView): string | null {
  if (effectiveCadenceProfile(cursor) !== "autonomous") return null;
  return cursor.cadenceLimits.length > 0 ? cursor.cadenceLimits.join(", ") : "none";
}

/**
 * The resume's and `build show`'s rows: `cadence profile` and the profile, and under
 * `autonomous`, `cadence limits` and the limits. With no cursor there is no cadence.
 */
export function cadenceCardLines(cursor: CadenceView | null): string[] {
  if (cursor === null) return [cardText("cadence profile"), cardText("none")];
  const lines = [cardText("cadence profile"), cardText(effectiveCadenceProfile(cursor))];
  const limits = limitsUnder(cursor);
  if (limits !== null) lines.push(FRAME_BLANK, cardText("cadence limits"), ...cardWrapped(limits));
  return lines;
}

/** The orientation's rows, in its `label: value` form, as it answers the Refinement question. */
export function cadenceOrientationLines(cursor: CadenceView): string[] {
  const lines = cardWrapped(`cadence profile: ${effectiveCadenceProfile(cursor)}`);
  const limits = limitsUnder(cursor);
  if (limits !== null) lines.push(...cardWrapped(`cadence limits: ${limits}`));
  return lines;
}
