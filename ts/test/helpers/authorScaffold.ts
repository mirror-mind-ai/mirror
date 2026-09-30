// CR112 — what a Driver does between Plan and approval, for tests that walk the lifecycle.
//
// Since CR112 an approval refuses a plan whose placeholder sections are still the
// scaffold's, and story Done refuses an index that is. A test that walks the lifecycle
// therefore authors the files the way a Driver would: it replaces the body of each
// placeholder section with one line of its own, in place, and leaves the default
// sections -- the contract, the stop conditions, the approval gate -- as written.
//
// One helper, so no test carries its own idea of what "authored" means. The line it
// writes matches no scaffold template and none of the unfilled patterns.

import { readFileSync, writeFileSync } from "node:fs";
import {
  PLAN_SECTIONS,
  type SectionSpec,
  STORY_INDEX_SECTIONS,
} from "#builder/artifacts/scaffoldSections.ts";

function placeholderHeaders(specs: readonly SectionSpec[]): string[] {
  return specs.filter((spec) => spec.kind === "placeholder").map((spec) => spec.header);
}

/** `text` with the body of each named `## ` section replaced by one authored line. */
export function authorSections(text: string, headers: readonly string[]): string {
  const out: string[] = [];
  let replacing = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) {
      const header = line.slice(3).trim();
      replacing = headers.includes(header);
      out.push(line);
      if (replacing) out.push("", `${header}, as the Driver wrote it for this story.`, "");
      continue;
    }
    if (!replacing) out.push(line);
  }
  return out.join("\n");
}

/** Author every placeholder section of the `plan.md` at `path`, in place. */
export function authorPlan(path: string): void {
  writeFileSync(
    path,
    authorSections(readFileSync(path, "utf8"), placeholderHeaders(PLAN_SECTIONS)),
    "utf8",
  );
}

/** Author every placeholder section of the story `index.md` at `path`, in place. */
export function authorStoryIndex(path: string): void {
  writeFileSync(
    path,
    authorSections(readFileSync(path, "utf8"), placeholderHeaders(STORY_INDEX_SECTIONS)),
    "utf8",
  );
}
