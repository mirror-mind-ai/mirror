// CV22.DS7.US8 plateau 3 — Expand: a Delivery Story becomes implementable stories.
//
// Port of `expand_delivery_story` and its renderers from
// `src/memory/builder/lifecycle.py`.
//
// Expand is the highest-consequence command in this plateau, because it is the one
// that WRITES INTO AUTHORED CONTENT. Three properties are load-bearing and each
// has already cost this project a defect:
//
//   * **It resolves the package by heading code, never by arithmetic on code and
//     title** (`storyPaths`). An authored package lives wherever a human put it.
//     CR048 was this, twice.
//   * **It refuses rather than fabricates.** An authored package whose candidate
//     table does not parse blocks Expand. The alternative — inventing a generic
//     `US1` on top of real authored content — is the CV22.DS7 secondary defect,
//     and it is worse than failing because the fabrication looks like work.
//   * **It never overwrites.** Every write is guarded by "does this exist", so
//     re-expanding an authored package reports `existing` and changes nothing.
//
// The candidate-table parser is header-driven on purpose: it accepts the 4-column
// authored shape and the 5-column generated one, in any column order, with extra
// columns ignored. What it does not accept is a table that fails to declare Code,
// Story, Type, and Status — which is precisely the refusal above.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { WritableDatabase } from "#db/database.ts";
import { pyStrip } from "#util/pythonText.ts";
import { existingArtifact, type MaterializedArtifact } from "./artifacts/artifactSurfaces.ts";
import { writeBuilderArtifact } from "./artifacts/artifactWriter.ts";
import {
  renderDeliveryStoryIndex,
  renderStoryIndex,
  renderUserStoryIndex,
} from "./artifacts/storyIndex.ts";
import { cardPrefixed, cardText, cardWrapped } from "./card.ts";
import { normalizeRequired } from "./cursorTransitions.ts";
import {
  type BuilderDeliveryCursor,
  type CursorWriteDeps,
  getDeliveryCursor,
  setDeliveryCursor,
} from "./deliveryCursor.ts";
import { renderLifecycleRibbon } from "./lifecycleRibbon.ts";
import { stripMarkdownLink } from "./roadmapGrammar.ts";
import {
  createStoryDirectory,
  resolveStoryDirectory,
  storyFolderName,
  titleLeaf,
} from "./storyPaths.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

/**
 * Python `ExpandBlockedError`.
 *
 * A distinct type, not a bare `Error`: the CLI catches it alongside
 * `StoryPackageAmbiguityError` to render `EXPAND_BLOCKED`, while an ordinary
 * `ValueError` from a guard stays a plain stderr refusal.
 */
export class ExpandBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpandBlockedError";
  }
}

/** Python `BuilderExpandReport`. */
export interface BuilderExpandReport {
  readonly journey: string;
  readonly method: string;
  readonly deliveryStory: string;
  readonly deliveryStoryTitle: string;
  readonly materializedPaths: readonly string[];
  readonly materializedArtifacts: readonly MaterializedArtifact[];
  readonly recommendedStory: string;
  readonly recommendedStoryTitle: string;
  readonly cursor: BuilderDeliveryCursor;
  readonly nextEvent: string;
}

/** Python `_CandidateChild`. */
interface CandidateChild {
  readonly code: string;
  readonly title: string;
  readonly level: string;
  readonly status: string;
}

const REQUIRED_COLUMNS = ["code", "story", "type", "status"] as const;

/**
 * Python `_parse_candidate_stories`.
 *
 * Line-by-line rather than block-by-block, and the details matter:
 *
 *   * a non-table line BREAKS the scan once a header was found, but is SKIPPED
 *     before — so the first canonical table wins and nothing after it is read;
 *   * `line.strip("|")` removes every leading and trailing pipe, not one;
 *   * duplicate header names keep the LAST index, because Python builds the map
 *     with a dict comprehension over `enumerate`;
 *   * a row shorter than the widest required column is skipped, not an error,
 *     which is how a ragged authored table degrades instead of blocking.
 */
function parseCandidateStories(content: string): CandidateChild[] {
  const children: CandidateChild[] = [];
  let columns: Map<string, number> | null = null;

  for (const rawLine of content.split("\n")) {
    const line = pyStrip(rawLine);
    if (!line.startsWith("|")) {
      if (columns !== null) break;
      continue;
    }
    const cells = stripPipes(line)
      .split("|")
      .map((cell) => pyStrip(cell));

    if (columns === null) {
      // `cell.lower()` — ASCII header names in practice; Python's `str.lower()`
      // and JavaScript's `toLowerCase()` differ only on characters no canonical
      // header uses (`İ`, `ẞ`), and a divergence there fails closed by not
      // matching the required set.
      const lowered = cells.map((cell) => cell.toLowerCase());
      if (REQUIRED_COLUMNS.every((name) => lowered.includes(name))) {
        columns = new Map();
        lowered.forEach((name, index) => {
          columns?.set(name, index);
        });
      }
      continue;
    }

    if (line.startsWith("|---")) continue;
    if (cells.every((cell) => cell === "")) continue;
    if (cells.every((cell) => [...cell].every((character) => character === "-"))) continue;

    const widest = Math.max(...[...columns.values()]);
    if (cells.length <= widest) continue;

    const code = stripMarkdownLink(cells[columns.get("code") ?? 0] ?? "");
    if (!code) continue;
    const typeText = (cells[columns.get("type") ?? 0] ?? "").toLowerCase();
    children.push({
      code,
      title: stripMarkdownLink(cells[columns.get("story") ?? 0] ?? ""),
      level: typeText.includes("technical") ? "technical_story" : "user_story",
      status: cells[columns.get("status") ?? 0] ?? "",
    });
  }
  return children;
}

