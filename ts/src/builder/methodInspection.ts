// CV22.DS7.US8 plateau 1 — the Builder method inspection surfaces.
//
// Port of `src/memory/builder/method_inspection.py`. These are the five states
// `build inspect-method` and `build adopt` render. Unlike every other Builder
// surface they are PLAIN TEXT, not cards: no box drawing, no 54-column
// truncation, no padding — so a long journey name is printed in full and Unicode
// passes through untouched.
//
// Two details a port gets wrong by tidying:
//
//   * `render_available_method` ends with `"\n".join(lines).rstrip() + "\n"`, so
//     the trailing section's blank padding is stripped and the output ends in
//     exactly one newline. Every other renderer here ends with `+ "\n"` on a
//     joined list with no rstrip.
//   * `_render_contracts` prints `rules: {count}` — a NUMBER, not the rules. The
//     rule strings never reach any surface, which is why the DSL is graded
//     structurally rather than through its rendering.
//
// The surfaces also embed literal `build …` command lines. The port reproduced
// them with the Python program's name in front, because changing a surface is a
// product decision rather than a liberty taken inside a port. CV22.DS10.TS5 took
// that decision (D12) once the program they named was deleted: every such line
// now reads `PROGRAM`.

import { PROGRAM } from "#util/program.ts";
import type {
  CadenceProfileDefinition,
  CheckpointDefinition,
  ContractDefinition,
  MethodDefinition,
  OpaqueMap,
  SurfaceDefinition,
  SurfaceRoute,
  TemplateDefinition,
  WorkItemLevelDefinition,
} from "./methodDefinition.ts";

/** Python `AVAILABLE_METHODS`. */
export const AVAILABLE_METHODS = ["ariad"] as const;

/** Python `_event_label`: `str.replace("_", " ").title()`. */
function eventLabel(eventId: string): string {
  return pyTitle(eventId.replaceAll("_", " "));
}

/**
 * Python `str.title()`: uppercase the first cased character of every run of
 * letters, lowercase the rest. NOT `toUpperCase()` on word starts — Python
 * treats a digit or punctuation as a word boundary, so `"plan_2b"` titles to
 * `"Plan 2B"`. Implemented against Python's rule rather than a word split.
 */
function pyTitle(text: string): string {
  let previousIsCased = false;
  let result = "";
  for (const character of text) {
    const isCased = /\p{L}/u.test(character);
    result += previousIsCased ? character.toLowerCase() : character.toUpperCase();
    previousIsCased = isCased;
  }
  return result;
}

/** Python `render_available_method`. */
export function renderAvailableMethod(method: MethodDefinition): string {
  const lines: string[] = [
    "■ Builder Method Available",
    "",
    "method",
    method.label,
    "",
    "id",
    method.id,
    "",
    "source",
    "built-in method definition",
    "",
    "resolution layers",
  ];
  lines.push(...method.resolution.layers.map((layer) => `- ${layer}`));
  lines.push("", "lifecycle");
  lines.push(...method.lifecycle.map((event) => `- ${eventLabel(event.id)} ${event.meaning}`));
  lines.push("", "work item levels");
  lines.push(...renderWorkItemLevels(method.workItemLevels));
  lines.push("", "cadence profiles");
  lines.push(...renderCadenceProfiles(method.cadenceProfiles));
  lines.push("", "checkpoints");
  lines.push(...renderCheckpoints(method.checkpoints));
  lines.push("", "contracts");
  lines.push(...renderContracts(method.contracts));
  lines.push("", "policies");
  lines.push(...renderPolicies(method.policies ?? {}));
  lines.push("", "surfaces");
  lines.push(...renderSurfaces(method.surfaces));
  lines.push("", "surface routes");
  lines.push(...renderSurfaceRoutes(method.surfaceRoutes));
  lines.push("", "templates");
  lines.push(...renderTemplates(method.templates));
  lines.push("", "open questions");
  lines.push(...renderOpenQuestions(method.openQuestions ?? {}));
  // `.rstrip()` then one newline — the only renderer here that strips.
  return `${lines.join("\n").replace(/\s+$/u, "")}\n`;
}

