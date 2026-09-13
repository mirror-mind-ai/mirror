// CV22.DS7.US8 plateau 1 — the Ariad DSL and its inspection surfaces.
//
// The central assertion is a DEEP EQUALITY of the whole transcribed definition
// against the Python dump, because `ariadMethod.ts` is 640 lines of data and the
// only realistic defect in data is a typo. `inspect-method ariad` cannot catch
// one: it renders a contract's rules as a count, so every rule string is
// invisible in the surface a human would read.
//
// The golden is dumped from Python, so its keys are snake_case while the TS shape
// is camelCase (the `ExplorerStory` convention from US7). The bridge below
// converts key names by rule rather than per field, which is the point: if a TS
// field is named anything other than the camelCase of Python's, the equality
// fails instead of being papered over by a hand-written field map.
//
// It has three exemptions, and they are not cosmetic. Inside `policies`,
// `open_questions`, and `state_semantics` the KEYS are authored content —
// `message_style`, `allowed_after`, `final_dsl_file_format` — which
// `_append_mapping_fields` prints verbatim into the surface. Camelizing them
// would rewrite the DSL and change bytes a Navigator reads, so those subtrees are
// compared exactly as authored.

import assert from "node:assert/strict";
import test from "node:test";

import { getAriadMethod } from "#builder/ariadMethod.ts";
import {
  emptyMethodDefinition,
  type MethodDefinition,
  MethodDefinitionError,
  validateMethodDefinition,
} from "#builder/methodDefinition.ts";
import {
  AVAILABLE_METHODS,
  renderAvailableMethod,
  renderJourneyMethodState,
  renderJourneyWithoutAdoptedMethod,
  renderMethodAdoptionReport,
  renderNoActiveJourney,
} from "#builder/methodInspection.ts";
import golden from "#goldens/builder-method.golden.json" with { type: "json" };

interface ValidationRow {
  name: string;
  expected?: string;
  expected_error?: string;
}

interface SurfaceRow {
  name: string;
  input?: Record<string, unknown>;
  expected: string;
}

const oracle = golden as unknown as {
  available_methods: string[];
  definition: Record<string, unknown>;
  empty_definition: Record<string, unknown>;
  validations: ValidationRow[];
  surfaces: SurfaceRow[];
};

/** Subtrees whose KEYS are authored data, preserved exactly. */
const OPAQUE_KEYS = new Set(["policies", "open_questions", "state_semantics"]);

function camel(name: string): string {
  const [head, ...rest] = name.split("_");
  return (head ?? "") + rest.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join("");
}

/**
 * Convert Python's dump to the TS shape: camelCase field names, `undefined` for
 * absent optionals (Python's `None`), and opaque subtrees left untouched.
 */
function toTsShape(value: unknown, opaque = false): unknown {
  if (Array.isArray(value)) return value.map((item) => toTsShape(item, opaque));
  if (value === null) return undefined;
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const childOpaque = opaque || OPAQUE_KEYS.has(key);
      const outKey = opaque ? key : camel(key);
      const converted = toTsShape(item, childOpaque);
      // Python's dump carries `null` for absent optionals; the TS literal omits
      // the key entirely. Dropping undefined values makes the two comparable
      // without weakening anything — a key present in one and absent in the
      // other with a real value still fails.
      if (converted !== undefined) result[outKey] = converted;
    }
    return result;
  }
  return value;
}

/** Strip `undefined`-valued keys so an omitted optional equals an absent one. */
function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact);
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      result[key] = compact(item);
    }
    return result;
  }
  return value;
}

test("the transcribed Ariad DSL is field-for-field identical to Python's", () => {
  assert.deepEqual(compact(getAriadMethod()), toTsShape(oracle.definition));
});

test("the DSL carries the volume it is supposed to, so equality is not vacuous", () => {
  const method = getAriadMethod();
  assert.equal(method.lifecycle.length, 9);
  assert.equal(method.contracts.length, 9);
  assert.equal(method.surfaces.length, 11);
  assert.equal(method.templates.length, 9);
  assert.equal(method.cadenceProfiles.length, 4);
  assert.equal(method.workItemLevels.length, 3);
  // The rule strings the surface never shows: 37 of them, each one a sentence
  // that only the deep-equality assertion above can protect.
  const ruleCount = method.contracts.reduce((total, contract) => total + contract.rules.length, 0);
  assert.equal(ruleCount, 37);
});

