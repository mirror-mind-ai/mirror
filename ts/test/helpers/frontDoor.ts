// Shared front-door spawn helper for CLI tests (CR009).

import { spawnSync } from "node:child_process";

const CLI = "src/frontDoor/cli.ts";

export interface FrontDoorResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Spawn the front door with warnings suppressed and optional extra env. */
export function spawnFrontDoor(args: string[], env: Record<string, string> = {}): FrontDoorResult {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "--no-warnings", ...env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
