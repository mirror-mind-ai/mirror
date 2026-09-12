import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";

const CLI = "src/frontDoor/cli.ts";

// A SYNTHETIC command name, deliberately. These tests probe the fallback
// MECHANISM -- spawn failure and timeout -- not any particular command, and
// naming a real one has now broken them twice: `tasks` when DS7.US2 ported its
// list form, then `journal` when DS8.US3 flipped it live. An unknown command
// routes to Python by definition ("command not ported to TS") and no future
// port can claim it.
const UNPORTED = ["not-a-real-mirror-command", "argument for the fallback failure-mode probe"];

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
