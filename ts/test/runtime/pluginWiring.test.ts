// CV21.DS4.TS6 — the plugin wiring readers, and the findings/hints built on
// them.
//
// Codex copies the plugin into its cache at a version
// (`$CODEX_HOME/plugins/cache/mirror-mind/mirror-mind/<version>`), so an npm
// update leaves that copy behind until the user re-adds it. Claude Code links
// the plugin in place (`~/.claude/skills/mirror-mind`), so its failure mode is
// a dangling link, not a stale copy.
//
// Grok (CV21.DS10.US1) copies a local-path plugin under
// `~/.grok/installed-plugins/<name>-<hash of the source path string>/` and
// records it in `installed-plugins/registry.json`; `grok plugin update` is a
// no-op for that copy and a respelt path installs a second one. Its rules
// link (`~/.grok/rules/mirror-mind.md`) is Claude's link shape again.
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
  codexPluginCacheState,
  grokPluginCopyState,
  installedPluginVersion,
  pluginLinkState,
} from "#runtime/pluginWiring.ts";
import {
  CODEX_PLUGIN_ADD_COMMAND,
  grokPluginReinstallCommand,
  RUNTIME_WIRING,
} from "#runtime/wiring.ts";

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

// --- the link reader (Claude Code's plugin link, Grok's rules link) ------------

const claudeLink = (home: string) => pluginLinkState(join(home, "skills", "mirror-mind"));

test("no link is absent — an unwired Claude Code is not drift", () => {
  const home = join(scratch(), "claude-home");
  assert.equal(claudeLink(home).state, "absent");
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
  const state = claudeLink(home);
  assert.equal(state.state, "healthy");
  assert.equal(state.target, target);
});

test("a link whose target is gone is dangling", () => {
  const root = scratch();
  const target = join(root, "removed-install", "plugins", "mirror-mind");
  const home = join(root, "claude-home");
  mkdirSync(join(home, "skills"), { recursive: true });
  symlinkSync(target, join(home, "skills", "mirror-mind"));
  const state = claudeLink(home);
  assert.equal(state.state, "dangling");
  assert.equal(state.target, target);
});

test("a plain directory at the link path is healthy — a copied plugin still reads", () => {
  const home = join(scratch(), "claude-home");
  mkdirSync(join(home, "skills", "mirror-mind"), { recursive: true });
  const state = claudeLink(home);
  assert.equal(state.state, "healthy");
  assert.equal(state.target, null);
});

