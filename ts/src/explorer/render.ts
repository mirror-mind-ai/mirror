// CV22.DS7.US7 plateau 1 — the Explorer Story surfaces, ported from
// `src/memory/surfaces/explorer_story.py`.
//
// These are `transport=verbatim` cards: the golden grades the rendered box
// drawing, so padding, wrapping, and blank-line placement are behavior. Every
// measurement goes through the Python string primitives in
// `#util/pythonText.ts` -- a JavaScript-native `length`, `trim()`, or `\s`
// disagrees with Python on astral characters and on four separator code
// points.
//
// One divergence is specific to this story and deliberately NOT factored away:
// this module's `wrap` CHUNKS a word longer than the line, while the
// otherwise-identical `wrap` in `transition.ts` lets it overflow so `line`
// truncates it. Two implementations of "the same" helper, one module apart,
// with different output on the same input. Sharing them would silently change
// one of the two cards.

import { codePointLength, pySplitWhitespace, pyStrip, sliceCodePoints } from "#util/pythonText.ts";

export const WIDTH = 56;

export interface ExplorerAttractorView {
  readonly label: string;
  readonly description?: string | null;
  readonly status: string;
}

export interface ExplorerExperimentProposalView {
  readonly title: string;
  readonly description?: string | null;
  readonly status: string;
}

export interface ExplorerBuilderHandoffView {
  readonly title: string;
  readonly summary?: string | null;
  readonly readiness: string;
  readonly artifactDir?: string | null;
  readonly indexPath?: string | null;
  readonly exploratoryStoryPath?: string | null;
  readonly handoffInfoPath?: string | null;
  readonly productDesignProposalPath?: string | null;
  readonly fullConversationPath?: string | null;
}

export interface ExplorerSourceConversationView {
  readonly conversationId: string;
  readonly title?: string | null;
  readonly role: string;
}

export interface ExplorerStoryView {
  readonly journey: string;
  readonly currentExploratoryStory?: string | null;
  readonly narrativeFieldSummary?: string | null;
  readonly lastStoryCard?: string | null;
  readonly attractors: readonly ExplorerAttractorView[];
  readonly experimentProposal?: ExplorerExperimentProposalView | null;
  readonly builderHandoff?: ExplorerBuilderHandoffView | null;
  readonly sourceConversations: readonly ExplorerSourceConversationView[];
  readonly id?: string | null;
  readonly title?: string | null;
  readonly status: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
  readonly promotedAt?: string | null;
  readonly archivedAt?: string | null;
}

type Row = readonly [label: string, value: string];

/** Python `_line`: truncate to WIDTH code points, then left-justify to WIDTH. */
function line(text: string): string {
  const content = sliceCodePoints(text, WIDTH);
  return `│${content.padEnd(WIDTH + (content.length - codePointLength(content)))}│`;
}

/** Python `_chunk_word`: hard-split a word wider than the line. */
function chunkWord(word: string, width: number): string[] {
  const points = Array.from(word);
  if (points.length <= width) return [word];
  const chunks: string[] = [];
  for (let index = 0; index < points.length; index += width) {
    chunks.push(points.slice(index, index + width).join(""));
  }
  return chunks;
}

/** Python `_wrap`: greedy fill in code points, with long words chunked. */
function wrap(text: string): string[] {
  const maxWidth = WIDTH - 2;
  const words = pySplitWhitespace(text);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    for (const chunk of chunkWord(word, maxWidth)) {
      if (current === "") {
        current = chunk;
      } else if (codePointLength(current) + 1 + codePointLength(chunk) <= maxWidth) {
        current += ` ${chunk}`;
      } else {
        lines.push(current);
        current = chunk;
      }
    }
  }
  if (current !== "") lines.push(current);
  return lines;
}

/** Python `_box`. Note there is no `_wrap_blocks` here: paragraphs collapse. */
function box(title: string, rows: readonly Row[]): string {
  const lines = ["Mirror", `╭${"─".repeat(WIDTH)}╮`, line(`        ${title}`)];
  for (const [label, value] of rows) {
    lines.push(line(""));
    lines.push(line(`  ${label}`));
    for (const wrapped of wrap(value)) {
      lines.push(line(`  ${wrapped}`));
    }
  }
  lines.push(`╰${"─".repeat(WIDTH)}╯`);
  return lines.join("\n");
}

