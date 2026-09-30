// CR112 — reading a story-package artifact back and saying what it is.
//
// Plan and Expand write scaffolds where no file exists and never touch a file that
// does (CR079). Until CR112 that was the whole story: `build show` said present or
// missing, and no approval read a file, so a scaffold nobody had authored was
// approvable on both story routes. This module answers the question the surfaces
// and the approvals need: is this file still the scaffold, and which of its sections
// are still waiting to be written?
//
// The verdict is structural, never a judgement of prose. A section is
//
//   * `missing`   -- the file, or the `## ` heading, is not there;
//   * `unfilled`  -- empty, or holding a line that starts with `pending`, is a
//                    throwaway token, or matches the placeholder pattern: the rule
//                    `unfilledPlanSectionsFor` has always applied;
//   * `scaffold`  -- every non-blank line is one the scaffold would write under this
//                    heading, with the `{title}`/`{code}` slots wildcarded;
//   * `authored`  -- anything else. One real line under a heading is authored.
//
// `unfilled` is judged before `scaffold`, so a section that holds a `TODO` beside the
// template is unfilled, not scaffold, and either way not authored.
//
// Only `placeholder` sections decide the file. A `default` section is a rule the
// Driver may keep verbatim. For `plan.md` every placeholder heading is required and a
// missing one counts against the file, as the Plan contract has always required; for
// `index.md` and `test-guide.md` a missing heading is the Driver's structure, not a
// scaffold, and only sections that are present and still the scaffold's count.
//
// The file's word follows its judged sections: `authored` when all are, `partly
// authored` when some are, `scaffold` when none is and the file still carries the
// scaffold's text, and `incomplete` when none is and none of it is the scaffold's --
// a file a person wrote without the sections the contract requires. Calling that
// file a scaffold would say Ariad wrote what it did not.

import { existsSync, readFileSync } from "node:fs";
import { pySplitLines, pyStrip } from "#util/pythonText.ts";
import {
  matchesTemplate,
  PLAN_SECTIONS,
  type SectionSpec,
  STORY_INDEX_SECTIONS,
  TEST_GUIDE_SECTIONS,
} from "./scaffoldSections.ts";

export type SectionState = "missing" | "unfilled" | "scaffold" | "authored";
export type ArtifactState = "missing" | "scaffold" | "incomplete" | "partly_authored" | "authored";
export type ArtifactName = "index.md" | "plan.md" | "test-guide.md";

/** The state word a surface prints beside an artifact's name. */
export function describeArtifactState(state: ArtifactState): string {
  return state === "partly_authored" ? "partly authored" : state;
}

export interface SectionVerdict {
  readonly header: string;
  readonly state: SectionState;
}

export interface ArtifactVerdict {
  readonly name: ArtifactName;
  readonly state: ArtifactState;
  /** Every placeholder section the reader judged, in the artifact's own order. */
  readonly sections: readonly SectionVerdict[];
  /** The placeholder sections still to be written, by their exact `## ` text. */
  readonly toAuthor: readonly string[];
}

/**
 * Python `_PLACEHOLDER_LINE_RE`.
 *
 * `^(?:[-*]\s+)?(?:this (?:section )?is (?:a )?)?placeholder(?:\b|$)`, case
 * insensitive. `\s` is Python's, which matches more than JavaScript's — but this
 * pattern's `\s+` sits between an ASCII bullet and the word, where the two agree.
 * The `\b` alternative is what keeps "placeholder story" a placeholder while
 * "placeholders" is not; and the whole point is that it anchors at the START, so
 * "Do not implement the sibling Payment placeholder story" is product vocabulary,
 * not an unfilled section.
 */
export const PLACEHOLDER_LINE_RE =
  /^(?:[-*]\s+)?(?:this (?:section )?is (?:a )?)?placeholder(?:\b|$)/i;

const THROWAWAY = new Set(["todo", "tbd", "...", "n/a", "none"]);

/**
 * Python `_level_two_sections`.
 *
 * `setdefault` means a REPEATED `## Scope` heading appends to the first section
 * rather than replacing it, so a Plan with two Scope headings is complete if either
 * carries content.
 */
export function levelTwoSections(text: string): Map<string, string> {
  const sections = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of pySplitLines(text)) {
    if (line.startsWith("## ")) {
      current = pyStrip(line.slice(3));
      if (!sections.has(current)) sections.set(current, []);
    } else if (current !== null) {
      sections.get(current)?.push(line);
    }
  }
  const joined = new Map<string, string>();
  for (const [header, lines] of sections) joined.set(header, lines.join("\n"));
  return joined;
}

