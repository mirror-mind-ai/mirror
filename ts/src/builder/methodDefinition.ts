// CV22.DS7.US8 plateau 1 — the typed model for a Builder method definition.
//
// Port of `src/memory/builder/method_definition.py`.
//
// `validateMethodDefinition` has NO runtime caller, in Python or here: no `build`
// leaf invokes it, and Python's copy is reached only from Python's tests. It is
// ported anyway, and the reason is dated rather than general.
//
// Today the DSL's correctness is guaranteed by something stronger: the TypeScript
// definition is deep-equal to a Python definition that Python's own suite
// validates. That proof has an expiry. When DS10 deletes Python, the dump it is
// compared against goes with it, and from then on new Builder work edits the
// TypeScript DSL by hand — an authored artifact with per-field invariants and no
// checker. Porting the validator now means the invariant survives the deletion
// instead of being noticed missing afterwards.
//
// Optional fields use `undefined`, not `null`: Python's dataclass defaults are
// `None` for absent scalars and `()` for absent tuples, and the golden dump omits
// nothing — so the TS shape keeps empty arrays as empty arrays and absent scalars
// as absent, which is what deep equality against the dump requires.

/** Python `MethodDefinitionError`. */
export class MethodDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MethodDefinitionError";
  }
}

/**
 * A map whose KEYS are authored content, not field names. Rendered verbatim into
 * the inspection surface, so they are never renamed or case-converted.
 */
export type OpaqueMap = { readonly [key: string]: unknown };

export interface DslResolution {
  readonly layers: readonly string[];
  readonly conflictPolicy: string;
  readonly audit: boolean;
}

export interface TaxonomyLevel {
  readonly id: string;
  readonly label: string;
  readonly contains: readonly string[];
  readonly allowedStates: readonly string[];
  readonly stateSemantics?: OpaqueMap;
}

export interface Taxonomy {
  readonly stateVocabulary: readonly string[];
  readonly levels: readonly TaxonomyLevel[];
}

export interface LifecycleEvent {
  readonly id: string;
  readonly meaning: string;
}

export interface WorkItemLevelDefinition {
  readonly id: string;
  readonly label: string;
  readonly implementableByDefault: boolean;
  readonly expandsTo: readonly string[];
}

export interface CadenceProfileDefinition {
  readonly id: string;
  readonly label: string;
  readonly stopPolicy: string;
  readonly active: boolean;
  readonly planApprovalPolicy: string;
}

export interface CheckpointDefinition {
  readonly id: string;
  readonly occursAfter?: string;
  readonly blocks: readonly string[];
  readonly requiredArtifacts: readonly string[];
  readonly requiredConfirmations: readonly string[];
}

export interface SurfaceDefinition {
  readonly id: string;
  readonly event?: string;
  readonly stopsFor?: string;
  readonly transport: string;
  readonly markerProtocol: string;
  readonly interpretationPolicy: string;
}

export interface ContractDefinition {
  readonly id: string;
  readonly appliesAt: string;
  readonly rules: readonly string[];
  readonly stopConditions: readonly string[];
  readonly requiredOutputs: readonly string[];
}

export interface SurfaceRoute {
  readonly trigger: string;
  readonly surfaces: readonly string[];
  readonly intents: readonly string[];
}

export interface TemplateDefinition {
  readonly id: string;
  readonly path: string;
  readonly content: string;
  readonly description?: string;
}

export interface MethodDefinition {
  readonly id: string;
  readonly label: string;
  readonly resolution: DslResolution;
  readonly taxonomy: Taxonomy;
  readonly lifecycle: readonly LifecycleEvent[];
  readonly workItemLevels: readonly WorkItemLevelDefinition[];
  readonly cadenceProfiles: readonly CadenceProfileDefinition[];
  readonly checkpoints: readonly CheckpointDefinition[];
  readonly contracts: readonly ContractDefinition[];
  readonly policies?: OpaqueMap;
  readonly surfaces: readonly SurfaceDefinition[];
  readonly surfaceRoutes: readonly SurfaceRoute[];
  readonly templates: readonly TemplateDefinition[];
  readonly openQuestions?: OpaqueMap;
}

/** Python's dataclass defaults, for a definition that declares only id/label. */
export function emptyMethodDefinition(id: string, label: string): MethodDefinition {
  return {
    id,
    label,
    resolution: { layers: ["method_default"], conflictPolicy: "explicit_override", audit: true },
    taxonomy: { stateVocabulary: [], levels: [] },
    lifecycle: [],
    workItemLevels: [],
    cadenceProfiles: [],
    checkpoints: [],
    contracts: [],
    surfaces: [],
    surfaceRoutes: [],
    templates: [],
  };
}

/**
 * Python `_require_non_empty`. Note the check is `value.strip()`, so a field of
 * only whitespace is empty — and Python additionally rejects a non-`str`, which
 * TypeScript's types already prevent.
 */
function requireNonEmpty(value: string, fieldName: string): void {
  if (value.trim() === "") {
    throw new MethodDefinitionError(`${fieldName} must not be empty`);
  }
}

