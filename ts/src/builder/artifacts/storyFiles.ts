// CR111 — the Plan-stage story files, judged and rendered once for every surface that
// names them.
//
// `build show` lists a story package's `index.md`, `plan.md`, and `test-guide.md`, each
// with its state and, while it is not authored, the sections still to write (CR112).
// The Plan checkpoint names the same three files the same way. Both import these lines
// from here, so the two surfaces cannot say different things about one file: the card
// does not reach into `build show`'s module, and neither keeps its own copy.
//
// The glyph carries only done or not; the word carries the state.

import { join } from "node:path";
import { CARD_WIDTH, cardText } from "../card.ts";
import { type ArtifactVerdict, artifactState, describeArtifactState } from "./scaffoldState.ts";

/** The artifacts Plan and Expand scaffold, in the order Plan writes them. */
export const PLAN_STAGE_ARTIFACTS = ["index.md", "plan.md", "test-guide.md"] as const;

/** The Plan-stage files of the package at `directory`, judged, in `PLAN_STAGE_ARTIFACTS` order. */
export function judgeStoryFiles(directory: string): ArtifactVerdict[] {
  return PLAN_STAGE_ARTIFACTS.map((name) => artifactState(name, join(directory, name)));
}

const TO_AUTHOR = "to author: ";
const TO_AUTHOR_INDENT = "  ";

/**
 * The sections still to write, wrapped BETWEEN headings, never inside one, with every
 * row after the first starting under the first heading. A heading cut in two reads as
 * two items: the first render printed `Navigator` over `Validation` (CR112's handoff
 * review). The headings are the scaffold tables' own, all far shorter than a row.
 */
export function toAuthorLines(headers: readonly string[]): string[] {
  const width = CARD_WIDTH - TO_AUTHOR_INDENT.length - TO_AUTHOR.length;
  const rows: string[] = [];
  let row = "";
  headers.forEach((header, index) => {
    const item = index < headers.length - 1 ? `${header},` : header;
    const joined = row === "" ? item : `${row} ${item}`;
    if (row !== "" && joined.length > width) {
      rows.push(row);
      row = item;
    } else {
      row = joined;
    }
  });
  if (row !== "") rows.push(row);
  const hanging = " ".repeat(TO_AUTHOR.length);
  return rows.map((text, index) =>
    cardText(`${TO_AUTHOR_INDENT}${index === 0 ? TO_AUTHOR : hanging}${text}`),
  );
}

/** One file's card rows: its glyph, name, and state, then the sections still to write. */
export function storyFileLines(verdict: ArtifactVerdict): string[] {
  const glyph = verdict.state === "authored" ? "✓" : "○";
  return [
    cardText(`${glyph} ${verdict.name} — ${describeArtifactState(verdict.state)}`),
    ...toAuthorLines(verdict.toAuthor),
  ];
}
