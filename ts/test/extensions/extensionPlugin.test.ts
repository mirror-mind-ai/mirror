// CV21.DS5.US2 — the per-home extensions plugin.
//
// A Mirror home's installed extensions reach Claude Code, Codex, Antigravity, and
// Grok Build as ONE generated plugin per home, in the canonical plugin's format
// (DS5.TS1's decision). The generator is a pure function from the home's `claude`
// catalog to a sorted file map; a writer replaces the tree atomically; the version
// is `0.1.<generation>`, advanced by one when the tree changes and held when it does
// not, because Codex keys its cache by version and `diagnose` compares versions.

import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  extensionPluginDirectory,
  extensionPluginName,
  extensionPluginRoot,
  planExtensionPlugin,
  readExtensionPlugin,
  regenerateExtensionPlugin,
  writeExtensionPlugin,
} from "#extensions/extensionPlugin.ts";

const roots: string[] = [];
function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "ext-plugin-"));
  roots.push(root);
  return root;
}
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const SKILL_A =
  '---\nname: "ext:alpha"\ndescription: Alpha does A\nuser-invocable: true\n---\n\n# Alpha\n\nDo A.\n';
const SKILL_B = '---\nname: "ext:beta"\ndescription: Beta does B\n---\n\n# Beta\n';

function entries(...items: Array<[string, string]>) {
  return items.map(([commandName, content]) => ({ commandName, content }));
}

// --- the plan: a pure function to a sorted file map ---------------------------

test("the plugin is named for the home, and lives under runtime/plugin", () => {
  assert.equal(extensionPluginName("ana"), "mirror-ext-ana");
  assert.equal(extensionPluginRoot("/h/ana"), "/h/ana/runtime/plugin");
  assert.equal(extensionPluginDirectory("/h/ana"), "/h/ana/runtime/plugin/mirror-ext-ana");
});

test("one entry: the three manifests, the skill, nothing else, version 0.1.1", () => {
  const plan = planExtensionPlugin({
    user: "ana",
    entries: entries(["ext:alpha", SKILL_A]),
    previous: null,
  });
  assert.deepEqual(Object.keys(plan.files), [
    ".agents/plugins/marketplace.json",
    "mirror-ext-ana/.claude-plugin/plugin.json",
    "mirror-ext-ana/plugin.json",
    "mirror-ext-ana/skills/ext-alpha/SKILL.md",
  ]);
  assert.equal(plan.version, "0.1.1");
  assert.equal(plan.generation, 1);
  assert.equal(plan.skills, 1);
  assert.equal(plan.changed, true);
  assert.equal(plan.files["mirror-ext-ana/skills/ext-alpha/SKILL.md"], SKILL_A);
  const manifest = JSON.parse(plan.files["mirror-ext-ana/.claude-plugin/plugin.json"] as string);
  const marker = JSON.parse(plan.files["mirror-ext-ana/plugin.json"] as string);
  assert.deepEqual(manifest, {
    name: "mirror-ext-ana",
    version: "0.1.1",
    description: "Extensions of the Mirror home ana: 1 skill",
  });
  assert.deepEqual(marker, manifest);
  for (const key of ["hooks", "mcpServers", "commands"]) assert.ok(!(key in manifest), key);
  const marketplace = JSON.parse(plan.files[".agents/plugins/marketplace.json"] as string);
  assert.equal(marketplace.name, "mirror-ext-ana");
  assert.deepEqual(
    marketplace.plugins.map((p: { name: string; source: { path: string } }) => [
      p.name,
      p.source.path,
    ]),
    [["mirror-ext-ana", "./mirror-ext-ana"]],
  );
});

test("the skill directory name is expose-claude's, and the frontmatter is the source's bytes", () => {
  const plan = planExtensionPlugin({
    user: "ana",
    entries: entries(["ext:review-copy", SKILL_A]),
    previous: null,
  });
  assert.ok("mirror-ext-ana/skills/ext-review-copy/SKILL.md" in plan.files);
  assert.equal(plan.files["mirror-ext-ana/skills/ext-review-copy/SKILL.md"], SKILL_A);
});

