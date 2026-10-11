// CV22.DS7.US8 plateau 2 — the lifecycle progress ribbons.
//
// Port of `src/memory/builder/lifecycle_ribbon.py`. Every checkpoint surface
// prints one of these under its `Delivery` header, so a wrong glyph or a wrong
// separator is a byte divergence on most of the story's 33 surfaces.
//
// Three vocabularies, not one: the Delivery lifecycle, the Refinement Story flow,
// and the Change Request cycle. Only the first is in this story's scope for
// rendering, but all three are ported because they share `_render_progress_ribbon`
// and porting one of three copies of a shared renderer is how the `_wrap_plain_text`
// divergence happened in Python.
//
// An unknown stage RAISES rather than rendering a partial ribbon, and the message
// names the vocabulary — `unknown Ariad lifecycle stage: x` versus `unknown Ariad
// Refinement Story stage: x`. That is a Class B refusal with byte-exact text.
//
// CR113: a stage the item's level never reaches is drawn `–`, not applicable. A User
// or Technical Story never expands, and the Delivery ribbon drew its Expand as done
// once the cursor passed Prepare, and as still to come before. The level is a
// required argument, so every caller decides; which levels never expand is the
// runtime's one predicate, `isImplementableByDefault`. A Delivery Story, and a
// ribbon drawn with no level, look as they always did.

import { isImplementableByDefault } from "./cursorTransitions.ts";

/** Python `DELIVERY_LIFECYCLE_STAGES`. */
export const DELIVERY_LIFECYCLE_STAGES = [
  "pull",
  "prepare",
  "expand",
  "plan",
  "implement",
  "validate",
  "debt_review",
  "done",
] as const;

const DELIVERY_STAGE_LABELS: Record<string, string> = {
  pull: "Pull",
  prepare: "Prepare",
  expand: "Expand",
  plan: "Plan",
  implement: "Implement",
  validate: "Validate",
  debt_review: "Debt Review",
  done: "Done",
};

/** Python `REFINEMENT_STORY_STAGES`. */
export const REFINEMENT_STORY_STAGES = [
  "pull",
  "select_cr",
  "cr_cycle",
  "review",
  "coherence",
  "close",
] as const;

const REFINEMENT_STORY_STAGE_LABELS: Record<string, string> = {
  pull: "Pull",
  select_cr: "Select CR",
  cr_cycle: "CR Cycle",
  review: "Review",
  coherence: "Coherence",
  close: "Close",
};

/** Python `CHANGE_REQUEST_STAGES`. */
export const CHANGE_REQUEST_STAGES = [
  "confirm",
  "plan",
  "implement",
  "validate",
  "done_note",
] as const;

const CHANGE_REQUEST_STAGE_LABELS: Record<string, string> = {
  confirm: "Confirm",
  plan: "Plan",
  implement: "Implement",
  validate: "Validate",
  done_note: "Done Note",
};

/** The mark for a stage the item's level never reaches (CR113). */
const NOT_APPLICABLE = "–";

/** Python `_render_progress_ribbon`, with the stages an item's level never reaches. */
function renderProgressRibbon(options: {
  current: string;
  stages: readonly string[];
  labels: Record<string, string>;
  label: string;
  separator: string;
  unknownKind: string;
  notApplicable?: ReadonlySet<string>;
}): string {
  const { current, stages, labels, label, separator, unknownKind } = options;
  const notApplicable = options.notApplicable ?? new Set<string>();
  const currentIndex = stages.indexOf(current);
  if (currentIndex === -1) {
    throw new Error(`unknown ${unknownKind}: ${current}`);
  }
  const parts = stages.map((stage, index) => {
    const marker = notApplicable.has(stage)
      ? NOT_APPLICABLE
      : index < currentIndex
        ? "✓"
        : index === currentIndex
          ? "◉"
          : "○";
    return `${marker} ${labels[stage]}`;
  });
  return `${label}: ${parts.join(` ${separator} `)}`;
}

/** The Delivery stages an item's level never reaches: Expand, for a story. */
const STORY_NEVER_REACHES: ReadonlySet<string> = new Set(["expand"]);

/**
 * Python `render_lifecycle_ribbon`, told the item's level (CR113). `null` is a
 * ribbon with no item to speak of, drawn as it always was.
 */
export function renderLifecycleRibbon(current: string, level: string | null): string {
  return renderProgressRibbon({
    current,
    stages: DELIVERY_LIFECYCLE_STAGES,
    labels: DELIVERY_STAGE_LABELS,
    label: "Delivery Flow",
    separator: "→",
    unknownKind: "Ariad lifecycle stage",
    notApplicable:
      level !== null && isImplementableByDefault(level) ? STORY_NEVER_REACHES : undefined,
  });
}

/** Python `render_refinement_lifecycle_ribbon`. */
export function renderRefinementLifecycleRibbon(current = "pull"): string {
  return renderProgressRibbon({
    current,
    stages: REFINEMENT_STORY_STAGES,
    labels: REFINEMENT_STORY_STAGE_LABELS,
    label: "RS Flow",
    separator: "→",
    unknownKind: "Ariad Refinement Story stage",
  });
}

/** Python `render_change_request_lifecycle_ribbon`. */
export function renderChangeRequestLifecycleRibbon(current = "confirm"): string {
  return renderProgressRibbon({
    current,
    stages: CHANGE_REQUEST_STAGES,
    labels: CHANGE_REQUEST_STAGE_LABELS,
    label: "CR Cycle",
    separator: "→",
    unknownKind: "Ariad Change Request stage",
  });
}
