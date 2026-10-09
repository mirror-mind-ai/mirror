// Where is this Mirror installed, and what can update it? (CV22.DS10.US2)
//
// The updater's first question, answered from where the front door ITSELF
// lives rather than from configuration. A user who has to tell the updater how
// they installed Mirror can tell it wrong, and the answer decides whether the
// next step is `git merge --ff-only` or `npm install -g`.
//
// Three answers, and `unknown` is a real one: an install we cannot identify is
// refused with its reason printed, never updated on a guess.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

export type InstallKind =
  | { kind: "clone"; repository: string }
  | { kind: "package"; root: string; name: string; version: string }
  | { kind: "unknown"; reason: string };

export interface InstallKindProbe {
  /** The front door's own resolved path. */
  frontDoorPath: string;
  /**
   * `npm root -g`, resolved once by the caller, when the caller needs npm's
   * word that `-g` addresses THIS install: the update lane does. Given as a
   * string, a package must sit inside it. Omitted or `null` (npm not probed,
   * or not available), a package is known by its layout alone -- see
   * `packageByLayout` -- which is what the read-only routes ask, since they
   * run where npm may not be on the PATH and must still say what this is.
   */
  npmRootGlobal?: string | null;
  exists?: (path: string) => boolean;
  readFile?: (path: string) => string;
  /**
   * Symlink resolution for the front door's path. `npm link` places a symlink
   * named like the package under the global root, so a developer's checkout
   * can be reached through a path that looks installed; what is updated must
   * be the tree the file really lives in.
   */
  realpath?: (path: string) => string;
}

/** Is `child` inside `parent`, by path components rather than string prefix? */
function isInside(parent: string, child: string): boolean {
  const base = resolve(parent);
  const target = resolve(child);
  return target === base || target.startsWith(base.endsWith(sep) ? base : base + sep);
}

/**
 * The git work tree holding this front door, identified by the repository
 * marker this project actually has: a root that carries `package.json` and a
 * `.git` entry (the manifest moved to the root in CV22.DS10.US3, D2). Walking up rather than asking git keeps detection free of a
 * subprocess and of git's own notion of "inside a work tree", which is true in
 * places this updater must not touch (a submodule, a nested checkout).
 */
function cloneRootFor(startDir: string, exists: (path: string) => boolean): string | null {
  let current = resolve(startDir);
  for (;;) {
    if (exists(join(current, ".git")) && exists(join(current, "package.json"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

interface Manifest {
  root: string;
  name: string;
  version: string;
  bins: string[];
}

/** The nearest manifest above the front door that names and versions a package. */
function nearestManifest(
  frontDoorPath: string,
  stopAt: string | null,
  exists: (path: string) => boolean,
  readFile: (path: string) => string,
): Manifest | null {
  let current = resolve(dirname(frontDoorPath));
  const stop = stopAt === null ? null : resolve(stopAt);
  for (;;) {
    const manifest = join(current, "package.json");
    if (exists(manifest)) {
      try {
        const parsed = JSON.parse(readFile(manifest)) as {
          name?: unknown;
          version?: unknown;
          bin?: unknown;
        };
        if (typeof parsed.name === "string" && typeof parsed.version === "string") {
          const bins =
            typeof parsed.bin === "string"
              ? [parsed.name]
              : typeof parsed.bin === "object" && parsed.bin !== null
                ? Object.keys(parsed.bin)
                : [];
          return { root: current, name: parsed.name, version: parsed.version, bins };
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

/**
 * The installed package holding this front door, by npm's own word: the
 * manifest sits inside `npm root -g`.
 *
 * Being under SOME `node_modules/` is not enough, and the difference matters:
 * a project-local dependency would detect as `package`, and `npm install -g`
 * would then update a completely different tree from the one running. The
 * global root is the evidence that `-g` addresses THIS install, which is why
 * the update lane asks this way.
 */
function packageUnderNpmRoot(
  frontDoorPath: string,
  npmRootGlobal: string,
  exists: (path: string) => boolean,
  readFile: (path: string) => string,
): InstallKind | null {
  if (!isInside(npmRootGlobal, frontDoorPath)) return null;
  const manifest = nearestManifest(frontDoorPath, npmRootGlobal, exists, readFile);
  if (manifest === null) return null;
  return { kind: "package", root: manifest.root, name: manifest.name, version: manifest.version };
}

/**
 * The installed package holding this front door, by its layout, with no
 * subprocess: the manifest sits at `<prefix>/lib/node_modules/<name>` -- the
 * global layout npm uses on every platform this core supports -- AND one of
 * the manifest's bins exists at `<prefix>/bin/<bin>` and resolves back into
 * the package. The bin is what makes a global install global; a project that
 * happens to live at `<x>/lib` has the first half and not the second.
 * (CV22.DS10.US3 plateau 4: the read-only routes run where npm may be off
 * the PATH and must still say what this is.)
 */
function packageByLayout(
  frontDoorPath: string,
  exists: (path: string) => boolean,
  readFile: (path: string) => string,
  realpath: (path: string) => string,
): InstallKind | null {
  const manifest = nearestManifest(frontDoorPath, null, exists, readFile);
  if (manifest === null) return null;
  const nodeModules = dirname(manifest.root);
  const lib = dirname(nodeModules);
  if (basename(nodeModules) !== "node_modules" || basename(lib) !== "lib") return null;
  const prefix = dirname(lib);
  const linked = manifest.bins.some((bin) => {
    const link = join(prefix, "bin", bin);
    return exists(link) && isInside(manifest.root, realpath(link));
  });
  if (!linked) return null;
  return { kind: "package", root: manifest.root, name: manifest.name, version: manifest.version };
}

/** `realpathSync`, except that a path that does not exist is returned as given. */
function safeRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export function detectInstallKind(probe: InstallKindProbe): InstallKind {
  const exists = probe.exists ?? existsSync;
  const readFile = probe.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const realpath = probe.realpath ?? safeRealpath;
  const frontDoorPath = realpath(resolve(probe.frontDoorPath));

  const asPackage = probe.npmRootGlobal
    ? packageUnderNpmRoot(frontDoorPath, probe.npmRootGlobal, exists, readFile)
    : packageByLayout(frontDoorPath, exists, readFile, realpath);
  if (asPackage !== null) return asPackage;

  const repository = cloneRootFor(dirname(frontDoorPath), exists);
  if (repository !== null) return { kind: "clone", repository };

  return {
    kind: "unknown",
    reason:
      probe.npmRootGlobal === null
        ? "not a git checkout, and npm is unavailable to identify a package install"
        : probe.npmRootGlobal === undefined
          ? "not a git checkout, and not laid out as a global npm install"
          : "not a git checkout, and not under the global npm root",
  };
}

/** One line for a render or a log entry. */
export function describeInstallKind(install: InstallKind): string {
  if (install.kind === "clone") return `clone (${install.repository})`;
  if (install.kind === "package") return `package (${install.name}@${install.version})`;
  return `unknown (${install.reason})`;
}

/**
 * The install, for `runtime status` and `runtime version`: the kind, and for
 * a package the root `npm install -g` replaces, which its one-line form does
 * not carry (US2 D3, deferred to CV22.DS10.US3 plateau 4).
 */
export function renderInstallLines(install: InstallKind): string[] {
  const lines = [`Install: ${describeInstallKind(install)}`];
  if (install.kind === "package") lines.push(`Install root: ${install.root}`);
  return lines;
}
