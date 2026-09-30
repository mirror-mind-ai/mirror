// CR112 — a scaffold can be told from an authored file, from structure alone.
//
// Every scaffold under test is produced by the real writers, so the reader is graded
// against the bytes Expand and Plan actually write, never against a copy kept here.

import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { getAriadMethod } from "#builder/ariadMethod.ts";
import {
  type PlanArtifactInput,
  renderPlanArtifact,
  renderStoryIndexArtifact,
  renderTestGuideArtifact,
} from "#builder/artifacts/planArtifacts.ts";
import {
  fill,
  fillPlanVocabulary,
  matchesTemplate,
  PLAN_APPROVAL_SECTIONS,
  PLAN_SECTIONS,
  PRODUCT_PLAN,
  SIBLING_NON_GOAL,
  STORY_INDEX_SECTIONS,
  STORY_PLAN_REQUIRED_SECTIONS,
  TEST_GUIDE_SECTIONS,
} from "#builder/artifacts/scaffoldSections.ts";
import {
  artifactState,
  judgeArtifact,
  planSectionsToAuthor,
  unfilledPlanSectionsFor,
} from "#builder/artifacts/scaffoldState.ts";
import { toAuthorLines } from "#builder/artifacts/storyFiles.ts";
import { renderTechnicalStoryIndex, renderUserStoryIndex } from "#builder/artifacts/storyIndex.ts";

const TITLE = "Enter an address, with a comma";
const CODE = "CV1.DS1.US1";

function implementContract() {
  const contract = getAriadMethod().contracts.find((c) => c.id === "implement_contract");
  if (!contract) throw new Error("implement_contract missing from the Ariad method");
  return contract;
}

/** The report the front door builds for `plan-item`: the product vocabulary, siblings named. */
function productReport(overrides: Partial<PlanArtifactInput> = {}): PlanArtifactInput {
  const vocabulary = fillPlanVocabulary(PRODUCT_PLAN, { title: TITLE });
  return {
    activeItem: CODE,
    activeItemTitle: TITLE,
    activeItemLevel: "user_story",
    ...vocabulary,
    nonGoals: [fill(SIBLING_NON_GOAL, { title: "Validate the address" })],
    localRules: [],
    implementContract: implementContract(),
    activeCheckpoint: "after_plan",
    pendingConfirmation: "navigator_approval",
    ...overrides,
  };
}

const PLACEHOLDER_PLAN_SECTIONS = PLAN_SECTIONS.filter((s) => s.kind === "placeholder").map(
  (s) => s.header,
);

describe("matchesTemplate", () => {
  it("a template without a slot matches only itself", () => {
    assert.equal(matchesTemplate("Run automated tests.", "Run automated tests."), true);
    assert.equal(matchesTemplate("Run automated tests", "Run automated tests."), false);
  });

  it("a slot holds anything, including nothing and text with commas", () => {
    const template = "Deliver {title} as an observable slice.";
    assert.equal(
      matchesTemplate("Deliver npm distribution as an observable slice.", template),
      true,
    );
    assert.equal(matchesTemplate(`Deliver ${TITLE} as an observable slice.`, template), true);
    assert.equal(matchesTemplate("Deliver  as an observable slice.", template), true);
    assert.equal(
      matchesTemplate("Deliver npm distribution as an observable slice", template),
      false,
    );
    assert.equal(matchesTemplate("The address form takes a street.", template), false);
  });

  it("a slot at the end, and two slots, keep their fixed text in order", () => {
    assert.equal(
      matchesTemplate("Given the user is ready for X", "Given the user is ready for {title}"),
      true,
    );
    assert.equal(matchesTemplate("I want to X,", "I want to {title},"), true);
    assert.equal(matchesTemplate("I want to X", "I want to {title},"), false);
    assert.equal(matchesTemplate("Pay CV1 — then X", "Pay {title} — then {title}"), true);
    assert.equal(matchesTemplate("Pay CV1 - then X", "Pay {title} — then {title}"), false);
  });
});