/** Python `str.strip("|")`: remove every leading and trailing pipe. */
function stripPipes(line: string): string {
  let start = 0;
  let end = line.length;
  while (start < end && line[start] === "|") start += 1;
  while (end > start && line[end - 1] === "|") end -= 1;
  return line.slice(start, end);
}

/**
 * Python `_first_pending_child`.
 *
 * "Done" is matched as a SUBSTRING of the status cell in both cases, so `✅ Done`
 * and `done` both count and `Doneness` would too. Falls back to the first child
 * when every child is done, so Expand always recommends something.
 */
function firstPendingChild(children: readonly CandidateChild[]): CandidateChild {
  for (const child of children) {
    if (!child.status.includes("Done") && !child.status.includes("done")) return child;
  }
  return children[0] as CandidateChild;
}

/** Python `_materialize_child_package`: the child's FULL title slugs its folder. */
function materializeChildPackage(
  dsDirectory: string,
  child: CandidateChild,
  projectRoot: string,
): { path: string; artifact: MaterializedArtifact } {
  // Note: `child.title`, not `titleLeaf(child.title)`. A `/` in a candidate title
  // is slugged into the folder name rather than read as an ancestor chain, which
  // is the opposite of what the cursor's own title does. Python's asymmetry,
  // reproduced.
  const childDirectory = join(dsDirectory, storyFolderName(child.code, child.title));
  const childIndex = join(childDirectory, "index.md");
  const outcome = writeBuilderArtifact({
    path: childIndex,
    content: renderStoryIndex(child.code, child.title, child.level),
    policy: "create-only",
    projectRoot,
  });
  const label = `${child.code.split(".").at(-1) ?? child.code} package`;
  return {
    path: childIndex,
    artifact:
      outcome === "existing"
        ? existingArtifact(label, childIndex)
        : { kind: label, path: childIndex, status: "created" },
  };
}

export interface ExpandOptions {
  readonly journey: string;
  readonly method: string;
  readonly projectPath: string;
}

