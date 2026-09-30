// CV22.DS7.US8 plateau 3 — Pull: the Navigator's commitment to an item.
//
// Port of `pull_lifecycle_item` and `render_pull_report` from
// `src/memory/builder/lifecycle.py`.
//
// Pull looks like a simple write and is not. Three carry-forward rules decide what
// survives it, and each one is invisible until it is wrong:
//
//   1. **Child work items and aggregate status reset only when the ITEM CHANGED.**
//      A first Pull (no prior active item) and a re-pull of the same code keep
//      them; pulling a different code drops them. A port that always resets loses
//      an expanded Delivery Story's children on a re-pull; one that never resets
//      carries the previous story's children into the new one, which is how a
//      Delivery Story ends up reporting siblings that belong to its predecessor.
//   2. **The generation always advances**, even for a re-pull of the same item.
//      It is what invalidates a pending authority receipt bound to the old
//      generation, so "pull the same thing again" is a real state change.
//   3. **Release intent survives only inside the same Delivery Story.** It is
//      keyed to the DS ancestor, so pulling a child of the same DS keeps it and
//      pulling into a different DS clears both fields explicitly.
//
// CR113: the card says what happened, at the level that happened, and where the item
// lives. It was headed DELIVERY STORY ACTIVATED for every level, under a marker
// naming a Delivery Story; it said Prepare had not run while the same command ran it;
// it drew a story straight under its CV; and it called any pulled code a roadmap
// candidate. It now names the level under a marker that names none, claims nothing
// about Prepare, draws the item's lineage, and says whether the roadmap names the item.

import { join } from "node:path";
import type { WritableDatabase } from "#db/database.ts";
import { codePointLength, pyStrip, pyTitle } from "#util/pythonText.ts";
import { cardClipped, cardText, cardWrapped } from "./card.ts";
import {
  ALLOWED_PULL_LEVELS,
  carriedForward,
  deliveryStoryCodeForItem,
  normalizeRequired,
} from "./cursorTransitions.ts";
import {
  type BuilderDeliveryCursor,
  type CursorWriteDeps,
  getDeliveryCursor,
  setDeliveryCursor,
  setTo,
} from "./deliveryCursor.ts";
import { renderLifecycleRibbon } from "./lifecycleRibbon.ts";
import { inspectPullCandidates, inspectRoadmapSnapshot, roadmapPaths } from "./pullCandidates.ts";
import { linkFreeTitle, matchHeading, parseCandidateStories } from "./roadmapGrammar.ts";
import { readRoadmapFile } from "./roadmapScan.ts";
import { resolveRoadmapScope, type ScopeCursor } from "./roadmapScope.ts";
import { claimedBy, NO_AUTHORED_PACKAGE, NO_PROJECT_PATH, scopeFocus } from "./scopePhrases.ts";
import { roadmapHeadingDirectories } from "./storyPaths.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

/** Python `BuilderLifecycleItem`. */
export interface BuilderLifecycleItem {
  readonly code: string;
  readonly title: string;
  readonly level: string;
  readonly whyNow: string;
}

/** Python `BuilderPullReport`. */
export interface BuilderPullReport {
  readonly journey: string;
  readonly method: string;
  readonly item: BuilderLifecycleItem;
  readonly cursor: BuilderDeliveryCursor;
  readonly nextEvent: string;
}

/**
 * Python `_normalize_item`.
 *
 * Field order is behavior: an empty code is reported before an empty title, and
 * the level VOCABULARY check runs after all four fields are non-empty, so a blank
 * level says "must not be empty" rather than listing the allowed values.
 */
function normalizeItem(item: BuilderLifecycleItem): BuilderLifecycleItem {
  const code = normalizeRequired(item.code, "item code");
  // Link-free from here on, as every roadmap reader delivers a title (CR018).
  const title = linkFreeTitle(normalizeRequired(item.title, "item title"));
  const level = normalizeRequired(item.level, "item level");
  const whyNow = normalizeRequired(item.whyNow, "why now");
  if (!(ALLOWED_PULL_LEVELS as readonly string[]).includes(level)) {
    throw new Error(`item level must be one of ${ALLOWED_PULL_LEVELS.join(", ")}`);
  }
  return { code, title, level, whyNow };
}

export interface PullOptions {
  readonly journey: string;
  readonly method: string;
  readonly item: BuilderLifecycleItem;
}