describe("the scaffolds the writers produce read as scaffolds", () => {
  it("Expand's User Story index", () => {
    const verdict = judgeArtifact("index.md", renderUserStoryIndex(CODE, TITLE));
    assert.equal(verdict.state, "scaffold");
    assert.deepEqual(verdict.toAuthor, ["User Story", "Outcome", "Acceptance Behavior"]);
  });

  it("Expand's Technical Story index", () => {
    const verdict = judgeArtifact("index.md", renderTechnicalStoryIndex(CODE, TITLE));
    assert.equal(verdict.state, "scaffold");
    assert.deepEqual(verdict.toAuthor, ["Technical Story", "Outcome", "Acceptance Behavior"]);
  });

  it("Plan's index, whose statement is headed Story Statement and whose Outcome is the objective", () => {
    const verdict = judgeArtifact("index.md", renderStoryIndexArtifact(productReport()));
    assert.equal(verdict.state, "scaffold");
    assert.deepEqual(verdict.toAuthor, ["Story Statement", "Outcome", "Acceptance Behavior"]);
  });

  it("Plan's plan.md in the product vocabulary, siblings named", () => {
    const verdict = judgeArtifact("plan.md", renderPlanArtifact(productReport()));
    assert.equal(verdict.state, "scaffold");
    assert.deepEqual(verdict.toAuthor, PLACEHOLDER_PLAN_SECTIONS);
    assert.deepEqual(verdict.toAuthor, [
      "Objective",
      "Scope",
      "Acceptance Behavior",
      "Validation Route",
    ]);
  });

  it("Plan's test guide", () => {
    const verdict = judgeArtifact("test-guide.md", renderTestGuideArtifact(productReport()));
    assert.equal(verdict.state, "scaffold");
    assert.deepEqual(verdict.toAuthor, ["Automated Validation", "Navigator Validation"]);
  });

  it("a Technical Story's plan.md reads the same as a User Story's", () => {
    const verdict = judgeArtifact(
      "plan.md",
      renderPlanArtifact(productReport({ activeItemLevel: "technical_story" })),
    );
    assert.equal(verdict.state, "scaffold");
  });
});

describe("authoring changes the verdict, one section at a time", () => {
  const scaffold = renderPlanArtifact(productReport());

  it("one real line in place of the Scope bullet authors Scope and nothing else", () => {
    const text = scaffold.replace(
      `- Deliver ${TITLE} as an observable slice.`,
      "- The address form takes street, number, and postcode.",
    );
    const verdict = judgeArtifact("plan.md", text);
    assert.equal(verdict.state, "partly_authored");
    assert.deepEqual(verdict.toAuthor, ["Objective", "Acceptance Behavior", "Validation Route"]);
    assert.deepEqual(
      verdict.sections.map((s) => `${s.header}:${s.state}`),
      [
        "Objective:scaffold",
        "Scope:authored",
        "Acceptance Behavior:scaffold",
        "Validation Route:scaffold",
      ],
    );
  });

  it("a real line added beside the template authors the section too: prose is never judged", () => {
    const text = scaffold.replace(
      `- Deliver ${TITLE} as an observable slice.`,
      `- Deliver ${TITLE} as an observable slice.\n- Street, number, and postcode.`,
    );
    assert.equal(judgeArtifact("plan.md", text).sections[1]?.state, "authored");
  });

  it("every placeholder section authored reads authored, with the default sections untouched", () => {
    const text = scaffold
      .replace(
        `Plan the smallest coherent, testable slice for ${TITLE}.`,
        "Take an address at checkout.",
      )
      .replace(`- Deliver ${TITLE} as an observable slice.`, "- The address form.")
      .replace(`Given the starting state needed for ${TITLE}`, "Given a valid address")
      .replace(
        "- Run automated tests that cover the planned behavior.",
        "- Enter 1 Main St; expect it on the page.",
      );
    const verdict = judgeArtifact("plan.md", text);
    assert.equal(verdict.state, "authored");
    assert.deepEqual(verdict.toAuthor, []);
    assert.ok(text.includes("- Do not use git add .; commit only story-scoped files."));
  });

  it("a custom --objective is authored by construction, the rest still scaffold", () => {
    const text = renderPlanArtifact(productReport({ objective: "Take an address at checkout." }));
    const verdict = judgeArtifact("plan.md", text);
    assert.equal(verdict.state, "partly_authored");
    assert.deepEqual(verdict.toAuthor, ["Scope", "Acceptance Behavior", "Validation Route"]);
  });

  it("the verdict does not depend on the title the scaffold was written with", () => {
    const other = renderPlanArtifact(
      productReport({
        activeItemTitle: "Something else entirely",
        ...fillPlanVocabulary(PRODUCT_PLAN, { title: "Something else entirely" }),
      }),
    );
    assert.equal(judgeArtifact("plan.md", other).state, "scaffold");
    assert.equal(judgeArtifact("plan.md", scaffold).state, "scaffold");
  });
});