test("the map is sorted: the same entries in another order give the same bytes", () => {
  const one = planExtensionPlugin({
    user: "ana",
    entries: entries(["ext:beta", SKILL_B], ["ext:alpha", SKILL_A]),
    previous: null,
  });
  const two = planExtensionPlugin({
    user: "ana",
    entries: entries(["ext:alpha", SKILL_A], ["ext:beta", SKILL_B]),
    previous: null,
  });
  assert.deepEqual(one.files, two.files);
  assert.deepEqual(Object.keys(one.files), Object.keys(two.files));
  assert.equal(one.skills, 2);
  assert.equal(
    JSON.parse(one.files["mirror-ext-ana/plugin.json"] as string).description,
    "Extensions of the Mirror home ana: 2 skills",
  );
});

test("no entries: a plugin with no skills, still named and versioned", () => {
  const plan = planExtensionPlugin({ user: "ana", entries: [], previous: null });
  assert.equal(plan.skills, 0);
  assert.equal(plan.version, "0.1.1");
  assert.deepEqual(Object.keys(plan.files), [
    ".agents/plugins/marketplace.json",
    "mirror-ext-ana/.claude-plugin/plugin.json",
    "mirror-ext-ana/plugin.json",
  ]);
});

// --- the generation: by one on a change, held on an identical tree ------------

test("an identical regeneration holds the version", () => {
  const first = planExtensionPlugin({
    user: "ana",
    entries: entries(["ext:alpha", SKILL_A]),
    previous: null,
  });
  const again = planExtensionPlugin({
    user: "ana",
    entries: entries(["ext:alpha", SKILL_A]),
    previous: { generation: first.generation, files: first.files },
  });
  assert.equal(again.version, "0.1.1");
  assert.equal(again.changed, false);
  assert.deepEqual(again.files, first.files);
});

test("added, changed, removed: each advances the generation by exactly one", () => {
  const first = planExtensionPlugin({
    user: "ana",
    entries: entries(["ext:alpha", SKILL_A]),
    previous: null,
  });
  const added = planExtensionPlugin({
    user: "ana",
    entries: entries(["ext:alpha", SKILL_A], ["ext:beta", SKILL_B]),
    previous: { generation: first.generation, files: first.files },
  });
  assert.equal(added.version, "0.1.2");
  const changed = planExtensionPlugin({
    user: "ana",
    entries: entries(["ext:alpha", `${SKILL_A}\nChanged.\n`], ["ext:beta", SKILL_B]),
    previous: { generation: added.generation, files: added.files },
  });
  assert.equal(changed.version, "0.1.3");
  const removed = planExtensionPlugin({
    user: "ana",
    entries: entries(["ext:beta", SKILL_B]),
    previous: { generation: changed.generation, files: changed.files },
  });
  assert.equal(removed.version, "0.1.4");
  assert.ok(!("mirror-ext-ana/skills/ext-alpha/SKILL.md" in removed.files));
});

// --- the writer: atomic, only regular files, 0700 ------------------------------

test("the writer replaces the tree atomically and leaves no plugin.next behind", () => {
  const home = join(scratch(), "ana");
  const first = planExtensionPlugin({
    user: "ana",
    entries: entries(["ext:alpha", SKILL_A], ["ext:beta", SKILL_B]),
    previous: null,
  });
  writeExtensionPlugin(home, first.files);
  const root = extensionPluginRoot(home);
  assert.ok(existsSync(join(root, "mirror-ext-ana/skills/ext-beta/SKILL.md")));
  assert.ok(!existsSync(`${root}.next`));
  assert.equal(statSync(root).mode & 0o777, 0o700);
  const second = planExtensionPlugin({
    user: "ana",
    entries: entries(["ext:alpha", SKILL_A]),
    previous: readExtensionPlugin(home),
  });
  writeExtensionPlugin(home, second.files);
  assert.ok(
    !existsSync(join(root, "mirror-ext-ana/skills/ext-beta")),
    "a removed skill's directory is gone",
  );
  assert.ok(!existsSync(`${root}.next`));
  for (const path of walk(root))
    assert.ok(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), path);
});

