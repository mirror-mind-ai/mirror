import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";

const CLI = "src/frontDoor/cli.ts";

// `tasks` is not a TS route, so it always takes the Python fallback.
const UNPORTED = ["tasks"];

test("fallback prints actionable guidance when uv is not on PATH (was: silent exit 1)", () => {
  const result = spawnSync(process.execPath, [CLI, ...UNPORTED], {
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "--no-warnings", PATH: "/nonexistent-path-for-test" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not spawn `uv`/);
  assert.match(result.stderr, /PATH/);
});

test("fallback terminates a hung Python process and names the timeout", () => {
  if (process.platform === "win32") return; // POSIX shell-script stub
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-fakeuv-"));
  try {
    const fakeUv = join(dir, "uv");
    writeFileSync(fakeUv, "#!/bin/sh\nsleep 5\n");
    chmodSync(fakeUv, 0o755);
    const result = spawnSync(process.execPath, [CLI, ...UNPORTED], {
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_OPTIONS: "--no-warnings",
        PATH: `${dir}${delimiter}${process.env.PATH ?? ""}`,
        MIRROR_FRONTDOOR_PYTHON_TIMEOUT_MS: "200",
      },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /timed out after 200ms/);
    assert.match(result.stderr, /MIRROR_FRONTDOOR_PYTHON_TIMEOUT_MS/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
