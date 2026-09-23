#!/usr/bin/env node
// Fail CI when a surface CV22.DS10 retired comes back, or never fully left.
//
// The Node port of `scripts/check_retired_surfaces.py` (CV22.DS10.TS5, slice
// B). Both run side by side for one commit and must agree -- same exit code,
// byte-identical stdout -- before the Python original is deleted.
//
// stdout is the comparable surface, so the staged-row note goes to STDERR:
// the Node version knows about a row the Python one never will, and that extra
// knowledge must not break the agreement that grades the port.
//
// Usage:
//   node ts/scripts/checkRetiredSurfaces.ts

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ENFORCED, STAGED, sweep } from "#guards/retiredSurfaces.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function main(): number {
  const problems = sweep(REPO_ROOT, ENFORCED);

  for (const surface of STAGED) {
    console.error(
      `note: '${surface.surfaceId}' is staged, not enforced -- goes live at ${surface.stagedUntil}.`,
    );
  }

  if (problems.length > 0) {
    console.log("retired-surface check: RESIDUE FOUND\n");
    console.log(problems.map((problem) => problem.message).join("\n"));
    console.log(
      "\nRemediation: finish the deletion, or -- if the mention is deliberate and" +
        "\npermanent -- add the path to that surface's `exemptions` with the reason." +
        "\nAn exemption is a claim that a mention is correct, so it must say why.",
    );
    return 1;
  }

  const surfaces = ENFORCED.map((surface) => surface.surfaceId).join(", ");
  console.log(`retired-surface check: clean -- ${surfaces} stayed retired.`);
  return 0;
}

process.exit(main());