test("readExtensionPlugin reads back what the writer wrote, generation included", () => {
  const home = join(scratch(), "ana");
  assert.equal(readExtensionPlugin(home), null);
  const plan = planExtensionPlugin({
    user: "ana",
    entries: entries(["ext:alpha", SKILL_A]),
    previous: null,
  });
  writeExtensionPlugin(home, plan.files);
  const read = readExtensionPlugin(home);
  assert.ok(read !== null);
  assert.equal(read?.generation, 1);
  assert.deepEqual(read?.files, plan.files);
});

// --- regenerate: from the home's claude catalog --------------------------------

function catalogHome(skills: Array<[string, string]>): string {
  const home = join(scratch(), "ana");
  const claudeRoot = join(home, "runtime", "skills", "claude");
  const items = skills.map(([commandName, content]) => {
    const dir = join(claudeRoot, commandName.replace(":", "-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), content, "utf8");
    return {
      id: commandName.replace("ext:", ""),
      command_name: commandName,
      installed_skill_path: join(dir, "SKILL.md"),
    };
  });
  writeFileSync(
    join(claudeRoot, "extensions.json"),
    JSON.stringify({
      schema_version: "1",
      runtime: "claude",
      target_root: claudeRoot,
      generated_at: "x",
      extensions: items,
    }),
    "utf8",
  );
  return home;
}

test("regenerate reads the claude catalog, writes the plugin, and reports it", () => {
  const home = catalogHome([["ext:alpha", SKILL_A]]);
  const report = regenerateExtensionPlugin(home);
  assert.ok(report !== null);
  assert.equal(report?.name, "mirror-ext-ana");
  assert.equal(report?.version, "0.1.1");
  assert.equal(report?.skills, 1);
  assert.equal(
    readFileSync(join(extensionPluginDirectory(home), "skills/ext-alpha/SKILL.md"), "utf8"),
    SKILL_A,
  );
  assert.equal(
    regenerateExtensionPlugin(home)?.version,
    "0.1.1",
    "held on an identical regeneration",
  );
});

test("regenerate names the installed extensions the plugin does not carry", () => {
  const home = catalogHome([["ext:alpha", SKILL_A]]);
  // Two installed extensions: alpha (in the catalog) and pi-only (not).
  for (const id of ["alpha", "pi-only"]) {
    mkdirSync(join(home, "extensions", id), { recursive: true });
    const runtimes =
      id === "alpha"
        ? "  claude:\n    command_name: ext:alpha\n    skill_file: SKILL.md\n"
        : "  pi:\n    command_name: ext-pi-only\n    skill_file: SKILL.md\n";
    writeFileSync(
      join(home, "extensions", id, "skill.yaml"),
      `id: ${id}\nname: ${id}\ncategory: extension\nkind: prompt-skill\nsummary: s\nruntimes:\n${runtimes}`,
      "utf8",
    );
    writeFileSync(join(home, "extensions", id, "SKILL.md"), "# s\n", "utf8");
  }
  assert.deepEqual(regenerateExtensionPlugin(home)?.notCarried, ["pi-only"]);
});

test("a home with no claude catalog generates nothing", () => {
  const home = join(scratch(), "ana");
  mkdirSync(home, { recursive: true });
  assert.equal(regenerateExtensionPlugin(home), null);
  assert.ok(!existsSync(extensionPluginRoot(home)));
});

test("a catalog entry whose skill file is missing is skipped, not fatal", () => {
  const home = catalogHome([["ext:alpha", SKILL_A]]);
  rmSync(join(home, "runtime/skills/claude/ext-alpha/SKILL.md"));
  assert.equal(regenerateExtensionPlugin(home)?.skills, 0);
});

function walk(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...walk(path));
    else found.push(path);
  }
  return found;
}
