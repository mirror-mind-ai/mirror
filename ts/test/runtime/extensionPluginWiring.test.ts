// CV21.DS5.US2 — what each runtime holds of a home's extensions plugin, the block
// the `extensions` verbs print, and the findings `diagnose` raises from the same
// reading. Every home is a scratch one handed in through the env; the PATH is a
// stand-in; the machine's real wiring cannot reach these tests.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import type { ExtensionPluginReport } from "#extensions/extensionPlugin.ts";
import { extensionPluginFindings } from "#runtime/diagnose.ts";
import {
  extensionPluginStates,
  renderExtensionPluginBlock,
} from "#runtime/extensionPluginWiring.ts";

const roots: string[] = [];
function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "ext-plugin-wiring-"));
  roots.push(root);
  return root;
}
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const ALL_ON_PATH = new Set(["/bin/claude", "/bin/codex", "/bin/agy", "/bin/grok", "/bin/pi"]);
const onPath = (path: string) => ALL_ON_PATH.has(path);

function plugin(home: string, version = "0.1.2", skills = 2): ExtensionPluginReport {
  return {
    name: "mirror-ext-ana",
    directory: join(home, "runtime", "plugin", "mirror-ext-ana"),
    marketplaceRoot: join(home, "runtime", "plugin"),
    version,
    skills,
    changed: false,
    notCarried: [],
  };
}

function manifest(dir: string, version: string): void {
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(dir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "mirror-ext-ana", version }),
  );
}

/** A scratch HOME wired as asked; `env` points every reader at it. */
function world(wiring: {
  claude?: "linked" | "dangling";
  codex?: string;
  agy?: string;
  grok?: string[];
}) {
  const home = join(scratch(), "home");
  const mirrorHome = join(home, ".mirror-minds", "ana");
  mkdirSync(join(mirrorHome, "runtime", "plugin", "mirror-ext-ana"), { recursive: true });
  const p = plugin(mirrorHome);
  if (wiring.claude) {
    mkdirSync(join(home, ".claude", "skills"), { recursive: true });
    symlinkSync(
      wiring.claude === "linked" ? p.directory : join(home, "gone"),
      join(home, ".claude", "skills", "mirror-ext-ana"),
    );
  }
  if (wiring.codex) {
    mkdirSync(
      join(home, ".codex", "plugins", "cache", "mirror-ext-ana", "mirror-ext-ana", wiring.codex),
      { recursive: true },
    );
  }
  if (wiring.agy)
    manifest(join(home, ".gemini", "config", "plugins", "mirror-ext-ana"), wiring.agy);
  if (wiring.grok) {
    const installed = join(home, ".grok", "installed-plugins");
    const repos: Record<string, unknown> = {};
    wiring.grok.forEach((version, index) => {
      const key = `plugin-ana-${index}`;
      manifest(join(installed, key), version);
      repos[key] = { path: join(installed, key), plugins: { "mirror-ext-ana": {} } };
    });
    mkdirSync(installed, { recursive: true });
    writeFileSync(join(installed, "registry.json"), JSON.stringify({ version: 1, repos }));
  }
  const env = { HOME: home, PATH: "/bin" } as NodeJS.ProcessEnv;
  return { home, mirrorHome, plugin: p, env };
}

test("an unwired machine: four not-wired readings, one per runtime on the PATH, none for Pi", () => {
  const w = world({});
  const states = extensionPluginStates(w.plugin, w.env, onPath);
  assert.deepEqual(
    states.map((s) => [s.runtime, s.state]),
    [
      ["claude", "not_wired"],
      ["codex", "not_wired"],
      ["antigravity", "not_wired"],
      ["grok", "not_wired"],
    ],
  );
  assert.deepEqual(states[1]?.steps, [
    `codex plugin marketplace add "${w.plugin.marketplaceRoot}"`,
    "codex plugin add mirror-ext-ana@mirror-ext-ana",
  ]);
});

test("a runtime absent from the PATH is not read at all", () => {
  const w = world({});
  const states = extensionPluginStates(w.plugin, w.env, (path) => path === "/bin/grok");
  assert.deepEqual(
    states.map((s) => s.runtime),
    ["grok"],
  );
  assert.deepEqual(
    extensionPluginStates(w.plugin, w.env, () => false),
    [],
  );
});

test("wired everywhere at the plugin's version reads wired, and the block is one line", () => {
  const w = world({ claude: "linked", codex: "0.1.2", agy: "0.1.2", grok: ["0.1.2"] });
  const states = extensionPluginStates(w.plugin, w.env, onPath);
  assert.deepEqual(
    states.map((s) => s.state),
    ["wired", "wired", "wired", "wired"],
  );
  assert.deepEqual(renderExtensionPluginBlock(w.plugin, states), [
    "  plugin: mirror-ext-ana 0.1.2, 2 skills, wired on Claude Code, Codex, Antigravity, Grok Build",
  ]);
});

test("a copy at another version is stale either way, and the block names the reinstall", () => {
  const w = world({ claude: "linked", codex: "0.1.1", agy: "0.1.3", grok: ["0.1.1"] });
  const states = extensionPluginStates(w.plugin, w.env, onPath);
  assert.deepEqual(
    states.map((s) => [s.runtime, s.state, s.detail]),
    [
      ["claude", "wired", "wired"],
      ["codex", "stale", "copy at 0.1.1"],
      ["antigravity", "stale", "copy at 0.1.3"],
      ["grok", "stale", "copy at 0.1.1"],
    ],
  );
  assert.deepEqual(renderExtensionPluginBlock(w.plugin, states), [
    "  plugin: mirror-ext-ana 0.1.2, 2 skills",
    "    Codex: copy at 0.1.1 — codex plugin add mirror-ext-ana@mirror-ext-ana",
    `    Antigravity: copy at 0.1.3 — agy plugin install "${w.plugin.directory}"`,
    `    Grok Build: copy at 0.1.1 — grok plugin uninstall mirror-ext-ana --confirm && grok plugin install "${w.plugin.directory}" --trust`,
  ]);
});