describe("unfilled is judged before scaffold, and never as authored", () => {
  const scaffold = renderPlanArtifact(productReport());

  it("an emptied section is unfilled", () => {
    const text = scaffold.replace(
      `- Deliver ${TITLE} as an observable slice.\n- Keep the implementation narrow enough to validate at the Plan-defined checkpoint.\n`,
      "",
    );
    const verdict = judgeArtifact("plan.md", text);
    assert.equal(verdict.sections.find((s) => s.header === "Scope")?.state, "unfilled");
    assert.ok(verdict.toAuthor.includes("Scope"));
  });

  it("a TODO or a pending line beside the template is unfilled, not scaffold", () => {
    const todo = scaffold.replace(
      `- Deliver ${TITLE} as an observable slice.`,
      `- Deliver ${TITLE} as an observable slice.\nTODO`,
    );
    assert.equal(judgeArtifact("plan.md", todo).sections[1]?.state, "unfilled");
    const pending = scaffold.replace(
      "Plan the smallest coherent",
      "Pending — plan the smallest coherent",
    );
    assert.equal(judgeArtifact("plan.md", pending).sections[0]?.state, "unfilled");
  });

  it("a plan.md missing a placeholder heading is not authored there", () => {
    const text = scaffold.replace("## Validation Route\n", "## Route\n");
    const verdict = judgeArtifact("plan.md", text);
    assert.equal(verdict.sections.find((s) => s.header === "Validation Route")?.state, "missing");
    assert.ok(verdict.toAuthor.includes("Validation Route"));
  });
});

describe("a file a person wrote is never called a scaffold", () => {
  it("a Driver's plan with none of the required headings is incomplete, every section named", () => {
    const verdict = judgeArtifact(
      "plan.md",
      "# Plan — authored by the Driver\n\nThis body must survive Plan.\n",
    );
    assert.equal(verdict.state, "incomplete");
    // CR111 D4: the list is what approval requires, the two required defaults included.
    assert.deepEqual(verdict.toAuthor, [
      "Objective",
      "Scope",
      "Non-Goals",
      "Acceptance Behavior",
      "Validation Route",
      "Implementation Contract",
    ]);
  });

  it("a plan whose sections all say Pending is incomplete, not scaffold", () => {
    const text = PLAN_SECTIONS.filter((s) => s.kind === "placeholder")
      .map((s) => `## ${s.header}\n\nPending.\n`)
      .join("\n");
    assert.equal(judgeArtifact("plan.md", text).state, "incomplete");
  });

  it("a scaffold with a heading removed is still a scaffold: what remains is Ariad's", () => {
    const text = renderPlanArtifact(productReport()).replace("## Validation Route\n", "## Route\n");
    const verdict = judgeArtifact("plan.md", text);
    assert.equal(verdict.state, "scaffold");
    assert.ok(verdict.toAuthor.includes("Validation Route"));
  });
});

