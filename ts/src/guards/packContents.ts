// What the npm tarball may hold, checked rather than trusted. CV22.DS10.US3
// plateau 1, the artifact half of DS10's Zero Python gate.
//
// `files` in the manifest is a whitelist, and npm adds a few things on its
// own (README, LICENSE, the manifest). Nothing here repeats that list: this
// guard asks whether the packed inventory is the RUNTIME SUBSET and nothing
// else -- every runtime's integration files present, every entry point
// present, no test, golden, smoke, eval, scratch, environment file, database,
// Python, Windows product, or spike; and no install lifecycle script, so that
// installing Mirror is a file copy. The retired-surface guard proves the
// tree's code spawns no interpreter; this one proves the shipped files carry
// none.
//
// Pure over an inventory, so it can be graded on synthetic lists; the script
// feeds it `npm pack --dry-run --json`.

import { PACKAGE_NAME } from "#runtime/packageIdentity.ts";

/** Directory prefixes (with trailing slash) and exact files the tarball may contain. */
export const ALLOWED_PREFIXES: readonly string[] = [
  "ts/src/",
  "templates/",
  "docs/releases/",
  ".pi/extensions/",
  ".pi/skills/",
  ".claude/hooks/",
  ".gemini/hooks/",
  "plugins/mirror-mind/",
  "scripts/codex-hooks/",
];

export const ALLOWED_FILES: readonly string[] = [
  "package.json",
  "README.md",
  "LICENSE",
  "AGENTS.md",
  "ts/README.md",
  "scripts/codex-mirror.sh",
];

/** Files that must be in every tarball: the entries and one of each runtime's wiring. */
export const REQUIRED_FILES: readonly string[] = [
  "package.json",
  "README.md",
  "LICENSE",
  "ts/src/frontDoor/cli.ts",
  "ts/src/hooks/main.ts",
  "ts/src/mcp/main.ts",
  ".pi/extensions/mirror-logger.ts",
  ".pi/skills/mm-mirror/SKILL.md",
  ".claude/hooks/session-start.sh",
  ".gemini/hooks/session-start.sh",
  "plugins/mirror-mind/mcp/launch.sh",
  "scripts/codex-hooks/session-start.sh",
  "scripts/codex-mirror.sh",
];

/** Prefixes that must have at least one file: content the program reads at runtime. */
export const REQUIRED_PREFIXES: readonly string[] = ["templates/identity/", "docs/releases/"];

/**
 * What must never ship, by path. Each is a class the first panel named or a
 * file the Zero Python gate forbids. A path matching any of these fails even
 * when it sits under an allowed prefix (a `.test.ts` inside `ts/src/`, say).
 */
export const FORBIDDEN_PATTERNS: readonly { pattern: RegExp; why: string }[] = [
  {
    pattern: /(^|\/)ts\/(test|smoke|evals|parity)\//,
    why: "tests, smokes, evals, and parity tooling",
  },
  { pattern: /\.test\.ts$/, why: "a test file" },
  { pattern: /(^|\/)goldens?\//, why: "a golden" },
  { pattern: /^tmp\//, why: "scratch" },
  { pattern: /(^|\/)\.env(\.|$)/, why: "an environment file" },
  { pattern: /\.(db|sqlite|sqlite3)$/, why: "a database" },
  { pattern: /\.(py|pyc)$/, why: "Python" },
  { pattern: /(^|\/)(pyproject\.toml|uv\.lock|requirements[^/]*\.txt)$/, why: "Python packaging" },
  { pattern: /^(frame|installer)\//, why: "the Windows product" },
  { pattern: /^(spikes|examples)\//, why: "spikes and examples" },
  { pattern: /(^|\/)node_modules\//, why: "dependencies belong to npm, not the tarball" },
  { pattern: /(^|\/)\.git(\/|$)/, why: "git metadata" },
  { pattern: /\.(tgz|zip|exe|dmg)$/, why: "a binary artifact" },
];

/** Lifecycle scripts npm would run on install. Installing Mirror is a file copy. */
export const FORBIDDEN_SCRIPTS: readonly string[] = [
  "preinstall",
  "install",
  "postinstall",
  "prepare",
];

export interface PackManifest {
  name?: unknown;
  version?: unknown;
  private?: unknown;
  bin?: unknown;
  files?: unknown;
  scripts?: unknown;
}

export interface PackInventory {
  /** Paths as `npm pack --dry-run --json` lists them, relative to the package root. */
  readonly files: readonly string[];
  readonly manifest: PackManifest;
}

export interface PackProblem {
  readonly code:
    | "forbidden_path"
    | "unlisted_path"
    | "missing_file"
    | "missing_prefix"
    | "lifecycle_script"
    | "manifest";
  readonly message: string;
}

function allowed(path: string): boolean {
  return ALLOWED_FILES.includes(path) || ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** Every way the inventory departs from the runtime subset, in a stable order. */
export function checkPackContents(inventory: PackInventory): PackProblem[] {
  const problems: PackProblem[] = [];
  const files = [...inventory.files].sort();
  const present = new Set(files);

  for (const path of files) {
    const forbidden = FORBIDDEN_PATTERNS.find(({ pattern }) => pattern.test(path));
    if (forbidden) {
      problems.push({ code: "forbidden_path", message: `${path}: ${forbidden.why}` });
      continue;
    }
    if (!allowed(path)) {
      problems.push({ code: "unlisted_path", message: `${path}: not in the runtime subset` });
    }
  }

  for (const path of REQUIRED_FILES) {
    if (!present.has(path)) problems.push({ code: "missing_file", message: `${path}: required` });
  }
  for (const prefix of REQUIRED_PREFIXES) {
    if (!files.some((path) => path.startsWith(prefix))) {
      problems.push({ code: "missing_prefix", message: `${prefix}: nothing under it` });
    }
  }

  const { manifest } = inventory;
  if (manifest.name !== PACKAGE_NAME) {
    problems.push({
      code: "manifest",
      message: `name: ${JSON.stringify(manifest.name)} is not ${PACKAGE_NAME}`,
    });
  }
  if (manifest.private === true) {
    problems.push({ code: "manifest", message: "private: true; the package cannot be published" });
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    problems.push({ code: "manifest", message: "files: missing; the tarball is not whitelisted" });
  }
  const bin = manifest.bin;
  if (
    typeof bin !== "object" ||
    bin === null ||
    typeof (bin as { mirror?: unknown }).mirror !== "string"
  ) {
    problems.push({ code: "manifest", message: "bin.mirror: missing" });
  } else {
    const entry = (bin as { mirror: string }).mirror.replace(/^\.\//, "");
    if (!present.has(entry)) {
      problems.push({ code: "manifest", message: `bin.mirror: ${entry} is not in the tarball` });
    }
  }
  const scripts = manifest.scripts;
  if (typeof scripts === "object" && scripts !== null) {
    for (const name of FORBIDDEN_SCRIPTS) {
      if (name in scripts) {
        problems.push({
          code: "lifecycle_script",
          message: `scripts.${name}: npm would run it on install; installing Mirror is a file copy`,
        });
      }
    }
  }

  return problems;
}

export function renderPackVerdict(problems: readonly PackProblem[], fileCount: number): string {
  if (problems.length === 0) {
    return `pack contents: clean -- ${fileCount} files, the runtime subset and nothing else; no install script.\n`;
  }
  const lines = problems.map((problem) => `  ${problem.code}: ${problem.message}`);
  return `pack contents: ${problems.length} problem(s)\n${lines.join("\n")}\n`;
}
