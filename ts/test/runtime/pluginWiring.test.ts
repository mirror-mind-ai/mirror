// CV21.DS4.TS6 — the plugin wiring readers, and the findings/hints built on
// them.
//
// Codex copies the plugin into its cache at a version
// (`$CODEX_HOME/plugins/cache/mirror-mind/mirror-mind/<version>`), so an npm
// update leaves that copy behind until the user re-adds it. Claude Code links
// the plugin in place (`~/.claude/skills/mirror-mind`), so its failure mode is
// a dangling link, not a stale copy.
//
// Every reader takes its root as an argument — the defaulting happens at the
// diagnose entry, never in here. That is the CR123/128/137/142 lesson: a
// maintainer's machine has a real ~/.codex and a real ~/.claude, and a test
// that can see them is a test that fails only where maintainers work.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { pluginWiringFindings } from "#runtime/diagnose.ts";
import {
  claudePluginLinkState,
  codexPluginCacheState,
  installedPluginVersion,
} from "#runtime/pluginWiring.ts";
import { CODEX_PLUGIN_ADD_COMMAND, RUNTIME_WIRING } from "#runtime/wiring.ts";

const roots: string[] = [];

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "plugin-wiring-"));
  roots.push(root);
  return root;
}

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function codexHomeWith(versions: readonly string[]): string {
  const home = join(scratch(), "codex-home");
  const cache = join(home, "plugins", "cache", "mirror-mind", "mirror-mind");
  mkdirSync(cache, { recursive: true });
  for (const version of versions) mkdirSync(join(cache, version));
  return home;
}

// --- the Codex cache reader --------------------------------------------------

test("an absent cache is absent — a machine with no Codex wiring is not drift", () => {
  const home = join(scratch(), "codex-home");
  assert.equal(codexPluginCacheState(home, "0.33.4").state, "absent");
  // An empty cache directory (Codex leaves one behind after plugin remove,
  // US1's review) is absence too.
  assert.equal(codexPluginCacheState(codexHomeWith([]), "0.33.4").state, "absent");
});

test("a cache at the installed version is current", () => {
  const state = codexPluginCacheState(codexHomeWith(["0.33.4"]), "0.33.4");
  assert.equal(state.state, "current");
  assert.equal(state.newestCached, "0.33.4");
});

test("a cache behind the installed version is behind, by its newest copy", () => {
  const state = codexPluginCacheState(codexHomeWith(["0.31.0", "0.33.1"]), "0.33.4");
  assert.equal(state.state, "behind");
  assert.equal(state.newestCached, "0.33.1");
});

test("versions compare as semver, not as strings — 0.33.10 is newer than 0.33.4", () => {
  // A lexicographic sort reads 0.33.10 < 0.33.4 and would call this behind.
  const state = codexPluginCacheState(codexHomeWith(["0.33.10", "0.33.4"]), "0.33.10");
  assert.equal(state.state, "current");
  assert.equal(state.newestCached, "0.33.10");
});

test("a cache ahead of the installed version is ahead — and ahead is silence, not behind", () => {
  // `runtime update` refuses downgrades, but `npm install -g mirror-mind@old`
  // does not ask. The person who downgraded on purpose needs no Codex advice
  // from the older tree.
  const state = codexPluginCacheState(codexHomeWith(["0.34.0"]), "0.33.4");
  assert.equal(state.state, "ahead");
});

test("directory names that are not versions are ignored; only garbage is absence", () => {
  const state = codexPluginCacheState(codexHomeWith(["tmp-download", "0.33.1"]), "0.33.4");
  assert.equal(state.state, "behind");
  assert.equal(state.newestCached, "0.33.1");
  assert.equal(codexPluginCacheState(codexHomeWith(["tmp-download"]), "0.33.4").state, "absent");
});

