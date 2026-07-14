// Shared CLI scaffold for the parity verify scripts (CR005).
//
// Both ts/parity verify scripts parse `--fixture` / `--debug-sensitive-output`
// and load a JSON fixture; this removes the copy-pasted argValue + load/exit
// boilerplate.

import { readFileSync } from "node:fs";

export interface VerifyArgs {
  fixturePath: string;
  includeSensitiveDebug: boolean;
}

/**
 * Parse `--fixture <path>` and the `--debug-sensitive-output` flag. Prints the
 * given usage and exits 2 when `--fixture` is missing (so callers can rely on a
 * defined `fixturePath`).
 */
export function parseVerifyArgs(usage: string): VerifyArgs {
  const index = process.argv.indexOf("--fixture");
  const fixturePath = index === -1 ? undefined : process.argv[index + 1];
  if (!fixturePath) {
    console.error(usage);
    process.exit(2);
  }
  return {
    fixturePath,
    includeSensitiveDebug: process.argv.includes("--debug-sensitive-output"),
  };
}

/** Load and JSON-parse a fixture file. */
export function loadFixture<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