/** The rule `unfilledPlanSectionsFor` has always applied to a section's body. */
export function isUnfilledBody(body: string): boolean {
  const stripped = pyStrip(body);
  if (!stripped) return true;
  const lines = pySplitLines(stripped)
    .map((line) => pyStrip(line).toLowerCase())
    .filter((line) => line !== "");
  return (
    lines.some((line) => line.startsWith("pending")) ||
    lines.some((line) => THROWAWAY.has(line)) ||
    lines.some((line) => PLACEHOLDER_LINE_RE.test(line))
  );
}

/** True when every non-blank line of `body` is a line the scaffold writes for `spec`. */
export function isScaffoldBody(body: string, spec: SectionSpec): boolean {
  const lines = pySplitLines(body)
    .map((line) => pyStrip(line))
    .filter((line) => line !== "");
  if (lines.length === 0) return false;
  return lines.every((line) => spec.lines.some((template) => matchesTemplate(line, template)));
}

/** The state of one section, given the file's sections. */
export function sectionState(sections: Map<string, string>, spec: SectionSpec): SectionState {
  const body = sections.get(spec.header);
  if (body === undefined) return "missing";
  if (isUnfilledBody(body)) return "unfilled";
  if (isScaffoldBody(body, spec)) return "scaffold";
  return "authored";
}

const SPECS: Readonly<Record<ArtifactName, readonly SectionSpec[]>> = {
  "index.md": STORY_INDEX_SECTIONS,
  "plan.md": PLAN_SECTIONS,
  "test-guide.md": TEST_GUIDE_SECTIONS,
};

/**
 * Which placeholder sections decide `name`. `plan.md` requires every one of its
 * placeholder headings; the other two judge only the placeholder headings the file
 * has, so a Driver's own structure is never called a scaffold.
 */
function judgedSections(name: ArtifactName, sections: Map<string, string>): SectionSpec[] {
  const placeholders = SPECS[name].filter((spec) => spec.kind === "placeholder");
  if (name === "plan.md") return placeholders;
  return placeholders.filter((spec) => sections.has(spec.header));
}

/** The verdict for artifact text already read; `null` text means the file is missing. */
export function judgeArtifact(name: ArtifactName, text: string | null): ArtifactVerdict {
  if (text === null) return { name, state: "missing", sections: [], toAuthor: [] };
  const sections = levelTwoSections(text);
  const verdicts = judgedSections(name, sections).map((spec) => ({
    header: spec.header,
    state: sectionState(sections, spec),
  }));
  const toAuthor = verdicts
    .filter((verdict) => verdict.state !== "authored")
    .map((verdict) => verdict.header);
  const authored = verdicts.length - toAuthor.length;
  const state: ArtifactState =
    authored === verdicts.length
      ? "authored"
      : authored > 0
        ? "partly_authored"
        : verdicts.some((verdict) => verdict.state === "scaffold")
          ? "scaffold"
          : "incomplete";
  return { name, state, sections: verdicts, toAuthor };
}

/** The verdict for the artifact at `path`. */
export function artifactState(name: ArtifactName, path: string): ArtifactVerdict {
  if (!existsSync(path)) return judgeArtifact(name, null);
  return judgeArtifact(name, readFileSync(path, "utf8"));
}

/**
 * Python `unfilled_plan_sections_for`: structure only, never prose judgement.
 *
 * An absent file means EVERY section is unfilled, which is what makes a receipt
 * unusable before the Driver writes the Plan. A section counts as unfilled when it
 * is empty, or when any of its non-blank lines starts with `pending`, is exactly
 * one of the throwaway tokens, or matches the placeholder pattern at line start.
 * A section still holding the scaffold's own sentences is NOT unfilled by this
 * rule; `unauthoredPlanSectionsFor` is the rule that counts it.
 */
export function unfilledPlanSectionsFor(
  planPath: string | null,
  requiredSections: readonly string[],
): string[] {
  if (planPath === null || !existsSync(planPath)) return [...requiredSections];
  const sections = levelTwoSections(readFileSync(planPath, "utf8"));
  return requiredSections.filter((header) => isUnfilledBody(sections.get(header) ?? ""));
}

/**
 * The sections of `plan.md` a Plan approval must see authored: every one in
 * `requiredSections` that is missing, unfilled, or still the scaffold's. Judged with
 * `PLAN_SECTIONS`, so a required heading the table calls `default` is held to the
 * unfilled rule only.
 */
export function unauthoredPlanSectionsFor(
  planPath: string | null,
  requiredSections: readonly string[],
): string[] {
  const judged = [...new Set(requiredSections)];
  if (planPath === null || !existsSync(planPath)) return judged;
  const sections = levelTwoSections(readFileSync(planPath, "utf8"));
  return judged.filter((header) => {
    const spec = PLAN_SECTIONS.find((candidate) => candidate.header === header) ?? {
      header,
      kind: "default" as const,
      lines: [],
    };
    return sectionState(sections, spec) !== "authored";
  });
}
