import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { spawnFrontDoor } from "#helpers/frontDoor.ts";

function fakeHome(): { home: string; cleanup: () => void } {
  const home = mkdtempSync(join(tmpdir(), "mirror-core-initcli-"));
  return { home, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

// The shell sets neither MIRROR_USER nor MIRROR_HOME, and the empty strings
// shadow the checkout's own `.env` (the front door reads it from its entry
// path since CV22.DS10.US3 D3, so an unset variable would be filled from it).
// XDG_CONFIG_HOME too: GitHub's runners set it, and the config file would land
// there instead of under the fake HOME.
const NO_USER = { MIRROR_USER: "", MIRROR_HOME: "", XDG_CONFIG_HOME: "" };

test("front door `init <user>` bootstraps a real user home end to end (no DB involved)", () => {
  const { home, cleanup } = fakeHome();
  try {
    const result = spawnFrontDoor(["init", "probeuser"], { HOME: home, ...NO_USER });
    assert.equal(result.status, 0);
    // The modern home, the one MIRROR_USER resolves to without a legacy
    // warning (US3 D14). Python's init wrote `~/.mirror/<user>` and told the
    // person to set MIRROR_HOME by hand.
    const identityRoot = join(home, ".mirror-minds", "probeuser", "identity");
    assert.match(result.stdout, /Created user home:/);
    assert.match(result.stdout, /Identity ready at:/);
    assert.match(result.stdout, /Run: mirror seed\n/);
    assert.match(result.stdout, / {2}mirror identity edit user identity\n/);
    assert.ok(existsSync(join(identityRoot, "self", "soul.yaml")));
    const soul = readFileSync(join(identityRoot, "self", "soul.yaml"), "utf8");
    assert.ok(soul.includes("probeuser"), "expected {{user_name}} substituted with probeuser");
  } finally {
    cleanup();
  }
});

test("`init` on a machine with no user configured writes MIRROR_USER into the config file (D3)", () => {
  const { home, cleanup } = fakeHome();
  try {
    const result = spawnFrontDoor(["init", "probeuser"], { HOME: home, ...NO_USER });
    assert.equal(result.status, 0, result.stderr);
    const config = join(home, ".config", "mirror", "env");
    assert.equal(readFileSync(config, "utf8"), "MIRROR_USER=probeuser\n");
    assert.equal(statSync(config).mode & 0o777, 0o600);
    assert.equal(statSync(join(home, ".config", "mirror")).mode & 0o777, 0o700);
    // The person is told where the file is and that the key goes there by
    // hand; the command never takes a key from argv.
    assert.match(
      result.stdout,
      new RegExp(`Configuration: ${config.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
    assert.match(result.stdout, /OPENROUTER_API_KEY/);
    assert.doesNotMatch(result.stdout, /Add to your \.env/);
    // That the next command reads the file is config.test.ts's claim; through
    // this checkout's entry the tree's own `.env` would be read first.
  } finally {
    cleanup();
  }
});

test("`init` with a user already configured leaves the config file alone", () => {
  // A second mirror on the same machine: the person runs it with MIRROR_USER
  // in the shell, as before. init must not silently switch the default.
  const { home, cleanup } = fakeHome();
  try {
    const result = spawnFrontDoor(["init", "second"], {
      HOME: home,
      MIRROR_USER: "first",
      MIRROR_HOME: "",
      XDG_CONFIG_HOME: "",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!existsSync(join(home, ".config", "mirror", "env")));
    assert.match(result.stdout, /MIRROR_USER=second/);
  } finally {
    cleanup();
  }
});

test("front door `init` on an already-populated home exits 1 without a fabricated traceback", () => {
  const { home, cleanup } = fakeHome();
  try {
    const first = spawnFrontDoor(["init", "probeuser"], { HOME: home, ...NO_USER });
    assert.equal(first.status, 0);
    const second = spawnFrontDoor(["init", "probeuser"], { HOME: home, ...NO_USER });
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
