// Shared front-door spawn helper for CLI tests (CR009).

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Resolved from this file, not from the cwd: the suite runs from the
// repository root since CV22.DS10.US3 moved the manifest there (D2).
const CLI = fileURLToPath(new URL("../../src/frontDoor/cli.ts", import.meta.url));

export interface FrontDoorResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Spawn the front door with warnings suppressed, optional extra env, and optional stdin content. */
export function spawnFrontDoor(
  args: string[],
  env: Record<string, string> = {},
  input?: string,
): FrontDoorResult {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "--no-warnings", ...env },
    ...(input !== undefined ? { input } : {}),
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