test("template bodies are byte-identical, because prepare-templates writes them to a real repo", () => {
  const templates = getAriadMethod().templates;
  const expected = oracle.definition.templates as { id: string; path: string; content: string }[];
  assert.equal(templates.length, expected.length);
  for (const template of expected) {
    const actual = templates.find((candidate) => candidate.id === template.id);
    assert.ok(actual, `missing template ${template.id}`);
    assert.equal(actual.path, template.path, `${template.id} path`);
    assert.equal(actual.content, template.content, `${template.id} content`);
  }
});

test("policy and open-question keys stay snake_case, because they are rendered verbatim", () => {
  const method = getAriadMethod();
  const history = (method.policies as Record<string, Record<string, Record<string, unknown>>>)
    .history;
  assert.ok("message_style" in history.commit, "camelCasing this would change surface bytes");
  const push = method.policies as Record<string, Record<string, unknown>>;
  assert.ok("allowed_after" in push.push);
  assert.ok("final_dsl_file_format" in (method.openQuestions ?? {}));
});

test("AVAILABLE_METHODS matches Python", () => {
  assert.deepEqual([...AVAILABLE_METHODS], oracle.available_methods);
});

test("validateMethodDefinition accepts the real definition and matches Python's refusals", () => {
  // The mutation matrix is rebuilt here from the same base, one broken invariant
  // per row, and compared to the message Python produced for that row.
  const base = getAriadMethod();
  const mutations = buildMutations(base);
  const covered = new Set(mutations.map(([name]) => name));
  for (const row of oracle.validations) {
    assert.ok(covered.has(row.name), `no TS mutation for golden row ${row.name}`);
  }

  for (const [name, definition] of mutations) {
    const row = oracle.validations.find((candidate) => candidate.name === name);
    assert.ok(row, `golden has no row named ${name}`);
    if (row.expected === "ok") {
      validateMethodDefinition(definition);
      continue;
    }
    assert.throws(
      () => validateMethodDefinition(definition),
      (error: unknown) => {
        assert.ok(error instanceof MethodDefinitionError, name);
        assert.equal(`${error.name}: ${error.message}`, row.expected_error, name);
        return true;
      },
      name,
    );
  }
});

/** The first element, or a failure naming what the DSL was expected to carry. */
function first<T>(items: readonly T[], what: string): T {
  const item = items[0];
  assert.ok(item !== undefined, `the Ariad DSL should declare at least one ${what}`);
  return item;
}