/** Python `expand_delivery_story`. */
export function expandDeliveryStory(
  db: WritableDatabase,
  options: ExpandOptions,
  deps: CursorWriteDeps,
): BuilderExpandReport {
  const journey = normalizeRequired(options.journey, "journey");
  const method = normalizeRequired(options.method, "method");

  const existing = getDeliveryCursor(db, journey);
  if (existing === null) throw new Error("delivery cursor is required before expand");
  // Level before item: a cursor with no active item but the wrong level reports
  // the LEVEL problem. Guard order is observable, so it is preserved.
  if (existing.activeItemLevel !== "delivery_story") {
    throw new Error("expand requires an active Delivery Story");
  }
  if (!existing.activeItem) throw new Error("active item is required before expand");

  const activeItem = existing.activeItem;
  const title = existing.activeItemTitle || activeItem;
  const dsDirectory =
    resolveStoryDirectory(options.projectPath, activeItem) ??
    createStoryDirectory(options.projectPath, activeItem, title);
  const dsIndex = join(dsDirectory, "index.md");
  const dsExists = existsSync(dsIndex);
  const children = dsExists ? parseCandidateStories(readFileSync(dsIndex, "utf8")) : [];

  if (dsExists && children.length === 0) {
    throw new ExpandBlockedError(
      `authored package at ${dsDirectory} has no canonical candidate-stories table ` +
        "(a Markdown table header must include Code, Story, Type, and Status columns); " +
        "refusing to fabricate a generic story",
    );
  }

  const materializedPaths: string[] = [dsIndex];
  const materializedArtifacts: MaterializedArtifact[] = [];
  let recommendedCode: string;
  let recommendedTitle: string;
  let childWorkItems: string[];

  if (children.length > 0) {
    const recommended = firstPendingChild(children);
    recommendedCode = recommended.code;
    recommendedTitle = recommended.title;
    mkdirSync(dsDirectory, { recursive: true });
    const dsOutcome = writeBuilderArtifact({
      path: dsIndex,
      content: renderDeliveryStoryIndex(activeItem, title, recommendedCode, recommendedTitle),
      policy: "create-only",
      projectRoot: options.projectPath,
    });
    materializedArtifacts.push(
      dsOutcome === "existing"
        ? existingArtifact("DS package", dsIndex)
        : { kind: "DS package", path: dsIndex, status: "created" },
    );
    for (const child of children) {
      const materialized = materializeChildPackage(dsDirectory, child, options.projectPath);
      materializedPaths.push(materialized.path);
      materializedArtifacts.push(materialized.artifact);
    }
    childWorkItems = children.map((child) => child.code);
  } else {
    // No authored package at all: synthesize one child so the Delivery Story has
    // something implementable. This is not fabrication on top of authored content
    // — the refusal above already covers that case — it is the empty-field case.
    recommendedCode = `${activeItem}.US1`;
    recommendedTitle = titleLeaf(title);
    const usDirectory = join(dsDirectory, storyFolderName(recommendedCode, recommendedTitle));
    const usIndex = join(usDirectory, "index.md");
    mkdirSync(dsDirectory, { recursive: true });
    mkdirSync(usDirectory, { recursive: true });
    const dsOutcome = writeBuilderArtifact({
      path: dsIndex,
      content: renderDeliveryStoryIndex(activeItem, title, recommendedCode, recommendedTitle),
      policy: "create-only",
      projectRoot: options.projectPath,
    });
    const usOutcome = writeBuilderArtifact({
      path: usIndex,
      content: renderUserStoryIndex(recommendedCode, recommendedTitle),
      policy: "create-only",
      projectRoot: options.projectPath,
    });
    materializedArtifacts.push(
      dsOutcome === "existing"
        ? existingArtifact("DS package", dsIndex)
        : { kind: "DS package", path: dsIndex, status: "created" },
    );
    const label = `${recommendedCode.split(".").at(-1) ?? recommendedCode} package`;
    materializedArtifacts.push(
      usOutcome === "existing"
        ? existingArtifact(label, usIndex)
        : { kind: label, path: usIndex, status: "created" },
    );
    materializedPaths.push(usIndex);
    childWorkItems = [recommendedCode];
  }

  const cursor = setDeliveryCursor(
    db,
    {
      journey,
      method,
      activeItem: existing.activeItem,
      activeItemTitle: existing.activeItemTitle,
      activeItemLevel: existing.activeItemLevel,
      activeCheckpoint: "next_story_confirmation",
      pendingConfirmation: "navigator_story_confirmation",
      lastDeliveryEvent: "expand",
      cadenceProfile: existing.cadenceProfile,
      cadenceLimits: existing.cadenceLimits,
      granularityDecision: "expanded_to_implementable_stories",
      navigatorFlowUnit: existing.navigatorFlowUnit,
      // Replaced wholesale, so a previous Delivery Story's children cannot survive.
      childWorkItems,
      aggregateCheckpointStatus: existing.aggregateCheckpointStatus,
    },
    deps,
  );

  return {
    journey,
    method,
    deliveryStory: activeItem,
    deliveryStoryTitle: title,
    materializedPaths,
    materializedArtifacts,
    recommendedStory: recommendedCode,
    recommendedStoryTitle: recommendedTitle,
    cursor,
    nextEvent: "plan",
  };
}

/** Python `render_expand_blocked`. */
export function renderExpandBlocked(activeItem: string, reason: string): string {
  const body = `${[
    "Delivery",
    renderLifecycleRibbon("expand"),
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        🧭◆  EXPAND BLOCKED                             │",
    "│                                                        │",
    cardText("delivery story"),
    cardText(`🟦[${activeItem}]`),
    "│                                                        │",
    cardText("why blocked"),
    ...cardWrapped(reason),
    "│                                                        │",
    cardText("required Navigator action"),
    ...cardWrapped(
      "Add a canonical candidate-stories table (Markdown table header including " +
        "Code, Story, Type, and Status columns) to the resolved package's index.md, " +
        "or resolve the duplicate heading, then Expand again.",
    ),
    "│                                                        │",
    cardText("boundary"),
    ...cardWrapped("No files were materialized. Expand refuses to fabricate a generic story."),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n")}\n`;
  return wrapAriadSurface("expand_blocked", body);
}

/** Python `render_expand_report`. */
export function renderExpandReport(report: BuilderExpandReport): string {
  const body = `${[
    "Delivery",
    renderLifecycleRibbon("expand"),
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        🧭◆  EXPAND DECISION                            │",
    "│                                                        │",
    cardText("delivery story"),
    cardText(`🟦[${report.deliveryStory}]`),
    ...cardWrapped(report.deliveryStoryTitle),
    "│                                                        │",
    cardText("materialized"),
    // Absolute paths, unlike `artifacts_materialized`, which relativizes the same
    // values two surfaces later in the same output. CR082.
    ...cardPrefixed(report.materializedPaths, "✓"),
    "│                                                        │",
    cardText("recommended next story"),
    cardText(`🟩[${report.recommendedStory}]`),
    ...cardWrapped(report.recommendedStoryTitle),
    "│                                                        │",
    cardText("navigator flow unit"),
    cardText("story_by_story: child stories keep Navigator checkpoints"),
    cardText("delivery_story: DS becomes the Navigator-facing lifecycle"),
    cardText("default: story_by_story"),
    "│                                                        │",
    cardText("next action"),
    cardText("Navigator chooses flow unit or confirms a child story."),
    "│                                                        │",
    cardText("boundary"),
    cardText("No Plan or implementation was executed."),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n")}\n`;
  return wrapAriadSurface("expand_decision", body);
}