/**
 * Python `PurePath(path.replace("\\", "/")).name`: the last component, with
 * trailing separators stripped and `""` for a bare root or an empty path.
 */
function handoffPathLabel(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const segments = normalized.split("/").filter((segment) => segment !== "");
  const last = segments.length > 0 ? (segments[segments.length - 1] as string) : "";
  // PurePath drops a trailing "." component ("./a" -> "a", "a/." -> "a").
  const name = last === "." ? (segments[segments.length - 2] ?? "") : last;
  return name ? `${name} — ${path}` : path;
}

interface StoryRowOptions {
  readonly includeLastCard: boolean;
  readonly includeDirection?: boolean;
  readonly includeLifecycle?: boolean;
}

/** Python `_story_rows`, including its four-branch placeholder rule. */
function storyRows(story: ExplorerStoryView, options: StoryRowOptions): Row[] {
  const { includeLastCard, includeDirection = false, includeLifecycle = false } = options;
  const rows: Row[] = [["journey", story.journey]];

  if (includeLifecycle) {
    if (story.id) rows.push(["story id", story.id]);
    rows.push(["status", story.status]);
  }
  if (story.currentExploratoryStory) {
    rows.push(["current story", story.currentExploratoryStory]);
  }
  if (story.narrativeFieldSummary) {
    rows.push(["narrative summary", story.narrativeFieldSummary]);
  }
  if (includeLastCard && story.lastStoryCard) {
    rows.push(["last card", story.lastStoryCard]);
  }
  if (includeDirection) {
    for (const attractor of story.attractors) {
      rows.push(["attractor", `${attractor.label} [${attractor.status}]`]);
      if (attractor.description) rows.push(["attractor detail", attractor.description]);
    }
    if (story.experimentProposal) {
      rows.push([
        "experiment proposal",
        `${story.experimentProposal.title} [${story.experimentProposal.status}]`,
      ]);
      if (story.experimentProposal.description) {
        rows.push(["experiment detail", story.experimentProposal.description]);
      }
    }
  }
  if (includeLifecycle && story.updatedAt) {
    rows.push(["updated", story.updatedAt]);
  }
  if (rows.length === 1 || (includeLifecycle && rows.length <= 3)) {
    rows.push(["current story", "No story text recorded yet."]);
  }
  return rows;
}

export function renderExploratoryStoryOpened(story: ExplorerStoryView): string {
  return box("△  EXPLORATORY STORY OPENED", storyRows(story, { includeLastCard: true }));
}

export function renderExploratoryStoryResumed(story: ExplorerStoryView): string {
  return box(
    "△  EXPLORATORY STORY RESUMED",
    storyRows(story, { includeLastCard: true, includeLifecycle: true }),
  );
}

export function renderExplorerStoryArchived(
  story: ExplorerStoryView | null,
  journey: string,
): string {
  if (story === null) {
    return box("△  NO ACTIVE EXPLORATORY STORY", [
      ["journey", journey],
      ["state", "No active Exploratory Story exists to archive."],
    ]);
  }
  return box(
    "△  EXPLORATORY STORY ARCHIVED",
    storyRows(story, { includeLastCard: true, includeLifecycle: true }),
  );
}

export function renderExplorerStoryList(
  journey: string,
  stories: readonly ExplorerStoryView[],
): string {
  const rows: Row[] = [["journey", journey]];
  if (stories.length === 0) {
    rows.push(["explorations", "No Exploratory Stories have been recorded yet."]);
  }
  stories.forEach((story, index) => {
    const title = story.title || story.currentExploratoryStory || "Untitled exploration";
    rows.push([`story ${index + 1}`, `${title} [${story.status}]`]);
    if (story.id) rows.push(["id", story.id]);
    if (story.updatedAt) rows.push(["updated", story.updatedAt]);
  });
  return box("△  EXPLORATORY STORIES", rows);
}

