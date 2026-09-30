// CR112 — the one home of every sentence a story scaffold carries.
//
// Expand writes a child story's `index.md`; Plan writes `index.md`, `plan.md`, and
// `test-guide.md`. Until CR112 the sentences those files carry lived where each
// writer happened to compose them: the statement and outcome in `storyIndex.ts`,
// the Plan context in `commands.ts`, and a second set of Plan defaults in `plan.ts`,
// reached only when a caller passed no sections. Nothing could read a file back and
// say whether it was still the scaffold, because nothing held the scaffold's lines in
// a form a reader could compare against.
//
// This module holds them as TEMPLATES: fixed text with a `{title}` slot.
// The writers fill them (`fill`) and produce the same bytes they always did; the
// reader (`scaffoldState.ts`) matches a file's lines against them with the slots
// wildcarded (`matchesTemplate`), so the check reads nothing but the file and this
// module -- not the cursor's title, which a re-pull can change, and not the roadmap.
//
// Every section also carries a KIND. A `placeholder` section is where the scaffold
// stands in for content the Driver must write. A `default` section is a rule or a
// default that may legitimately stand as written: keeping "Do not use git add ."
// verbatim leaves no placeholder behind; keeping "Deliver X as an observable slice"
// does.
//
// Two Plan vocabularies exist and both are recorded here, each once. `PRODUCT` is
// what the front door writes (`roadmapPlanContext`); `LIBRARY` is what
// `planLifecycleItem` writes when called with no sections, which only the recorded
// corpus and tests do. CR112 keeps both so that no recorded byte moves; retiring the
// library vocabulary is handed to CR111, which edits those surfaces anyway.

export type SectionKind = "placeholder" | "default";

/** A `## ` section of a scaffold: its heading, its kind, and the template lines it may hold. */
export interface SectionSpec {
  readonly header: string;
  readonly kind: SectionKind;
  /** Template lines a scaffold writes under this heading; empty for a `default` section. */
  readonly lines: readonly string[];
}

/** The slot a template may carry: the item's title, the one thing a scaffold varies by. */
export interface SlotValues {
  readonly title?: string;
}

const SLOT_RE = /\{(title)\}/g;

/** Fill a template's slots. A slot with no value is left as written. */
export function fill(template: string, values: SlotValues): string {
  return template.replace(SLOT_RE, (whole) => values.title ?? whole);
}

/**
 * True when `line` is `template` with anything in its slots: the fixed text before,
 * between, and after the slots must appear in order, at the ends where the template
 * has them. A template with no slot matches only itself.
 */
export function matchesTemplate(line: string, template: string): boolean {
  const parts = template.split(SLOT_RE).filter((_, index) => index % 2 === 0);
  if (parts.length === 1) return line === template;
  const first = parts[0] as string;
  const last = parts[parts.length - 1] as string;
  if (!line.startsWith(first) || !line.endsWith(last)) return false;
  if (line.length < first.length + last.length) return false;
  let cursor = first.length;
  const end = line.length - last.length;
  for (const part of parts.slice(1, -1)) {
    const at = line.indexOf(part, cursor);
    if (at === -1 || at + part.length > end) return false;
    cursor = at + part.length;
  }
  return true;
}

// --- the statement and outcome templates (Expand's `index.md`, and Plan's) ---

/** Python `_user_story_statement`, as a template. */
export const USER_STORY_STATEMENT: readonly string[] = [
  "As a user,",
  "I want to {title},",
  "So that I can receive the value of this story.",
];

/** Python `_technical_story_statement`, as a template. */
export const TECHNICAL_STORY_STATEMENT: readonly string[] = [
  "In order to support the delivery capability,",
  "As an engineering team/system component,",
  "I want to {title},",
  "So that the expected technical outcome is available.",
];

/** Python `_user_story_outcome`, as a template. */
export const STORY_OUTCOME = "Navigator can validate {title} as an observable behavior.";

/** The acceptance block Expand writes for a User Story. */
export const USER_STORY_ACCEPTANCE: readonly string[] = [
  "Given the user is ready for {title}",
  "When the user performs the planned action",
  "Then the expected observable behavior is visible",
  "And unrelated Delivery Story scope remains untouched",
];

/** The acceptance block Expand writes for a Technical Story. */
export const TECHNICAL_STORY_ACCEPTANCE: readonly string[] = [
  "Given the system is ready for {title}",
  "When the planned technical change is applied",
  "Then the expected technical outcome is observable",
  "And unrelated Delivery Story scope remains untouched",
];