/** Python `pull_lifecycle_item`. */
export function pullLifecycleItem(
  db: WritableDatabase,
  options: PullOptions,
  deps: CursorWriteDeps,
): BuilderPullReport {
  const journey = normalizeRequired(options.journey, "journey");
  const method = normalizeRequired(options.method, "method");
  const item = normalizeItem(options.item);

  const existing = getDeliveryCursor(db, journey);
  if (existing === null) {
    throw new Error("delivery cursor is required before pull");
  }

  const itemChanged = existing.activeItem !== null && existing.activeItem !== item.code;
  const preserveReleaseIntent =
    existing.releaseIntentDeliveryStory === deliveryStoryCodeForItem(item.code);

  const cursor = setDeliveryCursor(
    db,
    {
      journey,
      method,
      activeItem: item.code,
      activeItemTitle: item.title,
      activeItemLevel: item.level,
      activeCheckpoint: null,
      pendingConfirmation: null,
      lastDeliveryEvent: "pull",
      ...carriedForward(existing),
      childWorkItems: itemChanged ? [] : existing.childWorkItems,
      aggregateCheckpointStatus: itemChanged ? [] : existing.aggregateCheckpointStatus,
      cursorGeneration: existing.cursorGeneration + 1,
      // Explicit, not KEEP: Pull is one of the few writes that may CLEAR release
      // intent, and the sentinel would preserve exactly what must be dropped.
      releaseIntentDeliveryStory: setTo(
        preserveReleaseIntent ? existing.releaseIntentDeliveryStory : null,
      ),
      releaseIntent: setTo(preserveReleaseIntent ? existing.releaseIntent : null),
    },
    deps,
  );

  return { journey, method, item, cursor, nextEvent: "prepare" };
}

/**
 * The title of the CV a pulled item sits under, as the roadmap names it (CR018): the
 * focus Project Position shows for the same cursor, so the two surfaces cannot
 * disagree. Python borrowed the head of the item's own title instead. Pull and Ready
 * both render it, and neither computes it: the caller passes this in.
 */
export function placementCvTitle(projectRoot: string | null, cursor: ScopeCursor): string {
  const items = inspectRoadmapSnapshot(projectRoot, { journey: "", method: "ariad" }).items;
  return scopeFocus(items, resolveRoadmapScope(projectRoot, cursor))?.title ?? "";
}

/** A Delivery Story a pulled story sits under, titled by the roadmap. */
export interface PlacementParent {
  readonly code: string;
  readonly title: string;
}

/** Where a pulled item sits: its CV's title, and its Delivery Story when it is a story. */
export interface Lineage {
  readonly cvTitle: string;
  readonly deliveryStory: PlacementParent | null;
}

/** The Pull card's placement, and whether the roadmap names the pulled item (CR113). */
export interface PullPlacement extends Lineage {
  readonly listed: boolean;
}

/** The title an authored package's heading gives a code, or why there is none. */
function packageTitle(
  projectRoot: string,
  claims: ReadonlyMap<string, readonly string[]>,
  code: string,
): string | null {
  const directories = claims.get(code) ?? [];
  if (directories.length > 1) return claimedBy(directories.length);
  const directory = directories[0];
  if (directory === undefined) return null;
  const { roadmapRoot } = roadmapPaths(projectRoot);
  const content = readRoadmapFile(join(roadmapRoot, directory, "index.md"));
  const heading = content === null ? null : matchHeading(content);
  return heading === null ? null : linkFreeTitle(pyStrip(heading.title));
}

/**
 * The item's lineage and whether the roadmap names it, from the roadmap as it stands.
 *
 * Three readers, each the authority for its fact. The CV's title is the focus Project
 * Position shows (`placementCvTitle`). A Delivery Story's title is its package's
 * heading, found by the status-blind heading rule Expand and `resolveStoryDirectory`
 * share, else the roadmap index's listing of it. The item is named when a package
 * heading claims it, when its Delivery Story's candidate table lists it, or when it is
 * a pull candidate. `inspectPullCandidates` alone would not do: it keeps only the
 * statuses that can be pulled, so a story marked Done, or a row with no package yet,
 * would read as not in the roadmap.
 */
export function pullPlacement(projectRoot: string | null, cursor: ScopeCursor): PullPlacement {
  const cvTitle = placementCvTitle(projectRoot, cursor);
  const code = cursor.activeItem ?? "";
  const cvCode = code.split(".")[0] ?? code;
  const dsCode = deliveryStoryCodeForItem(code);
  // A story under a Delivery Story that is not itself the CV row's code.
  const parentCode = dsCode !== null && dsCode !== code && dsCode !== cvCode ? dsCode : null;
  if (projectRoot === null) {
    return {
      cvTitle,
      deliveryStory: parentCode === null ? null : { code: parentCode, title: NO_PROJECT_PATH },
      listed: false,
    };
  }
  const claims = roadmapHeadingDirectories(projectRoot);
  const candidates = inspectPullCandidates(projectRoot, {
    journey: "",
    method: "ariad",
  }).candidates;
  const deliveryStory =
    parentCode === null
      ? null
      : {
          code: parentCode,
          title:
            packageTitle(projectRoot, claims, parentCode) ??
            candidates.find((candidate) => candidate.code === parentCode)?.title ??
            NO_AUTHORED_PACKAGE,
        };
  return { cvTitle, deliveryStory, listed: namedByRoadmap(projectRoot, claims, code, dsCode) };
}

