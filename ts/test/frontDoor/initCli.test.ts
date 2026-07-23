import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { spawnFrontDoor } from "../helpers/frontDoor.ts";

function fakeHome(): { home: string; cleanup: () => void } {
  const home = mkdtempSync(join(tmpdir(), "mirror-core-initcli-"));
  return { home, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

test("front door `init <user>` bootstraps a real user home end to end (no DB involved)", () => {
  const { home, cleanup } = fakeHome();
  try {
    const result = spawnFrontDoor(["init", "probeuser"], { HOME: home });
    assert.equal(result.status, 0);
    const identityRoot = join(home, ".mirror", "probeuser", "identity");
    assert.match(result.stdout, /Created user home:/);
    assert.match(result.stdout, /Identity ready at:/);
    assert.match(result.stdout, /uv run python -m memory seed/);
    assert.ok(existsSync(join(identityRoot, "self", "soul.yaml")));
    const soul = readFileSync(join(identityRoot, "self", "soul.yaml"), "utf8");
    assert.ok(soul.includes("probeuser"), "expected {{user_name}} substituted with probeuser");
  } finally {
    cleanup();
  }
});

test("front door `init` on an already-populated home exits 1 without a fabricated traceback", () => {
  const { home, cleanup } = fakeHome();
  try {
    const first = spawnFrontDoor(["init", "probeuser"], { HOME: home });
    assert.equal(first.status, 0);
    const second = spawnFrontDoor(["init", "probeuser"], { HOME: home });
    assert.equal(second.status, 1);
    assert.match(second.stderr, /Identity root already exists and is not empty/);
  } finally {
    cleanup();
  }
});

test("front door `init` requires a user argument", () => {
  const result = spawnFrontDoor(["init"]);
  assert.equal(result.status, 2);
});