// --- the Plan vocabularies ---

/** The sentences a Plan scaffold carries, before its slots are filled. */
export interface PlanVocabulary {
  readonly objective: string;
  readonly scope: readonly string[];
  readonly nonGoals: readonly string[];
  readonly acceptanceBehavior: readonly string[];
  readonly validationRoute: readonly string[];
  readonly e2eDecision: string;
}

/** What the front door writes: Python `cmd_plan_item`'s roadmap context. */
export const PRODUCT_PLAN: PlanVocabulary = {
  objective: "Plan the smallest coherent, testable slice for {title}.",
  scope: [
    "Deliver {title} as an observable slice.",
    "Keep the implementation narrow enough to validate at the Plan-defined checkpoint.",
  ],
  nonGoals: ["Do not silently absorb adjacent roadmap work."],
  acceptanceBehavior: [
    "Given the starting state needed for {title}",
    "When the Navigator exercises {title}",
    "Then the planned observable behavior is visible",
    "And out-of-scope sibling roadmap items remain untouched",
  ],
  validationRoute: [
    "Run automated tests that cover the planned behavior.",
    "Provide a Navigator-visible route with expected observation, pass condition, and fail condition.",
  ],
  e2eDecision:
    "required unless Navigator explicitly accepts a narrower fixture-level validation route",
};

/** The Non-Goals line the front door writes for each sibling roadmap item. */
export const SIBLING_NON_GOAL = "Do not implement sibling roadmap item: {title}.";

/**
 * What `planLifecycleItem` writes when a caller passes no sections: Python
 * `plan_lifecycle_item`'s defaults. No product path reaches these; the recorded
 * corpus and the tests do.
 */
export const LIBRARY_PLAN: PlanVocabulary = {
  objective: "Confirm scope, validation route, and implementation contract.",
  scope: ["Implement the smallest coherent slice for the active item."],
  nonGoals: ["Do not silently absorb adjacent roadmap work."],
  acceptanceBehavior: [
    "Given the relevant starting state",
    "When the Navigator exercises the planned behavior",
    "Then the expected observable outcome appears",
    "And important constraints still hold",
  ],
  validationRoute: [
    "Run automated checks required by the local guide.",
    "Provide a Navigator-visible validation route with expected observation and pass/fail condition.",
  ],
  e2eDecision: "Decide explicitly before implementation whether E2E is required.",
};

/** A vocabulary with its slots filled for one item. */
export function fillPlanVocabulary(vocabulary: PlanVocabulary, values: SlotValues): PlanVocabulary {
  const fillAll = (lines: readonly string[]): string[] => lines.map((line) => fill(line, values));
  return {
    objective: fill(vocabulary.objective, values),
    scope: fillAll(vocabulary.scope),
    nonGoals: fillAll(vocabulary.nonGoals),
    acceptanceBehavior: fillAll(vocabulary.acceptanceBehavior),
    validationRoute: fillAll(vocabulary.validationRoute),
    e2eDecision: fill(vocabulary.e2eDecision, values),
  };
}

/** The sentence a test guide's Navigator Validation section holds until it is authored. */
export const NAVIGATOR_VALIDATION_GUIDANCE =
  "Provide the Navigator-visible route with expected observation, pass condition, and fail condition before the story can pass Validation.";

/** The sentence a test guide's Validation Evidence section holds until validation. */
export const VALIDATION_EVIDENCE_PENDING = "Pending implementation and validation.";

// --- the section tables, one per artifact ---

const FENCE_OPEN = "```text";
const FENCE_CLOSE = "```";

function bullets(lines: readonly string[]): string[] {
  return lines.map((line) => `- ${line}`);
}

const PLAN_VOCABULARIES: readonly PlanVocabulary[] = [PRODUCT_PLAN, LIBRARY_PLAN];