/** Python `render_no_active_journey`. */
export function renderNoActiveJourney(): string {
  return `${[
    "■ Builder Method",
    "",
    "active journey",
    "none",
    "",
    "adopted method",
    "none",
    "",
    "available methods",
    AVAILABLE_METHODS.join(", "),
    "",
    "status",
    "No Builder journey is active yet.",
    "",
    "next action",
    "Activate Builder Mode for a journey or ask about a specific journey.",
    "",
    "example",
    `${PROGRAM} build load <journey>`,
  ].join("\n")}\n`;
}

/** Python `render_journey_method_state`. */
export function renderJourneyMethodState(journey: string, adoptedMethod: string | null): string {
  // Python's truthiness test, so an empty-string method falls through to the
  // not-adopted surface rather than rendering as adopted.
  if (!adoptedMethod) return renderJourneyWithoutAdoptedMethod(journey);
  return `${[
    "■ Builder Method",
    "",
    "journey",
    journey,
    "",
    "adopted method",
    adoptedMethod,
    "",
    "available methods",
    AVAILABLE_METHODS.join(", "),
    "",
    "status",
    adoptedMethod === "ariad"
      ? "Ariad is adopted for this journey."
      : `${adoptedMethod} is adopted for this journey.`,
  ].join("\n")}\n`;
}

/** Python `render_journey_without_adopted_method`. */
export function renderJourneyWithoutAdoptedMethod(journey: string): string {
  return `${[
    "■ Builder Method",
    "",
    "journey",
    journey,
    "",
    "adopted method",
    "none",
    "",
    "available methods",
    AVAILABLE_METHODS.join(", "),
    "",
    "status",
    "This journey has not adopted a Builder method yet.",
    "",
    "what can be inspected",
    "built-in method defaults",
    "",
    "what cannot be inspected yet",
    "effective journey configuration",
    "runtime delivery cursor",
    "active checkpoint",
    "pending confirmations",
    "",
    "next action",
    `${PROGRAM} build adopt --journey ${journey} --method ariad`,
  ].join("\n")}\n`;
}

/** Python `render_method_adoption_report`. */
export function renderMethodAdoptionReport(
  journey: string,
  method: string,
  options: { alreadyAdopted?: boolean } = {},
): string {
  const alreadyAdopted = options.alreadyAdopted ?? false;
  // Python's nested conditional expression: the "already" wording exists only
  // for ariad, so an already-adopted other method reads "is now adopted".
  const status =
    alreadyAdopted && method === "ariad"
      ? "Ariad was already adopted for this journey."
      : method === "ariad"
        ? "Ariad is now adopted for this journey."
        : `${method} is now adopted for this journey.`;
  return `${[
    "■ Builder Method Adopted",
    "",
    "journey",
    journey,
    "",
    "adopted method",
    method,
    "",
    "status",
    status,
    "",
    "not performed yet",
    "roadmap template generation",
    "runtime delivery cursor sync",
    "story lifecycle execution",
  ].join("\n")}\n`;
}

function renderWorkItemLevels(levels: readonly WorkItemLevelDefinition[]): string[] {
  if (levels.length === 0) return ["none"];
  const lines: string[] = [];
  for (const level of levels) {
    lines.push(`- ${level.id}: ${level.label}`);
    lines.push(`  implementable by default: ${level.implementableByDefault ? "yes" : "no"}`);
    if (level.expandsTo.length > 0) lines.push(`  expands to: ${level.expandsTo.join(", ")}`);
  }
  return lines;
}

function renderCadenceProfiles(profiles: readonly CadenceProfileDefinition[]): string[] {
  if (profiles.length === 0) return ["none"];
  return profiles.map(
    (profile) =>
      `- ${profile.id}: ${profile.stopPolicy}; plan=${profile.planApprovalPolicy} (${
        profile.active ? "active" : "future"
      })`,
  );
}

function renderCheckpoints(checkpoints: readonly CheckpointDefinition[]): string[] {
  if (checkpoints.length === 0) return ["none"];
  const lines: string[] = [];
  for (const checkpoint of checkpoints) {
    lines.push(`- ${checkpoint.id}`);
    if (checkpoint.occursAfter) lines.push(`  occurs after: ${checkpoint.occursAfter}`);
    if (checkpoint.blocks.length > 0) lines.push(`  blocks: ${checkpoint.blocks.join(", ")}`);
    if (checkpoint.requiredArtifacts.length > 0) {
      lines.push(`  requires artifacts: ${checkpoint.requiredArtifacts.join(", ")}`);
    }
    if (checkpoint.requiredConfirmations.length > 0) {
      lines.push(`  requires confirmations: ${checkpoint.requiredConfirmations.join(", ")}`);
    }
  }
  return lines;
}