test("the same reader reads a file link — Grok's rule is one (CV21.DS10.US1)", () => {
  // ~/.grok/rules/mirror-mind.md -> <pkg>/AGENTS.md: a link to a FILE, which
  // Grok loads as a global rule. Dangling, Grok loads nothing and says nothing.
  const root = scratch();
  const target = join(root, "install", "AGENTS.md");
  mkdirSync(join(root, "install"), { recursive: true });
  writeFileSync(target, "# rules\n");
  const rules = join(root, "grok-home", "rules");
  mkdirSync(rules, { recursive: true });
  symlinkSync(target, join(rules, "mirror-mind.md"));
  assert.equal(pluginLinkState(join(rules, "mirror-mind.md")).state, "healthy");
  rmSync(target);
  assert.equal(pluginLinkState(join(rules, "mirror-mind.md")).state, "dangling");
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

// --- the Grok copy reader (CV21.DS10.US1) --------------------------------------

/**
 * A Grok home with `installed-plugins/registry.json` as grok 1.0.62 writes
 * it, and one copy per entry carrying `.claude-plugin/plugin.json` at the
 * version given. `null` leaves a copy without its manifest.
 */
function grokHomeWith(
  copies: readonly { key: string; version: string | null; plugin?: string }[],
): string {
  const home = join(scratch(), "grok-home");
  const installed = join(home, "installed-plugins");
  mkdirSync(installed, { recursive: true });
  const repos: Record<string, unknown> = {};
  for (const copy of copies) {
    const path = join(installed, copy.key);
    mkdirSync(join(path, ".claude-plugin"), { recursive: true });
    if (copy.version !== null) {
      writeFileSync(
        join(path, ".claude-plugin", "plugin.json"),
        JSON.stringify({ name: "mirror-mind", version: copy.version }),
      );
    }
    repos[copy.key] = {
      kind: { type: "Local", source_path: `/some/prefix/${copy.key}` },
      path,
      plugins: { [copy.plugin ?? "mirror-mind"]: {} },
    };
  }
  writeFileSync(join(installed, "registry.json"), JSON.stringify({ version: 1, repos }));
  return home;
}

test("no registry, or a registry with no Mirror entry, is absent — an unwired Grok is not drift", () => {
  assert.equal(grokPluginCopyState(join(scratch(), "grok-home"), "0.35.0").state, "absent");
  const other = grokHomeWith([
    { key: "deploy-tools-1234abcd", version: "1.0.0", plugin: "deploy-tools" },
  ]);
  assert.equal(grokPluginCopyState(other, "0.35.0").state, "absent");
});

test("a copy at the installed version is current, and names its path", () => {
  const home = grokHomeWith([{ key: "mirror-mind-6453a858", version: "0.35.0" }]);
  const state = grokPluginCopyState(home, "0.35.0");
  assert.equal(state.state, "current");
  assert.equal(state.copies.length, 1);
  assert.equal(state.newestCopied, "0.35.0");
  assert.match(state.copies[0]?.path ?? "", /installed-plugins\/mirror-mind-6453a858$/);
});

test("a copy behind the installed version is behind — the copy Grok runs is the old one", () => {
  const state = grokPluginCopyState(
    grokHomeWith([{ key: "mirror-mind-6453a858", version: "0.34.0" }]),
    "0.35.0",
  );
  assert.equal(state.state, "behind");
  assert.equal(state.newestCopied, "0.34.0");
});

test("a copy ahead is ahead — silence for the deliberate downgrade, as with Codex", () => {
  const state = grokPluginCopyState(
    grokHomeWith([{ key: "mirror-mind-6453a858", version: "0.36.0" }]),
    "0.35.0",
  );
  assert.equal(state.state, "ahead");
});

test("two copies are counted — a respelt install path keys a second one, and Grok loads one of them", () => {
  const home = grokHomeWith([
    { key: "mirror-mind-6453a858", version: "0.35.0" },
    { key: "mirror-mind-54288174", version: "0.34.0" },
  ]);
  const state = grokPluginCopyState(home, "0.35.0");
  assert.equal(state.copies.length, 2);
  // Judged by the newest copy, as Codex's cache is; the duplicate is its own finding.
  assert.equal(state.state, "current");
  assert.equal(state.newestCopied, "0.35.0");
});

test("a copy without its manifest, or an unparseable registry, claims nothing", () => {
  const noManifest = grokHomeWith([{ key: "mirror-mind-6453a858", version: null }]);
  assert.equal(grokPluginCopyState(noManifest, "0.35.0").state, "absent");
  const home = join(scratch(), "grok-home");
  mkdirSync(join(home, "installed-plugins"), { recursive: true });
  writeFileSync(join(home, "installed-plugins", "registry.json"), "not json");
  assert.equal(grokPluginCopyState(home, "0.35.0").state, "absent");
});

test("a stale Grok copy is a warning naming both versions and the reinstall command with the printed path", () => {
  const install = installRootAt("0.35.0");
  const findings = pluginWiringFindings(install, {
    GROK_HOME: join(
      grokHomeWith([{ key: "mirror-mind-6453a858", version: "0.34.0" }]),
      ".grok-as-GROK_HOME",
    ),
    HOME: join(scratch(), "unused-home"),
  });
  // GROK_HOME above points at a directory that does not exist: nothing fires.
  assert.ok(!findings.some((entry) => entry.code === "grok_plugin_copy_behind"));
  const grokHome = grokHomeWith([{ key: "mirror-mind-6453a858", version: "0.34.0" }]);
  const fired = pluginWiringFindings(install, {
    GROK_HOME: grokHome,
    HOME: join(scratch(), "unused-home"),
  });
  const finding = fired.find((entry) => entry.code === "grok_plugin_copy_behind");
  assert.ok(finding, "the finding fires");
  assert.equal(finding.severity, "warning");
  assert.match(finding.detail, /0\.34\.0/);
  assert.match(finding.detail, /0\.35\.0/);
  assert.equal(finding.repair_route, grokPluginReinstallCommand(install));
  assert.ok(finding.recommendation.includes(grokPluginReinstallCommand(install)));
});

test("two Grok copies are a warning of their own, naming both and the way down to one", () => {
  const install = installRootAt("0.35.0");
  const grokHome = grokHomeWith([
    { key: "mirror-mind-6453a858", version: "0.35.0" },
    { key: "mirror-mind-54288174", version: "0.35.0" },
  ]);
  const findings = pluginWiringFindings(install, {
    GROK_HOME: grokHome,
    HOME: join(scratch(), "unused-home"),
  });
  const finding = findings.find((entry) => entry.code === "grok_plugin_copies_duplicated");
  assert.ok(finding, "the finding fires");
  assert.match(finding.detail, /mirror-mind-6453a858/);
  assert.match(finding.detail, /mirror-mind-54288174/);
  assert.match(finding.recommendation, /uninstall/);
  assert.ok(finding.recommendation.includes(grokPluginReinstallCommand(install)));
  // Current, so no behind finding beside it.
  assert.ok(!findings.some((entry) => entry.code === "grok_plugin_copy_behind"));
});

test("a dangling Grok rules link is a warning with a relink route; healthy and absent are silence", () => {
  const root = scratch();
  const home = join(root, "home");
  mkdirSync(join(home, ".grok", "rules"), { recursive: true });
  symlinkSync(
    join(root, "removed-install", "AGENTS.md"),
    join(home, ".grok", "rules", "mirror-mind.md"),
  );
  const findings = pluginWiringFindings(installRootAt("0.35.0"), { HOME: home });
  const finding = findings.find((entry) => entry.code === "grok_rules_link_dangling");
  assert.ok(finding, "the finding fires");
  assert.equal(finding.severity, "warning");
  assert.match(finding.detail, /removed-install/);
  assert.match(finding.recommendation, /ln -s .*AGENTS\.md.*~\/\.grok\/rules\/mirror-mind\.md/);
  // Healthy: the target reads.
  const healthy = join(root, "home2");
  mkdirSync(join(healthy, ".grok", "rules"), { recursive: true });
  writeFileSync(join(root, "AGENTS.md"), "# rules\n");
  symlinkSync(join(root, "AGENTS.md"), join(healthy, ".grok", "rules", "mirror-mind.md"));
  assert.ok(
    !pluginWiringFindings(installRootAt("0.35.0"), { HOME: healthy }).some((e) =>
      e.code.startsWith("grok_"),
    ),
  );
});

test("GROK_HOME is honored; else ~/.grok under the given HOME; absence everywhere is silence", () => {
  const root = scratch();
  const home = join(root, "home");
  const grokHome = grokHomeWith([{ key: "mirror-mind-6453a858", version: "0.1.0" }]);
  // Under HOME/.grok.
  mkdirSync(home, { recursive: true });
  symlinkSync(grokHome, join(home, ".grok"));
  assert.ok(
    pluginWiringFindings(installRootAt("0.35.0"), { HOME: home }).some(
      (e) => e.code === "grok_plugin_copy_behind",
    ),
  );
  // GROK_HOME wins over HOME/.grok.
  const quiet = join(root, "quiet-home");
  mkdirSync(join(quiet, ".grok"), { recursive: true });
  assert.ok(
    pluginWiringFindings(installRootAt("0.35.0"), { HOME: quiet, GROK_HOME: grokHome }).some(
      (e) => e.code === "grok_plugin_copy_behind",
    ),
  );
  assert.ok(
    !pluginWiringFindings(installRootAt("0.35.0"), {
      HOME: home,
      GROK_HOME: join(quiet, ".grok"),
    }).some((e) => e.code.startsWith("grok_")),
  );
  // Nothing at all.
  assert.deepEqual(
    pluginWiringFindings(installRootAt("0.35.0"), { HOME: join(root, "nowhere") }),
    [],
  );
});

test("the reinstall command is built from the install root diagnose was handed — the path init printed", () => {
  const wiringLines = RUNTIME_WIRING.grok.steps.flatMap((step) => step("/any/root"));
  assert.ok(wiringLines.includes('grok plugin install "/any/root/plugins/mirror-mind" --trust'));
  assert.ok(
    grokPluginReinstallCommand("/any/root").endsWith(
      'grok plugin install "/any/root/plugins/mirror-mind" --trust',
    ),
  );
});