describe("a story index is judged only on the placeholder headings it has", () => {
  const scaffold = renderUserStoryIndex(CODE, TITLE);

  it("edits elsewhere leave the statement, the outcome, and the acceptance block scaffold: US3's case", () => {
    const text = `${scaffold}\n## What US3 Inherits\n\nTwelve items, in [inherited.md](inherited.md).\n`;
    const verdict = judgeArtifact("index.md", text);
    assert.equal(verdict.state, "scaffold");
    assert.deepEqual(verdict.toAuthor, ["User Story", "Outcome", "Acceptance Behavior"]);
  });

  it("an authored outcome with the template statement is partly authored, the statement named", () => {
    const text = scaffold.replace(
      `Navigator can validate ${TITLE} as an observable behavior.`,
      "The order carries the address the user typed.",
    );
    const verdict = judgeArtifact("index.md", text);
    assert.equal(verdict.state, "partly_authored");
    assert.deepEqual(verdict.toAuthor, ["User Story", "Acceptance Behavior"]);
  });

  it("an index in the Driver's own structure, with none of the placeholder headings, is authored", () => {
    const text =
      "[< Parent](../index.md)\n\n# CV1.DS1.US1 — Enter an address\n\n## Why\n\nBecause.\n\n## Done Condition\n\nIt works.\n";
    const verdict = judgeArtifact("index.md", text);
    assert.equal(verdict.state, "authored");
    assert.deepEqual(verdict.sections, []);
  });
});

describe("reading from disk, and the two plan-section rules", () => {
  let directory: string;
  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it("a missing file is missing", () => {
    directory = mkdtempSync(join(tmpdir(), "cr112-"));
    assert.equal(artifactState("plan.md", join(directory, "plan.md")).state, "missing");
    assert.deepEqual(
      unfilledPlanSectionsFor(join(directory, "plan.md"), STORY_PLAN_REQUIRED_SECTIONS),
      [...STORY_PLAN_REQUIRED_SECTIONS],
    );
    assert.deepEqual(unfilledPlanSectionsFor(null, ["Scope"]), ["Scope"]);
  });

  it("unfilledPlanSectionsFor keeps its rule: a scaffold is filled, an emptied section is not", () => {
    directory = mkdtempSync(join(tmpdir(), "cr112-"));
    const path = join(directory, "plan.md");
    writeFileSync(path, renderPlanArtifact(productReport()), "utf8");
    assert.deepEqual(unfilledPlanSectionsFor(path, STORY_PLAN_REQUIRED_SECTIONS), []);
    writeFileSync(
      path,
      renderPlanArtifact(productReport()).replace(
        `- Deliver ${TITLE} as an observable slice.\n- Keep the implementation narrow enough to validate at the Plan-defined checkpoint.\n`,
        "",
      ),
      "utf8",
    );
    assert.deepEqual(unfilledPlanSectionsFor(path, STORY_PLAN_REQUIRED_SECTIONS), ["Scope"]);
  });

  it("planSectionsToAuthor counts the scaffold's own sentences, and holds a default section to the unfilled rule only", () => {
    directory = mkdtempSync(join(tmpdir(), "cr112-"));
    const path = join(directory, "plan.md");
    writeFileSync(path, renderPlanArtifact(productReport()), "utf8");
    assert.deepEqual(planSectionsToAuthor(path), [
      "Objective",
      "Scope",
      "Acceptance Behavior",
      "Validation Route",
    ]);
  });

  it("with no file, or no project, every section approval requires is still to write", () => {
    directory = mkdtempSync(join(tmpdir(), "cr111-"));
    assert.deepEqual(planSectionsToAuthor(join(directory, "plan.md")), [...PLAN_APPROVAL_SECTIONS]);
    assert.deepEqual(planSectionsToAuthor(null), [...PLAN_APPROVAL_SECTIONS]);
  });
});