test("the reader sees only the home it is handed — the machine's real ~/.codex cannot leak", () => {
  // The strict-injection seam: on a maintainer's machine with a real Codex
  // cache, a fixture home must still read as absent. The reader takes a path
  // and consults no environment.
  const emptyFixture = join(scratch(), "fixture-codex-home");
  const before = process.env.CODEX_HOME;
  process.env.CODEX_HOME = codexHomeWith(["0.1.0"]);
  try {
    assert.equal(codexPluginCacheState(emptyFixture, "0.33.4").state, "absent");
  } finally {
    if (before === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = before;
  }
});

// --- the Claude link reader ----------------------------------------------------

test("no link is absent — an unwired Claude Code is not drift", () => {
  const home = join(scratch(), "claude-home");
  assert.equal(claudePluginLinkState(home).state, "absent");
});

test("a link whose target reads is healthy — even when it points at another tree", () => {
  // The documented silence (TS6 plan): a link resolving to an *old* install
  // tree still reads, and this story does not chase where it points. Healthy
  // means the target reads; a stale-target finding is a one-line amendment
  // to this reader if it bites.
  const root = scratch();
  const target = join(root, "some-old-install", "plugins", "mirror-mind");
  mkdirSync(target, { recursive: true });
  const home = join(root, "claude-home");
  mkdirSync(join(home, "skills"), { recursive: true });
  symlinkSync(target, join(home, "skills", "mirror-mind"));
  const state = claudePluginLinkState(home);
  assert.equal(state.state, "healthy");
  assert.equal(state.target, target);
});

test("a link whose target is gone is dangling", () => {
  const root = scratch();
  const target = join(root, "removed-install", "plugins", "mirror-mind");
  const home = join(root, "claude-home");
  mkdirSync(join(home, "skills"), { recursive: true });
  symlinkSync(target, join(home, "skills", "mirror-mind"));
  const state = claudePluginLinkState(home);
  assert.equal(state.state, "dangling");
  assert.equal(state.target, target);
});

test("a plain directory at the link path is healthy — a copied plugin still reads", () => {
  const home = join(scratch(), "claude-home");
  mkdirSync(join(home, "skills", "mirror-mind"), { recursive: true });
  const state = claudePluginLinkState(home);
  assert.equal(state.state, "healthy");
  assert.equal(state.target, null);
});

// --- the installed plugin version ---------------------------------------------

test("the installed plugin version reads from the tree's generated manifest", () => {
  // plugin.json is generated by claudePlugin.ts from packageVersion(), and
  // the guard holds the committed manifest equal to the generated one — the
  // file is the authority, not an assumption.
  const root = scratch();
  const manifestDir = join(root, "plugins", "mirror-mind", ".claude-plugin");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(join(manifestDir, "plugin.json"), JSON.stringify({ version: "0.33.4" }));
  assert.equal(installedPluginVersion(root), "0.33.4");
});

test("a tree without the manifest, or with an unreadable one, has no version", () => {
  const root = scratch();
  assert.equal(installedPluginVersion(root), null);
  const manifestDir = join(root, "plugins", "mirror-mind", ".claude-plugin");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(join(manifestDir, "plugin.json"), "not json");
  assert.equal(installedPluginVersion(root), null);
});

// --- the diagnose findings ------------------------------------------------------

function installRootAt(version: string): string {
  const root = join(scratch(), "install");
  const manifestDir = join(root, "plugins", "mirror-mind", ".claude-plugin");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(join(manifestDir, "plugin.json"), JSON.stringify({ version }));
  return root;
}

test("a stale Codex cache is a warning naming both versions and the re-add command", () => {
  const codexHome = codexHomeWith(["0.31.0"]);
  const findings = pluginWiringFindings(installRootAt("0.33.4"), {
    CODEX_HOME: codexHome,
    HOME: join(scratch(), "unused-home"),
  });
  const finding = findings.find((entry) => entry.code === "codex_plugin_cache_behind");
  assert.ok(finding, "the finding fires");
  assert.equal(finding.severity, "warning");
  assert.match(finding.detail, /0\.31\.0/);
  assert.match(finding.detail, /0\.33\.4/);
  assert.ok(finding.recommendation.includes(CODEX_PLUGIN_ADD_COMMAND));
  assert.ok(finding.repair_route.includes(CODEX_PLUGIN_ADD_COMMAND));
});

test("absence, a current cache, and an ahead cache are silence", () => {
  const home = join(scratch(), "empty-home");
  // Absent: no cache at all.
  assert.deepEqual(pluginWiringFindings(installRootAt("0.33.4"), { HOME: home }), []);
  // Current.
  assert.deepEqual(
    pluginWiringFindings(installRootAt("0.33.4"), {
      CODEX_HOME: codexHomeWith(["0.33.4"]),
      HOME: home,
    }),
    [],
  );
  // Ahead: the deliberate downgrade gets no Codex advice from the older tree.
  assert.deepEqual(
    pluginWiringFindings(installRootAt("0.33.4"), {
      CODEX_HOME: codexHomeWith(["0.34.0"]),
      HOME: home,
    }),
    [],
  );
});

test("CODEX_HOME is honored; else ~/.codex under the given HOME — never the process env", () => {
  const root = scratch();
  const home = join(root, "home");
  const cache = join(home, ".codex", "plugins", "cache", "mirror-mind", "mirror-mind", "0.1.0");
  mkdirSync(cache, { recursive: true });
  const findings = pluginWiringFindings(installRootAt("0.33.4"), { HOME: home });
  assert.ok(findings.some((entry) => entry.code === "codex_plugin_cache_behind"));
  // No HOME and no CODEX_HOME: nothing to read, nothing to claim.
  assert.deepEqual(pluginWiringFindings(installRootAt("0.33.4"), {}), []);
});

test("a dangling Claude link is a warning with a relink route; healthy and absent are silence", () => {
  const root = scratch();
  const home = join(root, "home");
  const target = join(root, "removed-install", "plugins", "mirror-mind");
  mkdirSync(join(home, ".claude", "skills"), { recursive: true });
  symlinkSync(target, join(home, ".claude", "skills", "mirror-mind"));
  const findings = pluginWiringFindings(installRootAt("0.33.4"), { HOME: home });
  const finding = findings.find((entry) => entry.code === "claude_plugin_link_dangling");
  assert.ok(finding, "the finding fires");
  assert.equal(finding.severity, "warning");
  assert.match(finding.detail, /removed-install/);
  assert.match(finding.recommendation, /ln -s/);
});

test("no install root means no version authority — the Codex check stays silent, not wrong", () => {
  const findings = pluginWiringFindings(null, {
    CODEX_HOME: codexHomeWith(["0.31.0"]),
    HOME: join(scratch(), "home"),
  });
  assert.ok(!findings.some((entry) => entry.code === "codex_plugin_cache_behind"));
});

// --- one command string, everywhere --------------------------------------------

test("the re-add command is the wiring's own line — diagnose and init cannot disagree", () => {
  // The CR071 lesson at the string level: the recommendation diagnose prints
  // and the wiring line `mirror init` prints are the same constant.
  const wiringLines = RUNTIME_WIRING.codex.steps.flatMap((step) => step("/any/root"));
  assert.ok(wiringLines.includes(CODEX_PLUGIN_ADD_COMMAND));
  assert.equal(CODEX_PLUGIN_ADD_COMMAND, "codex plugin add mirror-mind@mirror-mind");
});
