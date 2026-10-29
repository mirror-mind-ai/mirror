// CR185 — Leandro's path on PR #42, through the real front door.
//
// He moved from a clone to the package. His home was still under
// ~/.mirror-minds, but his configuration lived only in the clone's `.env`,
// which a package does not read. `runtime update` then stopped on "Mirror home
// is not configured. Set MIRROR_HOME or MIRROR_USER", which named neither the
// file a package reads nor a route that would have worked. Every surface now
// prints one sentence: the command that finishes the job, and the file that
// command writes.

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { spawnFrontDoor } from "#helpers/frontDoor.ts";
import { tempDir } from "#helpers/tempDir.ts";

// The empty strings shadow the checkout's own `.env`, which the front door
// reads from its entry path. XDG_CONFIG_HOME too, because GitHub's runners set it.
const NO_USER = { MIRROR_USER: "", MIRROR_HOME: "", XDG_CONFIG_HOME: "" };

/** A scratch OS home holding one Mirror home, `leandro`, and no configuration. */
function movedFromAClone(): { home: string; sentence: string } {
  const home = tempDir("home-not-configured-");
  const identity = join(home, ".mirror-minds", "leandro", "identity", "self");
  mkdirSync(identity, { recursive: true });
  writeFileSync(join(identity, "soul.yaml"), "soul\n");
  const config = join(home, ".config", "mirror", "env");
  const sentence =
    "Mirror home is not configured. " +
    `To use the home at ${join(home, ".mirror-minds", "leandro")}, run: mirror init leandro ` +
    `(it writes MIRROR_USER=leandro to ${config}).`;
  return { home, sentence };
}

test("`runtime update --dry-run`, his command, names the home and the command that finishes the job", () => {
  const { home, sentence } = movedFromAClone();
  const result = spawnFrontDoor(["runtime", "update", "--dry-run"], { HOME: home, ...NO_USER });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stderr, `${sentence}\n`);
});

test("`runtime migrate` prints the same sentence", () => {
  const { home, sentence } = movedFromAClone();
  const result = spawnFrontDoor(["runtime", "migrate"], { HOME: home, ...NO_USER });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stderr, `${sentence}\n`);
});

test("`runtime status` reports the same sentence as its Mirror home note", () => {
  const { home, sentence } = movedFromAClone();
  const result = spawnFrontDoor(["runtime", "status"], { HOME: home, ...NO_USER });
  assert.match(result.stdout, /^Mirror home: not configured$/m);
  assert.ok(result.stdout.includes(`\nMirror home note: ${sentence}\n`), result.stdout);
});

test("an ordinary command prints it after the front door's prefix", () => {
  const { home, sentence } = movedFromAClone();
  const result = spawnFrontDoor(["journeys"], { HOME: home, ...NO_USER });
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stderr, `Mirror TS front door: ${sentence}\n`);
});
