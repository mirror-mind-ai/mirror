#!/usr/bin/env node
// Fail CI when a surface CV22.DS10 retired comes back, or never fully left.
//
// The Node port of `scripts/check_retired_surfaces.py` (CV22.DS10.TS5, slice
// B). The two ran side by side and agreed -- same exit code, byte-identical
// stdout, clean tree and seeded regressions -- before the Python original was
// deleted at plateau 3. The guard outlived the deletion it proves, which was
// the reason it had to be ported at all.
//
// A staged row's note goes to STDERR, so stdout stays the verdict alone.
//
// Usage:
//   node ts/scripts/checkRetiredSurfaces.ts

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { routeByFamily } from "#frontDoor/routing.ts";
import { shadowedRetiredRoutes } from "#guards/retiredRouteShadows.ts";
import { ENFORCED, STAGED, sweep } from "#guards/retiredSurfaces.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function main(): number {
  // Files first, then the router: a retired surface can come back as a file,
  // as a mention, or as a family branch that still answers it underneath the
  // retired entry (CV22.DS10.TS5, inventory F2). The last kind is invisible to
  // a file scan, because the file that holds it is exempt for naming the
  // surfaces it retires.
  const problems = [
    ...sweep(REPO_ROOT, ENFORCED),
    ...shadowedRetiredRoutes((argv) => routeByFamily(argv, {})).map((shadowed) => ({
      surfaceId: "routing",
      message: `  routing: '${shadowed.surface}' is still claimed by a family branch underneath its retired entry (${shadowed.reason})`,
    })),
  ];

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