function buildMutations(base: MethodDefinition): [string, MethodDefinition][] {
  const firstEvent = first(base.lifecycle, "lifecycle event");
  const firstLevel = first(base.workItemLevels, "work item level");
  const firstProfile = first(base.cadenceProfiles, "cadence profile");
  const firstCheckpoint = first(base.checkpoints, "checkpoint");
  const firstContract = first(base.contracts, "contract");
  const firstSurface = first(base.surfaces, "surface");
  const firstRoute = first(base.surfaceRoutes, "surface route");
  const firstTemplate = first(base.templates, "template");
  const firstTaxonomyLevel = first(base.taxonomy.levels, "taxonomy level");
  const emptyChoiceSurface = {
    id: "s",
    transport: "verbatim",
    markerProtocol: "ariad_compact",
    interpretationPolicy: "after_block_only",
  };
  const emptyCheckpoint = { id: "c", blocks: [], requiredArtifacts: [], requiredConfirmations: [] };
  const emptyContract = { id: "c", rules: [], stopConditions: [], requiredOutputs: [] };

  return [
    ["valid", base],
    ["empty_id", { ...base, id: "" }],
    ["blank_id", { ...base, id: "   " }],
    ["empty_label", { ...base, label: "" }],
    ["no_resolution_layers", { ...base, resolution: { ...base.resolution, layers: [] } }],
    [
      "duplicate_resolution_layer",
      { ...base, resolution: { ...base.resolution, layers: ["a", "a"] } },
    ],
    ["empty_conflict_policy", { ...base, resolution: { ...base.resolution, conflictPolicy: "" } }],
    [
      "duplicate_taxonomy_state",
      { ...base, taxonomy: { ...base.taxonomy, stateVocabulary: ["s", "s"] } },
    ],
    [
      "duplicate_taxonomy_level",
      { ...base, taxonomy: { ...base.taxonomy, levels: [firstTaxonomyLevel, firstTaxonomyLevel] } },
    ],
    [
      "taxonomy_unknown_child",
      {
        ...base,
        taxonomy: { ...base.taxonomy, levels: [{ ...firstTaxonomyLevel, contains: ["nope"] }] },
      },
    ],
    [
      "taxonomy_unknown_state",
      {
        ...base,
        taxonomy: {
          ...base.taxonomy,
          levels: [{ ...firstTaxonomyLevel, allowedStates: ["nope"] }],
        },
      },
    ],
    [
      "taxonomy_semantics_for_disallowed_state",
      {
        ...base,
        taxonomy: {
          ...base.taxonomy,
          levels: [
            { ...firstTaxonomyLevel, allowedStates: [], stateSemantics: { nope: "meaning" } },
            ...base.taxonomy.levels.slice(1),
          ],
        },
      },
    ],
    [
      "taxonomy_empty_level_label",
      {
        ...base,
        taxonomy: {
          stateVocabulary: [],
          levels: [{ id: "lvl", label: "", contains: [], allowedStates: [] }],
        },
      },
    ],
    ["duplicate_lifecycle_event", { ...base, lifecycle: [firstEvent, firstEvent] }],
    ["empty_lifecycle_meaning", { ...base, lifecycle: [{ id: "e", meaning: "" }] }],
    ["duplicate_work_item_level", { ...base, workItemLevels: [firstLevel, firstLevel] }],
    [
      "work_item_unknown_expansion",
      {
        ...base,
        workItemLevels: [
          { id: "a", label: "A", implementableByDefault: false, expandsTo: ["nope"] },
        ],
      },
    ],
    ["duplicate_cadence_profile", { ...base, cadenceProfiles: [firstProfile, firstProfile] }],
    [
      "empty_stop_policy",
      {
        ...base,
        cadenceProfiles: [
          {
            id: "c",
            label: "C",
            stopPolicy: "",
            active: true,
            planApprovalPolicy: "navigator_approval",
          },
        ],
      },
    ],
    [
      "unknown_plan_approval_policy",
      {
        ...base,
        cadenceProfiles: [
          {
            id: "c",
            label: "C",
            stopPolicy: "stop",
            active: true,
            planApprovalPolicy: "nope",
          },
        ],
      },
    ],
    ["duplicate_checkpoint", { ...base, checkpoints: [firstCheckpoint, firstCheckpoint] }],
    [
      "checkpoint_unknown_occurs_after",
      { ...base, checkpoints: [{ ...emptyCheckpoint, occursAfter: "nope" }] },
    ],
    [
      "checkpoint_unknown_blocks",
      { ...base, checkpoints: [{ ...emptyCheckpoint, blocks: ["nope"] }] },
    ],
    ["duplicate_contract", { ...base, contracts: [firstContract, firstContract] }],
    [
      "contract_unknown_applies_at",
      { ...base, contracts: [{ ...emptyContract, appliesAt: "nope" }] },
    ],
    [
      "contract_duplicate_rule",
      {
        ...base,
        contracts: [{ ...emptyContract, appliesAt: firstEvent.id, rules: ["same", "same"] }],
      },
    ],
    ["duplicate_surface", { ...base, surfaces: [firstSurface, firstSurface] }],
    [
      "surface_unknown_transport",
      { ...base, surfaces: [{ ...emptyChoiceSurface, transport: "raw" }] },
    ],
    [
      "surface_unknown_marker_protocol",
      { ...base, surfaces: [{ ...emptyChoiceSurface, markerProtocol: "nope" }] },
    ],
    [
      "surface_unknown_interpretation_policy",
      { ...base, surfaces: [{ ...emptyChoiceSurface, interpretationPolicy: "nope" }] },
    ],
    ["surface_unknown_event", { ...base, surfaces: [{ ...emptyChoiceSurface, event: "nope" }] }],
    [
      "surface_adoption_pseudo_event",
      { ...base, surfaces: [{ ...emptyChoiceSurface, event: "adoption" }], surfaceRoutes: [] },
    ],
    [
      "surface_on_builder_load_pseudo_event",
      {
        ...base,
        surfaces: [{ ...emptyChoiceSurface, event: "on_builder_load" }],
        surfaceRoutes: [],
      },
    ],
    [
      "surface_roadmap_inspection_pseudo_event",
      {
        ...base,
        surfaces: [{ ...emptyChoiceSurface, event: "roadmap_inspection" }],
        surfaceRoutes: [],
      },
    ],
    ["duplicate_surface_route", { ...base, surfaceRoutes: [firstRoute, firstRoute] }],
    [
      "route_without_surfaces",
      { ...base, surfaceRoutes: [{ trigger: "t", surfaces: [], intents: [] }] },
    ],
    [
      "route_unknown_surface",
      { ...base, surfaceRoutes: [{ trigger: "t", surfaces: ["nope"], intents: [] }] },
    ],
    ["duplicate_template", { ...base, templates: [firstTemplate, firstTemplate] }],
    [
      "duplicate_template_path",
      { ...base, templates: [firstTemplate, { ...firstTemplate, id: "other" }] },
    ],
    [
      "template_absolute_path",
      { ...base, templates: [{ id: "t", path: "/etc/passwd", content: "x" }] },
    ],
    [
      "template_traversal_path",
      { ...base, templates: [{ id: "t", path: "../escape.md", content: "x" }] },
    ],
    [
      "template_nested_traversal_path",
      { ...base, templates: [{ id: "t", path: "docs/../../escape.md", content: "x" }] },
    ],
    [
      "template_dotdot_substring_is_allowed",
      { ...base, templates: [{ id: "t", path: "docs/a..b.md", content: "x" }] },
    ],
    ["template_empty_content", { ...base, templates: [{ id: "t", path: "a.md", content: "" }] }],
    [
      "template_blank_description",
      { ...base, templates: [{ id: "t", path: "a.md", content: "x", description: "   " }] },
    ],
  ];
}