/** Python `_require_unique`: also non-empty per value, and it reports the FIRST repeat. */
function requireUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    requireNonEmpty(value, label);
    if (seen.has(value)) {
      throw new MethodDefinitionError(`duplicate ${label}: ${value}`);
    }
    seen.add(value);
  }
}

/** Python `_require_known_choice`: the allowed values are sorted in the message. */
function requireKnownChoice(value: string, allowed: readonly string[], fieldName: string): void {
  requireNonEmpty(value, fieldName);
  if (!allowed.includes(value)) {
    throw new MethodDefinitionError(
      `${fieldName} must be one of ${[...allowed].sort().join(", ")}`,
    );
  }
}

function requireKnownEvent(
  eventId: string,
  lifecycleIds: ReadonlySet<string>,
  owner: string,
): void {
  if (!lifecycleIds.has(eventId)) {
    throw new MethodDefinitionError(`${owner} references unknown lifecycle event ${eventId}`);
  }
}

/** Python `MethodDefinition.lifecycle_ids`. */
export function lifecycleIds(definition: MethodDefinition): Set<string> {
  return new Set(definition.lifecycle.map((event) => event.id));
}

/** Python `validate_method_definition`, in its exact check order. */
export function validateMethodDefinition(definition: MethodDefinition): void {
  requireNonEmpty(definition.id, "method id");
  requireNonEmpty(definition.label, "method label");
  validateResolution(definition.resolution);
  validateTaxonomy(definition.taxonomy);
  validateLifecycle(definition.lifecycle);
  validateWorkItemLevels(definition.workItemLevels);
  validateCadenceProfiles(definition.cadenceProfiles);
  const events = lifecycleIds(definition);
  validateCheckpoints(definition.checkpoints, events);
  validateContracts(definition.contracts, events);
  validateSurfaces(definition.surfaces, events);
  validateSurfaceRoutes(definition.surfaceRoutes, definition.surfaces);
  validateTemplates(definition.templates);
}

function validateResolution(resolution: DslResolution): void {
  if (resolution.layers.length === 0) {
    throw new MethodDefinitionError("dsl resolution must declare at least one layer");
  }
  requireUnique(resolution.layers, "dsl resolution layer");
  for (const layer of resolution.layers) requireNonEmpty(layer, "dsl resolution layer");
  requireNonEmpty(resolution.conflictPolicy, "dsl conflict policy");
}

function validateTaxonomy(taxonomy: Taxonomy): void {
  requireUnique(taxonomy.stateVocabulary, "taxonomy state");
  const levelIds = taxonomy.levels.map((level) => level.id);
  requireUnique(levelIds, "taxonomy level");

  const knownLevels = new Set(levelIds);
  const knownStates = new Set(taxonomy.stateVocabulary);
  for (const level of taxonomy.levels) {
    requireNonEmpty(level.id, "taxonomy level id");
    requireNonEmpty(level.label, `taxonomy level ${level.id} label`);
    requireUnique(level.contains, `taxonomy level ${level.id} child`);
    requireUnique(level.allowedStates, `taxonomy level ${level.id} state`);
    for (const childId of level.contains) {
      if (!knownLevels.has(childId)) {
        throw new MethodDefinitionError(
          `taxonomy level ${level.id} references unknown taxonomy level ${childId}`,
        );
      }
    }
    for (const state of level.allowedStates) {
      // Python guards with `if known_states and ...`, so a definition with an
      // EMPTY state vocabulary allows any state. Reproduced deliberately.
      if (knownStates.size > 0 && !knownStates.has(state)) {
        throw new MethodDefinitionError(
          `taxonomy level ${level.id} allows unknown taxonomy state ${state}`,
        );
      }
    }
    for (const state of Object.keys(level.stateSemantics ?? {})) {
      if (!level.allowedStates.includes(state)) {
        throw new MethodDefinitionError(
          `taxonomy level ${level.id} declares state semantics for disallowed state ${state}`,
        );
      }
    }
  }
}

function validateLifecycle(events: readonly LifecycleEvent[]): void {
  requireUnique(
    events.map((event) => event.id),
    "lifecycle event",
  );
  for (const event of events) {
    requireNonEmpty(event.id, "lifecycle event id");
    requireNonEmpty(event.meaning, `lifecycle event ${event.id} meaning`);
  }
}

function validateWorkItemLevels(levels: readonly WorkItemLevelDefinition[]): void {
  const levelIds = levels.map((level) => level.id);
  requireUnique(levelIds, "work item level");
  const known = new Set(levelIds);
  for (const level of levels) {
    requireNonEmpty(level.id, "work item level id");
    requireNonEmpty(level.label, `work item level ${level.id} label`);
    requireUnique(level.expandsTo, `work item level ${level.id} expansion target`);
    for (const target of level.expandsTo) {
      if (!known.has(target)) {
        throw new MethodDefinitionError(
          `work item level ${level.id} expands to unknown level ${target}`,
        );
      }
    }
  }
}

const PLAN_APPROVAL_POLICIES = ["navigator_approval", "bounded_story_authority"];

