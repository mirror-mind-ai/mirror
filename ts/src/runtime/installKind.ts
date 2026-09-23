// Where is this Mirror installed, and what can update it? (CV22.DS10.US2)
//
// The updater's first question, answered from where the front door ITSELF
// lives rather than from configuration. A user who has to tell the updater how
// they installed Mirror can tell it wrong, and the answer decides whether the
// next step is `git merge --ff-only` or `npm install -g`.
//
// Three answers, and `unknown` is a real one: an install we cannot identify is
// refused with its reason printed, never updated on a guess.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

export type InstallKind =
  | { kind: "clone"; repository: string }
  | { kind: "package"; root: string; name: string; version: string }
  | { kind: "unknown"; reason: string };

export interface InstallKindProbe {
  /** The front door's own resolved path. */
  frontDoorPath: string;
  /**
   * `npm root -g`, resolved once by the caller. `null` means npm was not
   * available, which is itself a reason an install cannot be a package.
   */
  npmRootGlobal?: string | null;
  exists?: (path: string) => boolean;
  readFile?: (path: string) => string;
}

/** Is `child` inside `parent`, by path components rather than string prefix? */
function isInside(parent: string, child: string): boolean {
  const base = resolve(parent);
  const target = resolve(child);
  return target === base || target.startsWith(base.endsWith(sep) ? base : base + sep);
}

/**
 * The git work tree holding this front door, identified by the repository
 * marker this project actually has: a root that carries `ts/package.json` and
 * a `.git` entry. Walking up rather than asking git keeps detection free of a
 * subprocess and of git's own notion of "inside a work tree", which is true in
 * places this updater must not touch (a submodule, a nested checkout).
 */
function cloneRootFor(startDir: string, exists: (path: string) => boolean): string | null {
  let current = resolve(startDir);
  for (;;) {
    if (exists(join(current, ".git")) && exists(join(current, "ts", "package.json"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * The installed package holding this front door.
 *
 * Being under SOME `node_modules/` is not enough, and the difference matters:
 * a project-local dependency would detect as `package`, and `npm install -g`
 * would then update a completely different tree from the one running. The
 * global root is the only evidence that `-g` addresses THIS install.
 */
function packageFor(
  frontDoorPath: string,
  npmRootGlobal: string | null | undefined,
  exists: (path: string) => boolean,
  readFile: (path: string) => string,
): InstallKind | null {
  if (!npmRootGlobal) return null;
  if (!isInside(npmRootGlobal, frontDoorPath)) return null;

  let current = resolve(dirname(frontDoorPath));
  const stop = resolve(npmRootGlobal);
  for (;;) {
    const manifest = join(current, "package.json");
    if (exists(manifest)) {
      try {
        const parsed = JSON.parse(readFile(manifest)) as { name?: unknown; version?: unknown };
        if (typeof parsed.name === "string" && typeof parsed.version === "string") {
          return { kind: "package", root: current, name: parsed.name, version: parsed.version };
        }
      } catch {
        // A manifest we cannot read is not a package we should reinstall.
        return null;
      }
    }
    if (current === stop) return null;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function detectInstallKind(probe: InstallKindProbe): InstallKind {
  const exists = probe.exists ?? existsSync;
  const readFile = probe.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const frontDoorPath = resolve(probe.frontDoorPath);

  const asPackage = packageFor(frontDoorPath, probe.npmRootGlobal, exists, readFile);
  if (asPackage !== null) return asPackage;

  const repository = cloneRootFor(dirname(frontDoorPath), exists);
  if (repository !== null) return { kind: "clone", repository };

  return {
    kind: "unknown",
    reason: probe.npmRootGlobal
      ? "not a git checkout, and not under the global npm root"
      : "not a git checkout, and npm is unavailable to identify a package install",
  };
}

/** One line for a render or a log entry. */
export function describeInstallKind(install: InstallKind): string {
  if (install.kind === "clone") return `clone (${install.repository})`;
  if (install.kind === "package") return `package (${install.name}@${install.version})`;
  return `unknown (${install.reason})`;
}
