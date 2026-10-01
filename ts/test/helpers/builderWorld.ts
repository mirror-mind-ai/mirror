// A scratch Builder journey for front-door tests (CR114 with CR115).
//
// A project on disk holding the roadmap files a test names, a database whose `demo`
// journey points at it and has adopted Ariad, and the Builder commands run through the
// same argv mapping the front door uses. Worlds live under a literal `/tmp/` path,
// which `openDatabaseCopyForWrite` requires; a test file removes them with
// `removeBuilderWorlds` in its `test.after`.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { setAdoptedMethod } from "#builder/methodAdoption.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { invokeBuilderArgv } from "#helpers/builderInvoke.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";

const NOW = "2026-10-01T12:00:00+00:00";
const created: string[] = [];

export interface BuilderWorld {
  readonly db: WritableDatabase;
  readonly project: string;
  /** The last `plan.md` a Plan step wrote, from its `plan_artifact_path=` trailer. */
  plan: string | null;
}

export interface BuilderRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** Run `build <argv[0]> --method ariad --journey demo <rest>` in the world. */
export function runBuild(w: BuilderWorld, argv: readonly string[], journey = "demo"): BuilderRun {
  const result = invokeBuilderArgv(
    w.db,
    [argv[0] ?? "", "--method", "ariad", "--journey", journey, ...argv.slice(1)],
    { nowIso: () => NOW },
  );
  const plan = result.stdout.match(/^plan_artifact_path=(.+)$/mu)?.[1];
  if (plan) w.plan = plan;
  return result;
}

/**
 * A world whose project holds `files` (project-relative path to content). The `demo`
 * journey has adopted Ariad; its cursor is synced unless `sync` is false.
 */
export function builderWorld(options: {
  readonly files: Readonly<Record<string, string>>;
  readonly sync?: boolean;
}): BuilderWorld {
  const root = mkdtempSync("/tmp/builder-world-");
  created.push(root);
  const project = join(root, "project");
  for (const [path, content] of Object.entries(options.files)) {
    mkdirSync(dirname(join(project, path)), { recursive: true });
    writeFileSync(join(project, path), content, "utf8");
  }
  mkdirSync(project, { recursive: true });

  const db = openDatabaseCopyForWrite(join(root, "copy.db"));
  createIdentityTable(db);
  createRuntimeTables(db);
  db.prepare(
    `INSERT INTO identity (id, layer, key, content, created_at, updated_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "journey:demo",
    "journey",
    "demo",
    "# Demo\n",
    NOW,
    NOW,
    JSON.stringify({ project_path: project }),
  );
  setAdoptedMethod(db, "demo", "ariad", () => NOW);
  const w: BuilderWorld = { db, project, plan: null };
  if (options.sync ?? true) {
    const synced = runBuild(w, ["sync-cursor"]);
    if (synced.exitCode !== 0) throw new Error(`sync-cursor failed: ${synced.stderr}`);
  }
  return w;
}

/** Remove every world this module created. */
export function removeBuilderWorlds(): void {
  for (const directory of created.splice(0)) rmSync(directory, { recursive: true, force: true });
}