// CR111 D4 -- `build show` said `authored` over an approval that refused, because it
// judged the placeholder sections only while approval also requires Non-Goals and the
// Implementation Contract. Two populations: the WORD comes from the placeholder
// sections alone; the LIST is everything approval would refuse, in the file's order.
describe("one answer to what plan.md still needs (CR111 D4)", () => {
  let directory: string;
  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  const scaffold = renderPlanArtifact(productReport());
  const withoutDefaults = (text: string) =>
    text.replace(/## Non-Goals\n\n[^#]*/u, "").replace(/## Implementation Contract\n\n[^#]*/u, "");
  const authoredPlaceholders = (text: string) =>
    text
      .replace(
        `Plan the smallest coherent, testable slice for ${TITLE}.`,
        "Take an address at checkout.",
      )
      .replace(`- Deliver ${TITLE} as an observable slice.`, "- The address form.")
      .replace(`Given the starting state needed for ${TITLE}`, "Given a valid address")
      .replace(
        "- Run automated tests that cover the planned behavior.",
        "- Enter 1 Main St; expect it on the page.",
      );

  it("the placeholder sections authored and the required defaults gone: partly authored, both named", () => {
    const verdict = judgeArtifact("plan.md", withoutDefaults(authoredPlaceholders(scaffold)));
    assert.equal(verdict.state, "partly_authored");
    assert.deepEqual(verdict.toAuthor, ["Non-Goals", "Implementation Contract"]);
  });

  it("an untouched scaffold still reads scaffold: its filled defaults do not count toward the word", () => {
    const verdict = judgeArtifact("plan.md", scaffold);
    assert.equal(verdict.state, "scaffold");
    assert.deepEqual(verdict.toAuthor, PLACEHOLDER_PLAN_SECTIONS);
  });

  it("a scaffold whose Non-Goals were emptied is still a scaffold, with Non-Goals listed in the file's order", () => {
    const verdict = judgeArtifact(
      "plan.md",
      scaffold.replace(/## Non-Goals\n\n[^#]*/u, "## Non-Goals\n\n"),
    );
    assert.equal(verdict.state, "scaffold");
    assert.deepEqual(verdict.toAuthor, [
      "Objective",
      "Scope",
      "Non-Goals",
      "Acceptance Behavior",
      "Validation Route",
    ]);
  });

  it("the word is decided by the placeholder sections alone: the verdict's sections are those four", () => {
    const verdict = judgeArtifact("plan.md", withoutDefaults(scaffold));
    assert.deepEqual(
      verdict.sections.map((section) => section.header),
      PLACEHOLDER_PLAN_SECTIONS,
    );
  });

  it("approval's list is the verdict's list, for every state a plan can be in", () => {
    directory = mkdtempSync(join(tmpdir(), "cr111-"));
    const path = join(directory, "plan.md");
    const texts = [
      scaffold,
      authoredPlaceholders(scaffold),
      withoutDefaults(scaffold),
      withoutDefaults(authoredPlaceholders(scaffold)),
      scaffold.replace(`- Deliver ${TITLE} as an observable slice.`, "- The address form."),
      "# Plan — authored by the Driver\n\nThis body must survive Plan.\n",
    ];
    for (const text of texts) {
      writeFileSync(path, text, "utf8");
      assert.deepEqual(planSectionsToAuthor(path), judgeArtifact("plan.md", text).toAuthor);
    }
  });
});

describe("the sections to write read as the file has them (CR112 handoff review)", () => {
  const rows = (headers: readonly string[]) =>
    toAuthorLines(headers).map((line) => line.replace(/^│ /u, "").replace(/ +│$/u, ""));

  it("a list that wraps breaks between headings, never inside one, and continues under the first", () => {
    assert.deepEqual(rows(["Automated Validation", "Navigator Validation"]), [
      "  to author: Automated Validation,",
      "             Navigator Validation",
    ]);
    assert.deepEqual(rows(["Objective", "Scope", "Acceptance Behavior", "Validation Route"]), [
      "  to author: Objective, Scope, Acceptance Behavior,",
      "             Validation Route",
    ]);
    assert.deepEqual(rows(["User Story", "Outcome", "Acceptance Behavior"]), [
      "  to author: User Story, Outcome, Acceptance Behavior",
    ]);
    assert.deepEqual(rows([]), []);
  });

  it("every row fits the card, for every heading the tables hold", () => {
    const headers = [...PLAN_SECTIONS, ...STORY_INDEX_SECTIONS, ...TEST_GUIDE_SECTIONS].map(
      (s) => s.header,
    );
    for (const line of toAuthorLines(headers)) assert.equal([...line].length, 58, line);
  });

  it("an approval lists its sections in the plan file's order", () => {
    const order = PLAN_SECTIONS.map((s) => s.header);
    const positions = PLAN_APPROVAL_SECTIONS.map((header) => order.indexOf(header));
    assert.deepEqual(
      positions,
      [...positions].sort((a, b) => a - b),
    );
    assert.deepEqual(PLAN_APPROVAL_SECTIONS, [
      "Objective",
      "Scope",
      "Non-Goals",
      "Acceptance Behavior",
      "Validation Route",
      "Implementation Contract",
    ]);
  });
});