test("after an uninstall, a stale copy 'still has' what was removed", () => {
  const w = world({ codex: "0.1.1" });
  const states = extensionPluginStates(w.plugin, w.env, (path) => path === "/bin/codex");
  assert.deepEqual(renderExtensionPluginBlock(w.plugin, states, ["ext:review-copy"]), [
    "  plugin: mirror-ext-ana 0.1.2, 2 skills",
    "    Codex: still has ext:review-copy — codex plugin add mirror-ext-ana@mirror-ext-ana",
  ]);
});

test("the not-wired block prints each step, Codex's two on two lines, Grok's consent line", () => {
  const w = world({});
  const states = extensionPluginStates(
    w.plugin,
    w.env,
    (path) => path === "/bin/codex" || path === "/bin/grok",
  );
  const lines = renderExtensionPluginBlock(w.plugin, states);
  assert.equal(lines[0], "  plugin: mirror-ext-ana 0.1.2, 2 skills");
  assert.equal(
    lines[1],
    `    Codex: not wired — codex plugin marketplace add "${w.plugin.marketplaceRoot}"`,
  );
  assert.match(lines[2] ?? "", /^\s+then codex plugin add mirror-ext-ana@mirror-ext-ana$/);
  assert.match(lines[3] ?? "", /^ {4}Grok Build: not wired — grok plugin install ".*" --trust$/);
  assert.match(lines[4] ?? "", /skills only — no hooks and no MCP server/);
});

test("the block names the installed extensions the plugin does not carry", () => {
  const w = world({ claude: "linked" });
  const p = { ...w.plugin, notCarried: ["session-export", "video"] };
  const states = extensionPluginStates(p, w.env, (path) => path === "/bin/claude");
  assert.deepEqual(renderExtensionPluginBlock(p, states), [
    "  plugin: mirror-ext-ana 0.1.2, 2 skills, wired on Claude Code",
    "    not carried (no claude block in skill.yaml): session-export, video",
  ]);
});

test("with no runtime on the PATH, the block is the plugin line alone", () => {
  const w = world({});
  assert.deepEqual(renderExtensionPluginBlock(w.plugin, []), [
    "  plugin: mirror-ext-ana 0.1.2, 2 skills",
  ]);
});

test("a dangling Claude link and two Grok copies are their own states", () => {
  const w = world({ claude: "dangling", grok: ["0.1.2", "0.1.1"] });
  const states = extensionPluginStates(
    w.plugin,
    w.env,
    (path) => path === "/bin/claude" || path === "/bin/grok",
  );
  assert.equal(states[0]?.state, "dangling");
  assert.equal(states[1]?.state, "duplicated");
  assert.match(states[1]?.steps[0] ?? "", /uninstall mirror-ext-ana --confirm/);
});

// --- the findings `diagnose` raises from the same reading ----------------------

test("findings: nothing without a plugin, nothing when wired, one per stale copy otherwise", () => {
  const empty = world({});
  rmSync(join(empty.mirrorHome, "runtime"), { recursive: true });
  assert.deepEqual(extensionPluginFindings(empty.mirrorHome, empty.env, onPath), []);

  const wired = world({ claude: "linked", codex: "0.1.1", agy: "0.1.1", grok: ["0.1.1"] });
  writePlugin(wired.mirrorHome, "0.1.1");
  assert.deepEqual(extensionPluginFindings(wired.mirrorHome, wired.env, onPath), []);

  const stale = world({
    claude: "dangling",
    codex: "0.1.1",
    agy: "0.1.3",
    grok: ["0.1.1", "0.1.2"],
  });
  writePlugin(stale.mirrorHome, "0.1.2");
  const findings = extensionPluginFindings(stale.mirrorHome, stale.env, onPath);
  assert.deepEqual(
    findings.map((f) => f.code),
    [
      "ext_plugin_claude_link_dangling",
      "ext_plugin_codex_cache_stale",
      "ext_plugin_agy_copy_stale",
      "ext_plugin_grok_copies_duplicated",
    ],
  );
  assert.equal(findings[1]?.repair_route, "codex plugin add mirror-ext-ana@mirror-ext-ana");
  assert.ok(findings.every((f) => f.severity === "warning"));
});

test("findings: a runtime not wired is not drift, and a runtime off the PATH is not read", () => {
  const w = world({ codex: "0.1.1" });
  writePlugin(w.mirrorHome, "0.1.2");
  assert.deepEqual(
    extensionPluginFindings(w.mirrorHome, w.env, onPath).map((f) => f.code),
    ["ext_plugin_codex_cache_stale"],
  );
  assert.deepEqual(
    extensionPluginFindings(w.mirrorHome, w.env, () => false),
    [],
  );
});

function writePlugin(mirrorHome: string, version: string): void {
  const dir = join(mirrorHome, "runtime", "plugin", "mirror-ext-ana");
  manifest(dir, version);
  writeFileSync(
    join(mirrorHome, "runtime", "plugin", "mirror-ext-ana", "plugin.json"),
    JSON.stringify({ name: "mirror-ext-ana", version }),
  );
}
