#!/usr/bin/env node
// Fail CI when a test makes a temp home under a literal /tmp (CR163).
//
// The run-level check, scripts/test_leaves_nothing.sh, proves a run of the
// suite leaves nothing by pointing TMPDIR at an empty directory. A home made
// under a literal /tmp escapes that directory, so this guard is what lets the
// check see every one. The rule and its exceptions live in
// ts/src/guards/testTempHomes.ts.
//
// Usage:
//   node ts/scripts/checkTestTempHomes.ts

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EXCEPTIONS, findLiteralTmpHomes } from "#guards/testTempHomes.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function main(): number {
  const { findings, staleExceptions } = findLiteralTmpHomes(REPO_ROOT);

  if (findings.length > 0 || staleExceptions.length > 0) {
    console.log("temp-home check: LITERAL /tmp FOUND\n");
    for (const finding of findings) {
      console.log(`  ${finding.file}:${finding.line}: ${finding.text}`);
    }
    for (const file of staleExceptions) {
      console.log(`  ${file}: a stale exception, it makes no such home any more`);
    }
    console.log(
      "\nRemediation: make the home with tempDir (#helpers/tempDir.ts), which puts it" +
        "\nunder os.tmpdir() and removes it when the file's process exits. Remove a" +
        "\nstale exception from EXCEPTIONS in ts/src/guards/testTempHomes.ts.",
    );
    return 1;
  }

  const excepted = Object.entries(EXCEPTIONS)
    .map(([file, reason]) => `${file} (${reason.split(":")[0]})`)
    .join(", ");
  console.log(
    `temp-home check: clean -- no test makes a temp home under a literal /tmp; excepted: ${excepted}.`,
  );
  return 0;
}

process.exit(main());
