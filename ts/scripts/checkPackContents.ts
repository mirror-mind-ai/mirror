#!/usr/bin/env node
// Fail CI when the npm tarball would carry anything but the runtime subset,
// when the manifest would let npm run something on install, or when a shipped
// file carries what no shipped file may (FORBIDDEN_CONTENT; first, the
// author's name -- US3 F4).
// CV22.DS10.US3 plateau 1: the artifact half of DS10's Zero Python gate.
//
// Runs `npm pack --dry-run --json` at the repository root -- nothing is
// written -- and grades the inventory with `#guards/packContents.ts`.
//
// Usage:
//   node ts/scripts/checkPackContents.ts

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkPackContents,
  checkPackedContent,
  type PackedFile,
  type PackManifest,
  parsePackDryRun,
  renderPackVerdict,
} from "#guards/packContents.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function packInventory(root: string): { files: string[]; manifest: PackManifest } {
  const raw = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const files = parsePackDryRun(raw);
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as PackManifest;
  return { files, manifest };
}

/** The shipped files' text, read from the tree `npm pack` would pack. */
export function packedContents(root: string, files: readonly string[]): PackedFile[] {
  return files.map((path) => ({ path, content: readFileSync(join(root, path), "utf8") }));
}

function main(): number {
  const inventory = packInventory(REPO_ROOT);
  const problems = [
    ...checkPackContents(inventory),
    ...checkPackedContent(packedContents(REPO_ROOT, inventory.files)),
  ];
  process.stdout.write(renderPackVerdict(problems, inventory.files.length));
  return problems.length === 0 ? 0 : 1;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exitCode = main();
}
