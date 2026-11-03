// CR163 — no test makes a temp home under a literal /tmp.
//
// The suite's temp homes are made with `tempDir` (ts/test/helpers/tempDir.ts),
// under os.tmpdir(), and removed when the test file's process exits. The
// run-level check (scripts/test_leaves_nothing.sh) proves a run leaves nothing
// by pointing TMPDIR at an empty directory; it sees every home only because
// none is made anywhere else. A home under a literal /tmp would escape it, so
// this guard keeps one from coming back: every `.ts` under ts/test, helpers and
// support included, in each form the tree has used.
//
// A line that is a comment is not a finding, nor is a /tmp that names a path
// no test creates (an asserted string, a golden's literal). An exception names
// its reason, and one that no longer matches anything is reported as stale, so
// it cannot outlive that reason.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Files allowed a literal /tmp temp home, each with the reason it must stay. */
export const EXCEPTIONS: Readonly<Record<string, string>> = {
  "ts/test/helpers/builderWorld.ts":
    "CR164: pathsWalk sees a leaked absolute path only under a short root",
  "ts/test/scripts/testTempHomes.test.ts": "this guard's own cases, held as strings",
};

/** Each form the tree has used to make a temp home under a literal /tmp. */
const FORMS: readonly RegExp[] = [
  // mkdtempSync("/tmp/…"), a template, the async mkdtemp; the argument may open a new line.
  /\bmkdtemp(?:Sync)?\(\s*["'`]\/tmp\//g,
  // mkdtempSync(join("/tmp", …))
  /\bmkdtemp(?:Sync)?\(\s*join\(\s*["'`]\/tmp["'`]/g,
  // realpathSync("/tmp"), as in mkdtempSync(join(realpathSync("/tmp"), …))
  /\brealpathSync\(\s*["'`]\/tmp["'`]\s*\)/g,
];

export interface TempHomeFinding {
  /** Repository-relative, with forward slashes. */
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

export interface TempHomeSweep {
  readonly findings: readonly TempHomeFinding[];
  /** Exceptions whose file no longer makes such a home. */
  readonly staleExceptions: readonly string[];
}

function isComment(line: string): boolean {
  const text = line.trimStart();
  return text.startsWith("//") || text.startsWith("*") || text.startsWith("/*");
}

function testFiles(repoRoot: string): string[] {
  const testRoot = join(repoRoot, "ts", "test");
  return readdirSync(testRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => relative(repoRoot, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .sort();
}

function scan(source: string): { line: number; text: string }[] {
  const lines = source.split("\n");
  const hits = new Map<number, string>();
  for (const form of FORMS) {
    for (const match of source.matchAll(form)) {
      const line = source.slice(0, match.index).split("\n").length;
      if (!isComment(lines[line - 1])) hits.set(line, lines[line - 1].trim());
    }
  }
  return [...hits].sort(([a], [b]) => a - b).map(([line, text]) => ({ line, text }));
}

/** Every temp home under a literal /tmp in `ts/test` below `repoRoot`, but the exceptions. */
export function findLiteralTmpHomes(
  repoRoot: string,
  exceptions: Readonly<Record<string, string>> = EXCEPTIONS,
): TempHomeSweep {
  const findings: TempHomeFinding[] = [];
  const excepted = new Set<string>();
  for (const file of testFiles(repoRoot)) {
    const hits = scan(readFileSync(join(repoRoot, file), "utf8"));
    if (hits.length === 0) continue;
    if (file in exceptions) {
      excepted.add(file);
      continue;
    }
    for (const hit of hits) findings.push({ file, ...hit });
  }
  const staleExceptions = Object.keys(exceptions).filter((file) => !excepted.has(file));
  return { findings, staleExceptions };
}