/** The sections of `plan.md`, in the order Plan writes them. */
export const PLAN_SECTIONS: readonly SectionSpec[] = [
  {
    header: "Objective",
    kind: "placeholder",
    lines: PLAN_VOCABULARIES.map((vocabulary) => vocabulary.objective),
  },
  {
    header: "Scope",
    kind: "placeholder",
    lines: PLAN_VOCABULARIES.flatMap((vocabulary) => bullets(vocabulary.scope)),
  },
  { header: "Non-Goals", kind: "default", lines: [] },
  {
    header: "Acceptance Behavior",
    kind: "placeholder",
    lines: [
      FENCE_OPEN,
      ...PLAN_VOCABULARIES.flatMap((vocabulary) => vocabulary.acceptanceBehavior),
      FENCE_CLOSE,
    ],
  },
  {
    header: "Validation Route",
    kind: "placeholder",
    lines: [
      ...PLAN_VOCABULARIES.flatMap((vocabulary) => bullets(vocabulary.validationRoute)),
      ...PLAN_VOCABULARIES.map((vocabulary) => `E2E decision: ${vocabulary.e2eDecision}`),
    ],
  },
  { header: "Implementation Contract", kind: "default", lines: [] },
  { header: "Stop Conditions", kind: "default", lines: [] },
  { header: "Approval Gate", kind: "default", lines: [] },
];

/** Python `STORY_PLAN_REQUIRED_SECTIONS`, in declaration order: the Plan contract's headings. */
export const STORY_PLAN_REQUIRED_SECTIONS = [
  "Scope",
  "Non-Goals",
  "Acceptance Behavior",
  "Validation Route",
  "Implementation Contract",
] as const;

/**
 * The sections a Plan approval requires authored, on either route (CR112): every
 * placeholder section of the story scaffold and every section the Plan contract
 * requires, in the order the plan file has them, so a refusal lists them as the reader
 * will find them. A placeholder section counts until it is authored; a required
 * `default` section counts until it is not empty or pending.
 *
 * One list for every surface that says what a `plan.md` still needs: both approval
 * routes, `build show`, and the Plan checkpoint read it through `scaffoldState.ts`
 * (CR111 D4). It lives here, with the sections it names, so the reader below the
 * approval layer can use it without depending on that layer.
 */
export const PLAN_APPROVAL_SECTIONS: readonly string[] = [
  ...PLAN_SECTIONS.filter(
    (section) =>
      section.kind === "placeholder" ||
      (STORY_PLAN_REQUIRED_SECTIONS as readonly string[]).includes(section.header),
  ).map((section) => section.header),
  ...STORY_PLAN_REQUIRED_SECTIONS.filter(
    (header) => !PLAN_SECTIONS.some((section) => section.header === header),
  ),
];

/**
 * The sections of a story `index.md`. Expand's scaffold heads the statement
 * `## User Story` or `## Technical Story`; Plan's heads it `## Story Statement` and
 * puts the objective under `## Outcome`. A file carries one of the three statement
 * headings; the reader judges whichever it finds.
 */
export const STORY_INDEX_SECTIONS: readonly SectionSpec[] = [
  { header: "User Story", kind: "placeholder", lines: USER_STORY_STATEMENT },
  { header: "Technical Story", kind: "placeholder", lines: TECHNICAL_STORY_STATEMENT },
  {
    header: "Story Statement",
    kind: "placeholder",
    lines: [...USER_STORY_STATEMENT, ...TECHNICAL_STORY_STATEMENT],
  },
  {
    header: "Outcome",
    kind: "placeholder",
    lines: [STORY_OUTCOME, ...PLAN_VOCABULARIES.map((vocabulary) => vocabulary.objective)],
  },
  {
    header: "Acceptance Behavior",
    kind: "placeholder",
    lines: [
      FENCE_OPEN,
      ...USER_STORY_ACCEPTANCE,
      ...TECHNICAL_STORY_ACCEPTANCE,
      ...PLAN_VOCABULARIES.flatMap((vocabulary) => vocabulary.acceptanceBehavior),
      FENCE_CLOSE,
    ],
  },
  { header: "Scope", kind: "default", lines: [] },
  { header: "Out Of Scope", kind: "default", lines: [] },
  { header: "Validation", kind: "default", lines: [] },
  { header: "Artifacts", kind: "default", lines: [] },
];

/** The sections of `test-guide.md`, in the order Plan writes them. */
export const TEST_GUIDE_SECTIONS: readonly SectionSpec[] = [
  {
    header: "Automated Validation",
    kind: "placeholder",
    lines: PLAN_VOCABULARIES.flatMap((vocabulary) => bullets(vocabulary.validationRoute)),
  },
  { header: "E2E Decision", kind: "default", lines: [] },
  { header: "Navigator Validation", kind: "placeholder", lines: [NAVIGATOR_VALIDATION_GUIDANCE] },
  { header: "Validation Evidence", kind: "default", lines: [] },
];