export function renderStoryThickened(story: ExplorerStoryView, changed?: string | null): string {
  const rows: Row[] = [];
  if (changed && pyStrip(changed) !== "") {
    rows.push(["what changed", pyStrip(changed)]);
  }
  rows.push(...storyRows(story, { includeLastCard: true }));
  return box("△  STORY THICKENED", rows);
}

export function renderNarrativeFieldSnapshot(story: ExplorerStoryView): string {
  return box(
    "△  NARRATIVE FIELD SNAPSHOT",
    storyRows(story, { includeLastCard: true, includeDirection: true }),
  );
}

export function renderAttractorsEmerging(story: ExplorerStoryView): string {
  const rows: Row[] = [["journey", story.journey]];
  if (story.attractors.length > 0) {
    story.attractors.forEach((attractor, index) => {
      const label = index === 0 ? "possible attractor" : `possible attractor ${index + 1}`;
      rows.push([label, attractor.label]);
      if (attractor.description) rows.push(["description", attractor.description]);
      rows.push(["status", attractor.status]);
    });
  } else {
    rows.push(["possible attractor", "No attractor has been surfaced yet."]);
  }
  return box("△  ATTRACTORS EMERGING", rows);
}

export function renderExperimentProposal(story: ExplorerStoryView): string {
  const rows: Row[] = [["journey", story.journey]];
  const proposal = story.experimentProposal;
  if (proposal) {
    rows.push(["small experiment", proposal.title]);
    if (proposal.description) rows.push(["description", proposal.description]);
    rows.push(["status", proposal.status]);
  } else {
    rows.push(["small experiment", "No experiment has been proposed yet."]);
  }
  rows.push(["boundary", "This is not Builder delivery until explicitly confirmed."]);
  return box("△  EXPERIMENT PROPOSAL", rows);
}

export function renderBuilderHandoffProposed(story: ExplorerStoryView): string {
  const rows: Row[] = [["journey", story.journey]];
  const handoff = story.builderHandoff;
  if (handoff) {
    rows.push(["handoff", handoff.title]);
    if (handoff.summary) rows.push(["summary", handoff.summary]);
    if (handoff.artifactDir) {
      rows.push(["artifact directory", handoffPathLabel(handoff.artifactDir)]);
    }
    if (handoff.indexPath) rows.push(["index", handoffPathLabel(handoff.indexPath)]);
    if (handoff.exploratoryStoryPath) {
      rows.push(["exploratory story", handoffPathLabel(handoff.exploratoryStoryPath)]);
    }
    if (handoff.handoffInfoPath) {
      rows.push(["handoff info", handoffPathLabel(handoff.handoffInfoPath)]);
    }
    if (handoff.productDesignProposalPath) {
      rows.push(["product design", handoffPathLabel(handoff.productDesignProposalPath)]);
    }
    if (handoff.fullConversationPath) {
      rows.push(["full conversation", handoffPathLabel(handoff.fullConversationPath)]);
    }
  } else {
    rows.push(["handoff", "No Builder handoff has been proposed yet."]);
  }
  for (const source of story.sourceConversations) {
    const title = source.title ? ` — ${source.title}` : "";
    rows.push(["source evidence", `${source.conversationId}${title} (${source.role})`]);
  }
  if (story.currentExploratoryStory) {
    rows.push(["current story", story.currentExploratoryStory]);
  }
  for (const attractor of story.attractors) {
    rows.push(["attractor", `${attractor.label} [${attractor.status}]`]);
  }
  if (story.experimentProposal) {
    rows.push([
      "experiment proposal",
      `${story.experimentProposal.title} [${story.experimentProposal.status}]`,
    ]);
  }
  rows.push(["boundary", "Builder executes only after explicit confirmation."]);
  return box("△  BUILDER HANDOFF PROPOSED", rows);
}

export function renderNoBuilderHandoff(journey: string): string {
  return box("△  NO BUILDER HANDOFF", [
    ["journey", journey],
    ["state", "No Builder handoff proposal exists for this story."],
    ["boundary", "Ask for a handoff proposal before promoting to Builder."],
  ]);
}

export function renderMissingExploratoryStory(journey: string): string {
  return box("△  NO EXPLORATORY STORY", [
    ["journey", journey],
    ["state", "No current Exploratory Story is stored for this journey."],
  ]);
}