test("a `..` path component is refused but a `..` substring is not", () => {
  // The distinction is `".." in path.split("/")`, and it is worth its own test:
  // rejecting `a..b.md` would be a tighter rule than Python's and would refuse a
  // legitimately named template.
  const base = getAriadMethod();
  assert.throws(() =>
    validateMethodDefinition({
      ...base,
      templates: [{ id: "t", path: "docs/../x.md", content: "x" }],
    }),
  );
  validateMethodDefinition({
    ...base,
    templates: [{ id: "t", path: "docs/a..b.md", content: "x" }],
  });
});

test("an empty state vocabulary allows any state, as Python's guard does", () => {
  // `if known_states and state not in known_states` — the check is skipped
  // entirely when the vocabulary is empty. Tightening it would refuse a
  // definition Python accepts.
  const base = getAriadMethod();
  validateMethodDefinition({
    ...base,
    taxonomy: {
      stateVocabulary: [],
      levels: [{ id: "lvl", label: "L", contains: [], allowedStates: ["anything"] }],
    },
  });
});

test("every inspection surface renders byte-identically to Python", () => {
  for (const row of oracle.surfaces) {
    const actual = renderSurface(row);
    assert.equal(actual, row.expected, row.name);
  }
});

function renderSurface(row: SurfaceRow): string {
  const input = row.input ?? {};
  switch (row.name) {
    case "available_method":
      return renderAvailableMethod(getAriadMethod());
    case "available_method_empty_sections":
      return renderAvailableMethod(emptyMethodDefinition("empty", "Empty method"));
    case "no_active_journey":
      return renderNoActiveJourney();
    case "journey_without_adopted_method":
      return renderJourneyWithoutAdoptedMethod(input.journey as string);
    case "adoption_new_ariad":
    case "adoption_already_ariad":
    case "adoption_new_other":
    case "adoption_already_other":
      return renderMethodAdoptionReport(input.journey as string, input.method as string, {
        alreadyAdopted: input.already_adopted as boolean,
      });
    default:
      return renderJourneyMethodState(
        input.journey as string,
        (input.adopted_method as string | null) ?? null,
      );
  }
}

test("the empty definition renders every section's `none` branch", () => {
  const rendered = renderAvailableMethod(emptyMethodDefinition("empty", "Empty method"));
  const noneCount = rendered.split("\n").filter((line) => line === "none").length;
  // work item levels, cadence profiles, checkpoints, contracts, policies,
  // surfaces, surface routes, templates, open questions.
  assert.equal(noneCount, 9, rendered);
});

test("renderAvailableMethod strips trailing whitespace, unlike its siblings", () => {
  const rendered = renderAvailableMethod(getAriadMethod());
  assert.ok(rendered.endsWith("\n"));
  assert.ok(!rendered.endsWith("\n\n"), "the rstrip must leave exactly one trailing newline");
  // A sibling that does NOT strip, for contrast.
  assert.ok(renderNoActiveJourney().endsWith("build load <journey>\n"));
});

test("an empty-string adopted method falls through to the not-adopted surface", () => {
  // Python tests `if adopted_method:`, not `is not None`.
  assert.equal(renderJourneyMethodState("j", ""), renderJourneyWithoutAdoptedMethod("j"));
});
