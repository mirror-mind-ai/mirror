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
//     "Exists" means a package whose heading claims the child's code, wherever it
//     lives, not a file at the folder Expand would have named. Until CR018 it meant
//     the folder, so a child a human had filed elsewhere was written a second time.
//
// The candidate-table parser is header-driven on purpose: it accepts the 4-column
// authored shape and the 5-column generated one, in any column order, with extra
// columns ignored. What it does not accept is a table that fails to declare Code,
// Story, Type, and Status — which is precisely the refusal above.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { WritableDatabase } from "#db/database.ts";
import { existingArtifact, type MaterializedArtifact } from "./artifacts/artifactSurfaces.ts";
import { writeBuilderArtifact } from "./artifacts/artifactWriter.ts";
import { artifactState, describeArtifactState } from "./artifacts/scaffoldState.ts";
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
import { FLOW_STOPS } from "./flowUnit.ts";
import { renderLifecycleRibbon } from "./lifecycleRibbon.ts";
import { type CandidateChild, parseCandidateStories } from "./roadmapGrammar.ts";
import { createStoryDirectory, storyDirectoryResolver, storyFolderName } from "./storyPaths.ts";
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

/**
 * Python `_materialize_child_package`: the child's FULL title slugs its folder.
 *
 * `authored` is the package that already claims the child's code, found by heading
 * before Expand wrote anything. It is reported where it lives and never written.
 */
/** An existing child index, named with what it is: a scaffold or an authored file (CR112). */
function existingIndex(label: string, path: string): MaterializedArtifact {
  return existingArtifact(
    label,
    path,
    describeArtifactState(artifactState("index.md", path).state),
  );
}

function materializeChildPackage(
  dsDirectory: string,
  child: CandidateChild,
  authored: string | null,
  projectRoot: string,
): { path: string; artifact: MaterializedArtifact } {
  const label = `${child.code.split(".").at(-1) ?? child.code} package`;
  if (authored !== null) {
    const authoredIndex = join(authored, "index.md");
    return { path: authoredIndex, artifact: existingIndex(label, authoredIndex) };
  }
  // The whole title slugs the folder, as it does for any new package (CR018).
  const childDirectory = join(dsDirectory, storyFolderName(child.code, child.title));
  const childIndex = join(childDirectory, "index.md");
  const outcome = writeBuilderArtifact({
    path: childIndex,
    content: renderStoryIndex(child.code, child.title, child.level),
    policy: "create-only",
    projectRoot,
  });
  return {
    path: childIndex,
    artifact:
      outcome === "existing"
        ? existingIndex(label, childIndex)
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
  // One reading of the roadmap answers for the Delivery Story and for every child, so
  // each is settled before the first write (CR018).
  const packageOf = storyDirectoryResolver(options.projectPath);
  const dsDirectory =
    packageOf(activeItem) ?? createStoryDirectory(options.projectPath, activeItem, title);
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
    // Before any write: a child two packages claim throws here, while EXPAND_BLOCKED's
    // "No files were materialized" is still true.
    const placements = children.map((child) => ({ child, authored: packageOf(child.code) }));
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
    for (const { child, authored } of placements) {
      const materialized = materializeChildPackage(
        dsDirectory,
        child,
        authored,
        options.projectPath,
      );
      materializedPaths.push(materialized.path);
      materializedArtifacts.push(materialized.artifact);
    }
    childWorkItems = children.map((child) => child.code);
  } else {
    // No authored package at all: synthesize one child so the Delivery Story has
    // something implementable. This is not fabrication on top of authored content
    // — the refusal above already covers that case — it is the empty-field case.
    recommendedCode = `${activeItem}.US1`;
    recommendedTitle = title;
    const claimed = packageOf(recommendedCode);
    if (claimed !== null) {
      throw new ExpandBlockedError(
        `${activeItem} has no package, and an authored package already claims ` +
          `${recommendedCode} at ${claimed}; refusing to invent a story over it`,
      );
    }
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
      // The default flow's question, the one DELIVERY_STORY_READY recommends answering
      // or replacing with a choice of Delivery Story flow (CR105).
      activeCheckpoint: FLOW_STOPS.story_by_story.checkpoint,
      pendingConfirmation: FLOW_STOPS.story_by_story.confirmation,
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
    // Names the Delivery Story rather than "the resolved package": the refusal CR018
    // added is for a Delivery Story that has no package to resolve.
    ...cardWrapped(
      "Add a canonical candidate-stories table (Markdown table header including " +
        `Code, Story, Type, and Status columns) to ${activeItem}'s index.md, ` +
        "creating it if the Delivery Story has none, or resolve the duplicate heading, " +
        "then Expand again.",
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
