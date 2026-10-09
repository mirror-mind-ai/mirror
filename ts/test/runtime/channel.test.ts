// CV22.DS10.US3 plateau 4 — `runtime channel [stable|main]` (D9), which pays
// US2's D-027: nothing wrote the package channel file, so a package user
// could not choose a channel without a text editor.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { channelFor, channelPathFor, renderChannel, setChannel } from "#runtime/channel.ts";
import type { InstallKind } from "#runtime/installKind.ts";

function scratch(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "mirror-channel-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function gitInit(dir: string): void {
  execFileSync("git", ["init", "-q", dir]);
}

const PACKAGE: InstallKind = {
  kind: "package",
  root: "/prefix/lib/node_modules/mirror-mind",
  name: "mirror-mind",
  version: "0.31.14",
};

test("a package channel lives beside the user's config file, in a 0700 directory it creates", () => {
  const s = scratch();
  try {
    const env = { XDG_CONFIG_HOME: join(s.root, "xdg") };
    const home = join(s.root, "home");
    assert.equal(
      channelPathFor(PACKAGE, env, home),
      join(s.root, "xdg", "mirror", "update-channel"),
    );

    // Before anything is written: the default, from nowhere.
    assert.deepEqual(channelFor(PACKAGE, env, home), {
      value: "stable",
      source: null,
      note: null,
    });

    const written = setChannel(PACKAGE, "main", env, home);
    assert.equal(written.ok, true, JSON.stringify(written));
    if (!written.ok) return;
    assert.equal(written.path, join(s.root, "xdg", "mirror", "update-channel"));
    assert.equal(readFileSync(written.path, "utf8"), "main\n");
    // `runtime channel` may run before `init`: the directory it creates is the
    // one the env file (0600, holding the API key) will later land in.
    assert.equal(statSync(join(s.root, "xdg", "mirror")).mode & 0o777, 0o700);

    assert.deepEqual(channelFor(PACKAGE, env, home), {
      value: "main",
      source: written.path,
      note: null,
    });
  } finally {
    s.cleanup();
  }
});

test("a clone channel is the checkout's own marker, read back through the clone reader", () => {
  const s = scratch();
  try {
    const repo = join(s.root, "clone");
    gitInit(repo);
    const install: InstallKind = { kind: "clone", repository: repo };
    const env = { XDG_CONFIG_HOME: join(s.root, "xdg") };
    assert.equal(channelPathFor(install, env, s.root), join(repo, ".mirror-update-channel"));

    const written = setChannel(install, "main", env, s.root);
    assert.equal(written.ok, true, JSON.stringify(written));
    if (!written.ok) return;
    assert.equal(readFileSync(join(repo, ".mirror-update-channel"), "utf8"), "main\n");
    assert.equal(channelFor(install, env, s.root).value, "main");
    // The package location was not touched.
    assert.equal(existsSync(join(s.root, "xdg")), false);
  } finally {
    s.cleanup();
  }
});

test("the value is normalized and anything outside the vocabulary is refused before any write", () => {
  const s = scratch();
  try {
    const env = { XDG_CONFIG_HOME: join(s.root, "xdg") };
    const upper = setChannel(PACKAGE, " Main ", env, s.root);
    assert.equal(upper.ok, true);
    assert.equal(channelFor(PACKAGE, env, s.root).value, "main");

    for (const bad of ["beta", "origin/main", "", "--help", "stable\nmain"]) {
      const refused = setChannel(PACKAGE, bad, env, s.root);
      assert.equal(refused.ok, false, bad);
      if (refused.ok) return;
      assert.equal(refused.exitCode, 2, bad);
      assert.match(refused.reason, /choose stable or main/, bad);
    }
    assert.equal(readFileSync(channelPathFor(PACKAGE, env, s.root) ?? "", "utf8"), "main\n");
  } finally {
    s.cleanup();
  }
});

test("an unknown install has nowhere to keep a channel", () => {
  const unknown: InstallKind = { kind: "unknown", reason: "not a git checkout" };
  assert.equal(channelPathFor(unknown, {}, "/nowhere"), null);
  const refused = setChannel(unknown, "main", {}, "/nowhere");
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.equal(refused.exitCode, 1);
  assert.match(refused.reason, /install kind unknown/);
  assert.equal(channelFor(unknown, {}, "/nowhere").note, "install kind unknown");
});

test("the render names the install, the channel, its source, and what it was", () => {
  const shown = renderChannel({
    install: PACKAGE,
    channel: { value: "stable", source: null, note: null },
    written: null,
  });
  assert.equal(
    shown,
    [
      "Mirror runtime update channel",
      "",
      "Install: package (mirror-mind@0.31.14)",
      "Update channel: stable",
      "Source: default",
      "",
    ].join("\n"),
  );

  const changed = renderChannel({
    install: PACKAGE,
    channel: { value: "main", source: "/x/mirror/update-channel", note: null },
    written: { previous: "stable" },
  });
  assert.match(changed, /^Update channel: main \(was stable\)$/m);
  assert.match(changed, /^Source: \/x\/mirror\/update-channel$/m);

  const noted = renderChannel({
    install: PACKAGE,
    channel: {
      value: "stable",
      source: "/x/mirror/update-channel",
      note: "unknown channel 'beta', defaulting to stable",
    },
    written: null,
  });
  assert.match(noted, /^Update channel note: unknown channel 'beta', defaulting to stable$/m);
});

test("a clone's marker written by hand with a trailing newline reads the same as one written here", () => {
  const s = scratch();
  try {
    const repo = join(s.root, "clone");
    gitInit(repo);
    writeFileSync(join(repo, ".mirror-update-channel"), "main\n");
    const install: InstallKind = { kind: "clone", repository: repo };
    assert.equal(channelFor(install, {}, s.root).value, "main");
  } finally {
    s.cleanup();
  }
});
