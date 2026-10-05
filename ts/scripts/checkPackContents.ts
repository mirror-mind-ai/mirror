#!/usr/bin/env node
// Fail CI when the npm tarball would carry anything but the runtime subset,
// or when the manifest would let npm run something on install.
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

import { checkPackContents, type PackManifest, renderPackVerdict } from "#guards/packContents.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function packInventory(root: string): { files: string[]; manifest: PackManifest } {
  const raw = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const parsed = JSON.parse(raw) as { files: { path: string }[] }[];
  const files = (parsed[0]?.files ?? []).map((entry) => entry.path);
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as PackManifest;
  return { files, manifest };
}

function main(): number {
  const inventory = packInventory(REPO_ROOT);
  const problems = checkPackContents(inventory);
  process.stdout.write(renderPackVerdict(problems, inventory.files.length));
  return problems.length === 0 ? 0 : 1;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exitCode = main();
}