function validateCadenceProfiles(profiles: readonly CadenceProfileDefinition[]): void {
  requireUnique(
    profiles.map((profile) => profile.id),
    "cadence profile",
  );
  for (const profile of profiles) {
    requireNonEmpty(profile.id, "cadence profile id");
    requireNonEmpty(profile.label, `cadence profile ${profile.id} label`);
    requireNonEmpty(profile.stopPolicy, `cadence profile ${profile.id} stop policy`);
    if (!PLAN_APPROVAL_POLICIES.includes(profile.planApprovalPolicy)) {
      // Not `requireKnownChoice`: Python writes this message by hand, with no
      // sorted allowed-values list.
      throw new MethodDefinitionError(
        `cadence profile ${profile.id} has unknown plan approval policy ${profile.planApprovalPolicy}`,
      );
    }
  }
}

function validateCheckpoints(
  checkpoints: readonly CheckpointDefinition[],
  events: ReadonlySet<string>,
): void {
  requireUnique(
    checkpoints.map((checkpoint) => checkpoint.id),
    "checkpoint",
  );
  for (const checkpoint of checkpoints) {
    requireNonEmpty(checkpoint.id, "checkpoint id");
    if (checkpoint.occursAfter !== undefined) {
      requireKnownEvent(checkpoint.occursAfter, events, `checkpoint ${checkpoint.id}`);
    }
    for (const eventId of checkpoint.blocks) {
      requireKnownEvent(eventId, events, `checkpoint ${checkpoint.id}`);
    }
  }
}

function validateContracts(
  contracts: readonly ContractDefinition[],
  events: ReadonlySet<string>,
): void {
  requireUnique(
    contracts.map((contract) => contract.id),
    "contract",
  );
  for (const contract of contracts) {
    requireNonEmpty(contract.id, "contract id");
    requireKnownEvent(contract.appliesAt, events, `contract ${contract.id}`);
    requireUnique(contract.rules, `contract ${contract.id} rule`);
    requireUnique(contract.stopConditions, `contract ${contract.id} stop condition`);
    requireUnique(contract.requiredOutputs, `contract ${contract.id} required output`);
  }
}

/** The three pseudo-events a surface may name that are not lifecycle events. */
const SURFACE_PSEUDO_EVENTS = new Set(["adoption", "on_builder_load", "roadmap_inspection"]);

function validateSurfaces(
  surfaces: readonly SurfaceDefinition[],
  events: ReadonlySet<string>,
): void {
  requireUnique(
    surfaces.map((surface) => surface.id),
    "surface",
  );
  for (const surface of surfaces) {
    requireNonEmpty(surface.id, "surface id");
    requireKnownChoice(surface.transport, ["verbatim"], `surface ${surface.id} transport`);
    requireKnownChoice(
      surface.markerProtocol,
      ["ariad_compact"],
      `surface ${surface.id} marker_protocol`,
    );
    requireKnownChoice(
      surface.interpretationPolicy,
      ["after_block_only"],
      `surface ${surface.id} interpretation_policy`,
    );
    if (surface.event !== undefined && SURFACE_PSEUDO_EVENTS.has(surface.event)) continue;
    if (surface.event !== undefined) {
      requireKnownEvent(surface.event, events, `surface ${surface.id}`);
    }
  }
}

function validateSurfaceRoutes(
  routes: readonly SurfaceRoute[],
  surfaces: readonly SurfaceDefinition[],
): void {
  requireUnique(
    routes.map((route) => route.trigger),
    "surface route",
  );
  const surfaceIds = new Set(surfaces.map((surface) => surface.id));
  for (const route of routes) {
    requireNonEmpty(route.trigger, "surface route trigger");
    if (route.surfaces.length === 0) {
      throw new MethodDefinitionError(
        `surface route ${route.trigger} must declare at least one surface`,
      );
    }
    requireUnique(route.surfaces, `surface route ${route.trigger} surface`);
    requireUnique(route.intents, `surface route ${route.trigger} intent`);
    for (const surfaceId of route.surfaces) {
      if (!surfaceIds.has(surfaceId)) {
        throw new MethodDefinitionError(
          `surface route ${route.trigger} references unknown surface ${surfaceId}`,
        );
      }
    }
  }
}

function validateTemplates(templates: readonly TemplateDefinition[]): void {
  requireUnique(
    templates.map((template) => template.id),
    "template",
  );
  requireUnique(
    templates.map((template) => template.path),
    "template path",
  );
  for (const template of templates) {
    requireNonEmpty(template.id, "template id");
    requireNonEmpty(template.path, `template ${template.id} path`);
    requireNonEmpty(template.content, `template ${template.id} content`);
    // Python checks `".." in path.split("/")`, a WHOLE component — so `a..b.md`
    // is legal and only a bare `..` segment is rejected.
    if (template.path.startsWith("/") || template.path.split("/").includes("..")) {
      throw new MethodDefinitionError(
        `template ${template.id} path must be relative and stay inside project root`,
      );
    }
    if (template.description !== undefined) {
      requireNonEmpty(template.description, `template ${template.id} description`);
    }
  }
}
