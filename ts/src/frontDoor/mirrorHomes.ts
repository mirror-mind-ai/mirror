// The homes root, and what counts as a home in it (CR185).
//
// `<home>/.mirror-minds` holds one directory per user home: the place
// `MIRROR_USER=<user>` resolves to and `init <user>` creates. The root used to
// be spelled in three places (`dbPath.ts`, `init.ts`, `runtimeRoute.ts`); it is
// spelled here. This module also owns the rule for what a home is, because two
// readers have to agree on it: the not-configured error, which names the homes
// it finds, and `init <name>`, which adopts an existing home instead of
// refusing it. If they disagreed, the error could print a command that `init`
// then answers differently.
//
// Filesystem reads only, and every one of them is allowed to fail: a root that
// is missing, a file, or unreadable has no homes. The callers are error paths
// and a bootstrap command, and neither may fail for a second reason.

import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { newUserNameProblem } from "#identity/identityKey.ts";
import { sortByCodePoint } from "#util/pythonText.ts";

/** The homes root's name under the OS user's home directory. */
export const HOMES_DIR = ".mirror-minds";

/** `<home>/.mirror-minds`. */
export function homesRoot(home: string = homedir()): string {
  return join(home, HOMES_DIR);
}

/** `<home>/.mirror-minds/<user>`: where `MIRROR_USER=<user>` resolves, and where `init <user>` creates. */
export function userHomePath(user: string, home: string = homedir()): string {
  return join(homesRoot(home), user);
}

/** Every database name `dbNameForEnv` gives: `memory.db`, `memory_dev.db`, `memory_<env>.db`. */
const DATABASE_NAME = /^memory(?:_.+)?\.db$/;

/**
 * Whether `path` is a Mirror home: a directory, through a symlink if need be,
 * that holds a non-empty `identity/` or a database file.
 *
 * A directory holding only a log is not a home: an unresolved Pi session leaves
 * one under the root. An empty `identity/` is not a home either, because `init`
 * may still fill it. That is also the boundary `initUserHome` refuses at, so
 * `init` adopts exactly what it would otherwise have to refuse, and also a home
 * whose identity lives only in its database.
 */
export function isMirrorHome(path: string): boolean {
  if (!isDirectory(path)) return false;
  const identity = join(path, "identity");
  if (isDirectory(identity) && entries(identity).length > 0) return true;
  return entries(path).some((name) => DATABASE_NAME.test(name) && isFile(join(path, name)));
}

/** A home found under the root. */
export interface FoundHome {
  /** The directory's name. */
  readonly name: string;
  /** `<root>/<name>`: the entry itself, never a symlink's target. */
  readonly path: string;
  /** Whether `init <name>` accepts the name (CR141): only then can a message print it bare. */
  readonly nameable: boolean;
}

/** The homes in `<home>/.mirror-minds`, in code-point order. Hidden entries are skipped. */
export function findMirrorHomes(home: string = homedir()): FoundHome[] {
  const root = homesRoot(home);
  return sortByCodePoint(entries(root).filter((name) => !name.startsWith(".")))
    .map((name) => ({ name, path: join(root, name), nameable: newUserNameProblem(name) === null }))
    .filter((found) => isMirrorHome(found.path));
}

function entries(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
