// Create a home — CV24.DS4.
//
// A host's first-run assistant (Mirror Desktop 0.3) creates a person's first
// Mirror home with one call: the identity templates copied with the person's
// name, the database at the current schema, and the identity, personas and
// Journeys seeded from that tree -- what `mirror init` then `mirror seed` do,
// with two differences the decision "A host creates a home beside its target
// and renames it into place, writing nothing outside it" records:
//
//   - **All or nothing.** The home is built in a staging directory beside the
//     target and renamed into place only once the migration report reads
//     `current` and the seed recorded no errors. Any failure removes the
//     staging directory, so a target either appears complete or not at all.
//   - **Nothing outside the target.** Unlike the CLI's `init`, this never
//     writes `~/.config/mirror/env`, which every `mirror` and `mirror-hook`
//     process on the machine reads. The host keeps the path itself.
//
// It reads no environment variable, and it refuses anything at the target.

import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";

import { bootstrapDatabase } from "#db/bootstrap.ts";
import { inspectMigrationState } from "#db/migrationReport.ts";
import { newUserNameProblem } from "#identity/identityKey.ts";
import { runSeed } from "#seed/seed.ts";
import { initUserHome, TemplatesNotFoundError, templatesIdentityRoot } from "./init.ts";

export type CreateHomeRejection =
  | "invalid_user_name"
  | "invalid_home_path"
  | "home_exists"
  | "templates_unavailable"
  | "seed_failed";

export class CreateHomeRejectedError extends Error {
  readonly reason: CreateHomeRejection;
  /** The seed's own error lines, for `seed_failed`. */
  readonly details: readonly string[];

  constructor(reason: CreateHomeRejection, details: readonly string[] = []) {
    super(details.length > 0 ? `${reason}: ${details.join("; ")}` : reason);
    this.reason = reason;
    this.details = details;
  }
}

export interface CreatedHome {
  homePath: string;
  dbPath: string;
  identityRoot: string;
  seeded: { created: number; updated: number; skipped: number };
}

/** Tests only: a templates root other than the one shipped with this tree. */
export interface CreateHomeOptions {
  templatesRoot?: string;
}

function occupied(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Create a complete, seeded home at `homePath`, or nothing at all. */
export function createHome(
  request: { homePath: string; userName: string },
  options: CreateHomeOptions = {},
): CreatedHome {
  const userName = request?.userName;
  if (typeof userName !== "string" || newUserNameProblem(userName) !== null) {
    throw new CreateHomeRejectedError("invalid_user_name");
  }
  const homePath = request?.homePath;
  if (typeof homePath !== "string" || !isAbsolute(homePath)) {
    throw new CreateHomeRejectedError("invalid_home_path");
  }
  const parent = dirname(homePath);
  if (!existsSync(parent) || !statSync(parent).isDirectory()) {
    throw new CreateHomeRejectedError("invalid_home_path");
  }
  if (occupied(homePath)) throw new CreateHomeRejectedError("home_exists");

  let templatesRoot: string;
  try {
    templatesRoot = options.templatesRoot ?? templatesIdentityRoot();
  } catch (error) {
    if (error instanceof TemplatesNotFoundError)
      throw new CreateHomeRejectedError("templates_unavailable");
    throw error;
  }
  if (!existsSync(templatesRoot)) throw new CreateHomeRejectedError("templates_unavailable");

  const staging = join(
    parent,
    `.${basename(homePath)}.creating-${process.pid}-${randomBytes(6).toString("hex")}`,
  );
  mkdirSync(staging, { mode: 0o700 });
  let placed = false;
  try {
    const stagedIdentity = initUserHome(userName, {
      templatesIdentityRoot: templatesRoot,
      userHome: staging,
    });
    const stagedDb = join(staging, "memory.db");
    const db = bootstrapDatabase(stagedDb);
    let seeded: ReturnType<typeof runSeed>;
    try {
      seeded = runSeed(db, stagedIdentity);
    } finally {
      db.close();
    }
    if (seeded.errors.length > 0) throw new CreateHomeRejectedError("seed_failed", seeded.errors);
    if (inspectMigrationState(stagedDb).state !== "current") {
      throw new CreateHomeRejectedError("seed_failed", ["the created database is not current"]);
    }
    // The last check. A directory created here in the one call between it and
    // the rename would be replaced if empty -- the race the decision accepts.
    if (occupied(homePath)) throw new CreateHomeRejectedError("home_exists");
    renameSync(staging, homePath);
    placed = true;
    return {
      homePath,
      dbPath: join(homePath, "memory.db"),
      identityRoot: join(homePath, "identity"),
      seeded: { created: seeded.created, updated: seeded.updated, skipped: seeded.skipped },
    };
  } finally {
    if (!placed) rmSync(staging, { recursive: true, force: true });
  }
}