/** Whether the roadmap names `code`: a package claims it, or its Delivery Story's table lists it. */
function namedByRoadmap(
  projectRoot: string,
  claims: ReadonlyMap<string, readonly string[]>,
  code: string,
  dsCode: string | null,
): boolean {
  if ((claims.get(code) ?? []).length > 0) return true;
  const parentDirectories = dsCode === null || dsCode === code ? [] : (claims.get(dsCode) ?? []);
  if (parentDirectories.length === 1) {
    const { roadmapRoot } = roadmapPaths(projectRoot);
    const content = readRoadmapFile(join(roadmapRoot, parentDirectories[0] as string, "index.md"));
    if (content !== null && parseCandidateStories(content).some((child) => child.code === code)) {
      return true;
    }
  }
  return inspectPullCandidates(projectRoot, { journey: "", method: "ariad" }).candidates.some(
    (candidate) => candidate.code === code,
  );
}

/** The last segment of a code: the label a tree row carries. */
function leafOf(code: string): string {
  const parts = code.split(".");
  return parts.length > 1 ? (parts.at(-1) ?? "") : code;
}

/**
 * The item's lineage as card rows (CR113): the CV, then its Delivery Story when the
 * item is a story under one, then the item. The colors are the three the Ready card
 * draws for the three levels. Pull and Ready both draw their tree here, so they
 * cannot disagree; Ready's is a Delivery Story, one level shorter.
 */
export function placementRows(
  item: { readonly code: string; readonly title: string; readonly level: string },
  lineage: Lineage,
): string[] {
  const cvCode = item.code.split(".")[0] ?? item.code;
  const glyph = item.level === "delivery_story" ? "🟦" : "🟩";
  // Whole where the title is read; the tree rows restate it on one line (CR018).
  const rows = [...cardWrapped(`🟪[${cvCode}] ${lineage.cvTitle}`)];
  if (lineage.deliveryStory === null) {
    rows.push(cardClipped(`  └─ ${glyph}[${leafOf(item.code)}] ${item.title}`));
    return rows;
  }
  const parent = lineage.deliveryStory;
  rows.push(cardClipped(`  └─ 🟦[${leafOf(parent.code)}] ${parent.title}`));
  rows.push(cardClipped(`     └─ ${glyph}[${leafOf(item.code)}] ${item.title}`));
  return rows;
}

/** What the card calls each level it can pull. */
const ACTIVATED: Readonly<Record<string, string>> = {
  delivery_story: "DELIVERY STORY",
  user_story: "USER STORY",
  technical_story: "TECHNICAL STORY",
};

/**
 * The title row, padded to terminal columns like every Builder title literal: 🟪 is
 * one code point and two columns, so the row is one code point short of the frame
 * and aligned on screen (see `pullCandidatesRender.ts`). The Delivery Story row keeps
 * the bytes it always had.
 */
function activatedTitleRow(level: string): string {
  const inner = `        🟪■  ${ACTIVATED[level] ?? "ITEM"} ACTIVATED`;
  const columns = codePointLength(inner) + 1;
  return `│${inner}${" ".repeat(Math.max(0, 56 - columns))}│`;
}

/** Python `render_pull_report`, with the level, the lineage, and a true source (CR113). */
export function renderPullReport(report: BuilderPullReport, placement: PullPlacement): string {
  const title = report.item.title;
  const body = `${[
    "Delivery",
    renderLifecycleRibbon("pull"),
    "",
    "╭────────────────────────────────────────────────────────╮",
    activatedTitleRow(report.item.level),
    "│                                                        │",
    // Whole where the title is read; the tree row below restates it on one line (CR018).
    ...cardWrapped(title),
    "│                                                        │",
    cardText("source"),
    cardText(placement.listed ? "roadmap candidate" : "not in the roadmap: pulled by its code"),
    "│                                                        │",
    cardText("roadmap placement"),
    ...placementRows(report.item, placement),
    "│                                                        │",
    cardText("intent"),
    ...cardWrapped(report.item.whyNow),
    "│                                                        │",
    cardText("commitment"),
    cardText("pulled into active Delivery Work"),
    cardText(`active item: ${report.cursor.activeItem ?? "none"}`),
    "│                                                        │",
    cardText("next event"),
    cardText(pyTitle(report.nextEvent)),
    "│                                                        │",
    cardText("boundary"),
    // Prepare's record is its own card, which the command prints next (CR113, D1).
    cardText("Plan and later lifecycle work were not executed."),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n")}\n`;
  return wrapAriadSurface("item_activated", body);
}
