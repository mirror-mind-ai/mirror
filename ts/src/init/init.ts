// `init` — bootstrap a user home from repository identity templates. The port
// of memory.cli.init. Filesystem-only: no database is opened or touched.
//
// Deliberate, verified divergence: Python's `main()` never catches
// FileExistsError/FileNotFoundError from init_user_home, so those paths exit
// via an uncaught exception — a raw Python traceback with this machine's
// absolute file paths on stderr, exit 1. That traceback is an implementation
// leak, not a designed CLI contract (unlike, say, `identity get`'s deliberate
// one-line not-found message) — it is not meaningful or possible to replicate
// byte-for-byte (it depends on Python's own call stack and module paths, which
// drift on every refactor and reveal nothing product-relevant). This port
// preserves the observable CONTRACT instead: exit 1, and a stderr message that
// names the failure. See the CLI wiring in ../frontDoor/cli.ts.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { runningTreeRoot } from "#runtime/treeRoot.ts";

/** Port of Python's uncaught `FileNotFoundError` for a missing templates root. */
export class TemplatesNotFoundError extends Error {}

/** Port of Python's uncaught `FileExistsError` for a non-empty identity root. */
export class IdentityRootExistsError extends Error {
  readonly path: string;
  constructor(path: string) {
    super(`Identity root already exists and is not empty: ${path}`);
    this.path = path;
  }
}

/**
 * `<tree root>/templates/identity`. Python's `find_templates_identity_root`
 * walked up from its own file for the directory; since CV22.DS10.US3 the tree
 * root is one resolver shared with release notes and the welcome card, and
 * the templates ship in the package at the same path as in the checkout.
 */
export function templatesIdentityRoot(treeRoot: string = runningTreeRoot()): string {
  const candidate = join(treeRoot, "templates", "identity");
  if (existsSync(candidate)) return candidate;
  throw new TemplatesNotFoundError(`Could not find templates/identity under ${treeRoot}.`);
}

/**
 * Where `init` creates a user's home: `<home>/.mirror-minds/<user>`, the path
 * `MIRROR_USER=<user>` resolves to.
 *
 * Python's `default_user_home` hardcoded the legacy `~/.mirror/<user>` and told
 * the person to set MIRROR_HOME by hand. CV22.DS10.US3 (D3) has `init` write
 * `MIRROR_USER` into the config file instead, and a legacy home would then
 * make every later command print the legacy-path warning (D14).
 */
export function defaultUserHome(user: string, home: string = homedir()): string {
  return join(home, ".mirror-minds", user);
}

/** Every `.yaml` file under `root`, recursively (mirrors `Path.rglob("*.yaml")`). */
function yamlFilesRecursive(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) out.push(...yamlFilesRecursive(full));
    else if (entry.isFile() && full.endsWith(".yaml")) out.push(full);
  }
  return out;
}

/**
 * Port of `_substitute_user_name`: replace every `{{user_name}}` token in every
 * `.yaml` file under `identityRoot` with `user`, writing back only files that
 * actually contained the token. Non-`.yaml` files (e.g. `README.md`) are
 * intentionally left untouched, matching the Python glob scope exactly.
 */
function substituteUserName(identityRoot: string, user: string): void {
  for (const file of yamlFilesRecursive(identityRoot)) {
    const content = readFileSync(file, "utf8");
    if (content.includes("{{user_name}}")) {
      writeFileSync(file, content.replaceAll("{{user_name}}", user), "utf8");
    }
  }
}

export interface InitUserHomeOptions {
  /** Overrides the located templates root (tests only; production auto-locates it). */
  templatesIdentityRoot?: string;
  /** Overrides the destination home (tests only; production uses defaultUserHome). */
  userHome?: string;
}

/**
 * Port of `init_user_home`: locate the identity templates, refuse a non-empty
 * existing destination, copy the template tree, substitute `{{user_name}}` in
 * every `.yaml` file, and return the destination identity root.
 */
export function initUserHome(user: string, options: InitUserHomeOptions = {}): string {
  const templatesRoot = options.templatesIdentityRoot ?? templatesIdentityRoot();
  if (!existsSync(templatesRoot)) {
    throw new TemplatesNotFoundError(`Identity templates not found: ${templatesRoot}`);
  }

  const destinationHome = options.userHome ?? defaultUserHome(user);
  const identityRoot = join(destinationHome, "identity");
  if (existsSync(identityRoot) && readdirSync(identityRoot).length > 0) {
    throw new IdentityRootExistsError(identityRoot);
  }

  mkdirSync(destinationHome, { recursive: true });
  cpSync(templatesRoot, identityRoot, { recursive: true });
  substituteUserName(identityRoot, user);
  return identityRoot;
}
