// A scratch journey with a pulled and prepared User Story, for tests that drive the
// Plan-stage lifecycle over a real story package.
//
// CR112's refusal tests and CR111's Plan-card tests both need one: a database copy
// with the identity and runtime tables, a project holding the story's package
// directory, and a delivery cursor at the event the test starts from. One helper, so
// the two suites cannot drift into two ideas of "a story ready to plan".

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getAriadMethod } from "#builder/ariadMethod.ts";
import { setDeliveryCursor } from "#builder/deliveryCursor.ts";
import { type BuilderPlanReport, planLifecycleItem } from "#builder/plan.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";

/** The story package every world holds, project-relative. */
export const STORY_PACKAGE = "docs/project/roadmap/cv1/cv1-ds1/cv1-ds1-us1-enter-an-address";

/** A fixed clock for every cursor write. */
export const storyDeps = { nowIso: () => "2026-09-30T12:00:00+00:00" };

export interface StoryWorld {
  readonly db: WritableDatabase;
  readonly project: string;
  /** The package's `plan.md`, absolute. */
  readonly plan: string;
  /** The package's `index.md`, absolute. */
  readonly index: string;
}

const roots: string[] = [];

/** A journey `demo` whose story `CV1.DS1.US1` stands at `event`, its package directory made. */
export function storyWorld(event = "prepare", pending: string | null = null): StoryWorld {
  const root = mkdtempSync("/tmp/story-world-");
  roots.push(root);
  const db = openDatabaseCopyForWrite(join(root, "copy.db"));
  createIdentityTable(db);
  createRuntimeTables(db);
  const project = join(root, "project");
  mkdirSync(join(project, STORY_PACKAGE), { recursive: true });
  setDeliveryCursor(
    db,
    {
      journey: "demo",
      method: "ariad",
      activeItem: "CV1.DS1.US1",
      activeItemTitle: "Enter an address",
      activeItemLevel: "user_story",
      lastDeliveryEvent: event,
      pendingConfirmation: pending,
      navigatorFlowUnit: "story_by_story",
    },
    storyDeps,
  );
  return {
    db,
    project,
    plan: join(project, STORY_PACKAGE, "plan.md"),
    index: join(project, STORY_PACKAGE, "index.md"),
  };
}

export interface PlanStoryOptions {
  readonly preauthorize?: boolean;
  readonly objective?: string | null;
  /** Plan as a journey with no project path: nothing is written or read. */
  readonly withoutProject?: boolean;
}

/** Run Plan on the world's story, as the front door does. */
export function planStory(world: StoryWorld, options: PlanStoryOptions = {}): BuilderPlanReport {
  const withProject = !(options.withoutProject ?? false);
  return planLifecycleItem(
    world.db,
    {
      journey: "demo",
      method: getAriadMethod(),
      objective: options.objective ?? null,
      planArtifactPath: withProject ? world.plan : null,
      projectRoot: withProject ? world.project : null,
      preauthorize: options.preauthorize ?? false,
    },
    storyDeps,
  );
}

/** Remove every world made so far; call from `test.after`. */
export function removeStoryWorlds(): void {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}