function renderContracts(contracts: readonly ContractDefinition[]): string[] {
  if (contracts.length === 0) return ["none"];
  const lines: string[] = [];
  for (const contract of contracts) {
    lines.push(`- ${contract.id}: ${contract.appliesAt}`);
    // A COUNT, not the rules. The rule strings reach no surface.
    if (contract.rules.length > 0) lines.push(`  rules: ${contract.rules.length}`);
    if (contract.stopConditions.length > 0) {
      lines.push(`  stop conditions: ${contract.stopConditions.join(", ")}`);
    }
    if (contract.requiredOutputs.length > 0) {
      lines.push(`  required outputs: ${contract.requiredOutputs.join(", ")}`);
    }
  }
  return lines;
}

function asMap(value: unknown): OpaqueMap {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as OpaqueMap)
    : {};
}

/**
 * Python `_render_policies`: only three branches are rendered — `history.commit`,
 * `push`, and `release`. `history.worklog` and `history.decision_records` exist in
 * the DSL and are deliberately NOT shown, so the surface is a selection, not a
 * dump.
 */
function renderPolicies(policies: OpaqueMap): string[] {
  if (Object.keys(policies).length === 0) return ["none"];
  const lines: string[] = [];
  const history = asMap(policies.history);
  const commit = asMap(history.commit);
  if (Object.keys(commit).length > 0) {
    lines.push("- history.commit");
    appendMappingFields(lines, commit, "  ");
  }
  const push = asMap(policies.push);
  if (Object.keys(push).length > 0) {
    lines.push("- push");
    appendMappingFields(lines, push, "  ");
  }
  const release = asMap(policies.release);
  if (Object.keys(release).length > 0) {
    lines.push("- release");
    appendMappingFields(lines, release, "  ");
  }
  return lines.length > 0 ? lines : ["none"];
}

function renderSurfaces(surfaces: readonly SurfaceDefinition[]): string[] {
  if (surfaces.length === 0) return ["none"];
  return surfaces.map((surface) => {
    const event = surface.event ?? "none";
    const stopsFor = surface.stopsFor ? `; stops for: ${surface.stopsFor}` : "";
    return `- ${surface.id}: ${event}${stopsFor}`;
  });
}

function renderSurfaceRoutes(routes: readonly SurfaceRoute[]): string[] {
  if (routes.length === 0) return ["none"];
  return routes.map((route) => `- ${route.trigger}: ${route.surfaces.join(", ")}`);
}

function renderTemplates(templates: readonly TemplateDefinition[]): string[] {
  if (templates.length === 0) return ["none"];
  return templates.map((template) => `- ${template.id}: ${template.path}`);
}

function renderOpenQuestions(openQuestions: OpaqueMap): string[] {
  if (Object.keys(openQuestions).length === 0) return ["none"];
  const lines: string[] = [];
  for (const [key, value] of Object.entries(openQuestions)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const entry = value as OpaqueMap;
      const status = entry.status;
      const note = entry.note;
      lines.push(`- ${key}${typeof status === "string" ? ` [${status}]` : ""}`);
      if (typeof note === "string") lines.push(`  ${note}`);
    } else {
      lines.push(`- ${key}: ${pyStr(value)}`);
    }
  }
  return lines;
}

/**
 * Python `str(value)` for the scalar fallbacks in these two renderers: `True`,
 * `False`, and `None` are capitalized differently from JavaScript's.
 */
function pyStr(value: unknown): string {
  if (value === true) return "True";
  if (value === false) return "False";
  if (value === null || value === undefined) return "None";
  return String(value);
}

/** Python `_append_mapping_fields`: a list value joins with `", "`, else `str(value)`. */
function appendMappingFields(lines: string[], data: OpaqueMap, indent: string): void {
  for (const [key, value] of Object.entries(data)) {
    const rendered = Array.isArray(value)
      ? value.map((item) => pyStr(item)).join(", ")
      : pyStr(value);
    lines.push(`${indent}${key}: ${rendered}`);
  }
}
