// Self-test for the Claude plugin builder (CV22.DS10.TS5, slice B, D6).
//
// The Python original had no test of its own either: it was graded by the
// `--check` step and by the fact that the generated tree is committed. That is
// real coverage, but it only catches drift AFTER someone regenerates. These
// cases pin the generator's decisions -- manifest shape, version source,
// case-insensitive discovery, stale-skill removal -- so the port is graded on
// behavior rather than on one happy-path diff.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, describe, test } from "node:test";
import {
  agyHooksJson,
  agyPluginMarkerJson,
  buildAgyHooks,
  buildAgyMcpConfig,
  buildManifest,
  buildMarketplace,
  discoverSkillSources,
  MARKETPLACE_PATH,
  manifestJson,
  marketplaceJson,
  materialize,
  PLUGIN_DIR,
  PLUGIN_NAME,
  planGeneratedFiles,
  readVersion,
} from "#guards/claudePlugin.ts";
import { claudeSkillName, PI_SKILLS_DIR, PI_SOURCED_SKILLS } from "#guards/piSourcedSkills.ts";
import { stageMirrorPackage } from "../support/mirrorTree.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const roots: string[] = [];

/** A Pi copy of a Pi-sourced skill, as a Mirror tree carries one. */
function piCopy(skill: string, body = `# ${skill}\n\nOne body for every runtime.\n`): string {
  return `---\nname: "${skill}"\ndescription: fixture\nuser-invocable: true\n---\n\n${body}`;
}

/** A repository tree. `null` leaves out a file the tree would otherwise carry. */
function fixture(files: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), "mirror-claude-plugin-"));
  roots.push(root);
  // CR102: a Mirror tree carries the Pi copy of every Pi-sourced skill, and the
  // builder refuses to run without one.
  const staged: Record<string, string | null> = {};
  for (const skill of PI_SOURCED_SKILLS) {
    staged[join(PI_SKILLS_DIR, skill, "SKILL.md")] = piCopy(skill);
  }
  // CV21.DS7.US1: the agy layer's rules file is generated from AGENTS.md,
  // so a Mirror tree carries one; the builder fails loudly without it.
  staged["AGENTS.md"] = "# Mirror Mind — Operating Instructions (fixture)\n";
  for (const [relPath, content] of Object.entries({ ...staged, ...files })) {
    if (content === null) continue;
    const full = join(root, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  // CV22.DS10.TS5 (D1): the builder reads its version from the TypeScript
  // package now, through the one body US2's decision D2 created.
  stageMirrorPackage(root, { version: "9.9.9" });
  return root;
}

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("manifest", () => {
  test("declares the locator that starts `mirror mcp`, never an engine or a plugin file", () => {
    // CV21.DS2.US6: the manifest used to point at the plugin's own launcher,
    // `${CLAUDE_PLUGIN_ROOT}/mcp/launch.sh`, which Codex never expanded in an
    // MCP command (DS12.TS2 L6). The entry is now the launcher's search,
    // inline, run by /bin/sh; its own cases are in `mcpEntry.test.ts`. What
    // holds from DS9's D5 is that the manifest names no interpreter, and must
    // not start to.
    const manifest = buildManifest("1.2.3") as Record<string, Record<string, unknown>>;
    const entry = manifest.mcpServers?.["mirror-mind"] as { command: string; args: string[] };

    assert.equal(entry.command, "/bin/sh");
    assert.equal(entry.args[0], "-c");
    assert.match(entry.args[1] ?? "", /exec "\$mmnode" "\$mmbin" mcp$/);
    assert.ok(!JSON.stringify(manifest).includes("CLAUDE_PLUGIN_ROOT"));
    assert.ok(!JSON.stringify(manifest).includes("python"));
  });

  test("renders deterministic JSON with a trailing newline", () => {
    const first = manifestJson("1.2.3");
    assert.equal(first, manifestJson("1.2.3"));
    assert.ok(first.endsWith("}\n"));
    assert.equal(first.split("\n")[1], '  "name": "mirror-mind",');
  });

  test("carries no keys the plugin format does not support", () => {
    assert.deepEqual(Object.keys(buildManifest("1.2.3")), [
      "name",
      "version",
      "description",
      "author",
      "mcpServers",
    ]);
  });
});

// CV21.DS4.US1: Codex installs the plugin from a marketplace the package ships.
// The marketplace is generated beside the manifest, from the same constants, so
// the plugin's name lives in one place and `--check` guards both files.
describe("Codex marketplace", () => {
  test("names the package as both the marketplace and its one local plugin", () => {
    // The install selector is `<plugin>@<marketplace>`: `mirror-mind@mirror-mind`.
    const marketplace = buildMarketplace() as {
      name: string;
      owner: { name: string };
      plugins: { name: string; source: { source: string; path: string }; description: string }[];
    };

    assert.equal(marketplace.name, PLUGIN_NAME);
    assert.deepEqual(Object.keys(marketplace.owner), ["name"]);
    assert.equal(marketplace.plugins.length, 1);
    const [plugin] = marketplace.plugins;
    assert.equal(plugin?.name, PLUGIN_NAME);
    assert.equal(plugin?.name, buildManifest("1.2.3").name);
    assert.deepEqual(plugin?.source, { source: "local", path: `./${PLUGIN_DIR}` });
    assert.ok(plugin?.description);
  });

  test("its local path resolves from the repository root to the plugin manifest", () => {
    const marketplace = buildMarketplace() as {
      plugins: { source: { path: string } }[];
    };
    const path = marketplace.plugins[0]?.source.path ?? "";

    assert.ok(existsSync(join(REPO_ROOT, path, ".claude-plugin", "plugin.json")), path);
  });

  test("renders deterministic JSON with a trailing newline, and carries no version", () => {
    // Codex reads the version from the plugin manifest it copies into its cache.
    const first = marketplaceJson();
    assert.equal(first, marketplaceJson());
    assert.ok(first.endsWith("}\n"));
    assert.ok(!("version" in buildMarketplace()));
  });

  test("is one of the generated files, at the path Codex reads a marketplace from", () => {
    // DS12.TS2 static 5: `.agents/plugins/marketplace.json` under the marketplace root.
    assert.equal(MARKETPLACE_PATH, ".agents/plugins/marketplace.json");
    const root = fixture({ ".claude/skills/one/SKILL.md": "# one\n" });

    const planned = planGeneratedFiles(root).find((file) => file.relativePath === MARKETPLACE_PATH);

    assert.ok(planned);
    assert.equal(planned.content, marketplaceJson());
    materialize(root, { write: true });
    assert.equal(readFileSync(join(root, MARKETPLACE_PATH), "utf8"), marketplaceJson());
    writeFileSync(join(root, MARKETPLACE_PATH), "{}\n", "utf8");
    assert.deepEqual(materialize(root, { write: false }), [`out of date: ${MARKETPLACE_PATH}`]);
  });
});

// CV21.DS7.US1. agy treats a directory as a NATIVE plugin only when a root
// `plugin.json` marks it; without the marker, `agy plugin install` converts
// the Claude surfaces and OVERWRITES a shipped root hooks.json with Claude's
// (probe, agy 1.4.2, evidence in the story package). So the layer is four
// generated files: the marker, the hooks skeleton (TS2/TS3 add behavior),
// the MCP map, and the rules copy of AGENTS.md.
describe("the agy-native layer", () => {
  test("the four layer files are planned at agy's paths", () => {
    const paths = planGeneratedFiles(REPO_ROOT).map((file) => file.relativePath);
    for (const expected of [
      join(PLUGIN_DIR, "plugin.json"),
      join(PLUGIN_DIR, "hooks.json"),
      join(PLUGIN_DIR, "mcp_config.json"),
      join(PLUGIN_DIR, "rules", "AGENTS.md"),
    ]) {
      assert.ok(paths.includes(expected), expected);
    }
  });

  test("the marker carries the manifest's version and MCP entry, and no hooks (CV21.DS10.US1)", () => {
    // Claude Code and Codex resolve their manifest at .claude-plugin/plugin.json.
    // Grok reads the root marker FIRST and stops there (probe on grok 1.0.62,
    // 2026-10-18): a marker with only a name hid the plugin's version and its
    // MCP server from Grok in every install shape. So the marker carries both,
    // from the one source the manifest uses; agy 1.4.2 ignores the field with a
    // warning and stages the same tree. Hooks stay out: agy reads the root
    // hooks.json beside it, and a `hooks` key would be a second declaration.
    const version = readVersion(REPO_ROOT);
    const manifest = buildManifest(version) as { version: string; mcpServers: unknown };
    const marker = JSON.parse(agyPluginMarkerJson(version)) as Record<string, unknown>;
    assert.equal(marker.name, PLUGIN_NAME);
    assert.equal(marker.version, manifest.version);
    assert.deepEqual(marker.mcpServers, manifest.mcpServers);
    assert.ok(!("hooks" in marker));
  });

  test("the committed marker equals the generated one", () => {
    // The guard (`--check`) holds every planned file; this pins the one file
    // Grok reads so a hand edit cannot quietly drop what it carries.
    const version = readVersion(REPO_ROOT);
    const committed = readFileSync(join(REPO_ROOT, PLUGIN_DIR, "plugin.json"), "utf8");
    assert.equal(committed, agyPluginMarkerJson(version));
  });

  test("the MCP map is DERIVED from the manifest's entry — one locator, every carrier", () => {
    // The CR071 lesson at the locator level: the manifest, the hook
    // wrappers (mcpEntry.test.ts), and now the agy file carry one entry.
    const version = readVersion(REPO_ROOT);
    const manifest = buildManifest(version) as { mcpServers: unknown };
    assert.deepEqual(buildAgyMcpConfig().mcpServers, manifest.mcpServers);
  });

  test("the hooks file names the two handlers with small explicit timeouts (TS2)", () => {
    // US1 shipped the enabled skeleton; TS2 filled SessionStart and the
    // gated PreInvocation adapter. Stop is TS3's. Commands are relative:
    // agy runs handlers with cwd at the hooks.json directory.
    const hooks = buildAgyHooks() as Record<
      string,
      { enabled: boolean; SessionStart: unknown[]; PreInvocation: unknown[]; Stop?: unknown }
    >;
    const named = hooks[PLUGIN_NAME];
    assert.ok(named);
    assert.equal(named.enabled, true);
    assert.deepEqual(named.SessionStart, [
      { type: "command", command: "agy/session-start.sh", timeout: 60 },
    ]);
    assert.deepEqual(named.PreInvocation, [
      { type: "command", command: "agy/pre-invocation.sh", timeout: 15 },
    ]);
    // CV21.DS7.TS3: the Stop handler logs the turn from the transcript.
    assert.deepEqual(named.Stop, [{ type: "command", command: "agy/stop.sh", timeout: 30 }]);
    assert.ok(agyHooksJson().endsWith("\n"));
  });

  test("rules/AGENTS.md is AGENTS.md's bytes, naming its source — the guard is the sync", () => {
    const planned = planGeneratedFiles(REPO_ROOT).find(
      (file) => file.relativePath === join(PLUGIN_DIR, "rules", "AGENTS.md"),
    );
    assert.ok(planned);
    assert.equal(planned.content, readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8"));
    assert.equal(planned.source, "AGENTS.md");
  });

  test("the Claude surfaces are byte-identical with the layer present — the negative control", () => {
    // Accidental coupling inside the builder fails here, not in review.
    const version = readVersion(REPO_ROOT);
    assert.equal(
      manifestJson(version),
      readFileSync(join(REPO_ROOT, PLUGIN_DIR, ".claude-plugin", "plugin.json"), "utf8"),
    );
    assert.equal(marketplaceJson(), readFileSync(join(REPO_ROOT, MARKETPLACE_PATH), "utf8"));
  });
});

describe("version", () => {
  test("comes from the single body that answers it for the whole core", () => {
    // US2 decision D2: one function, read by the updater, the release doctor,
    // the welcome card, the MCP server -- and now this builder. Slice C
    // re-points that body at package.json and the builder follows with no
    // edit, which is the entire reason there is one body.
    assert.equal(readVersion(REPO_ROOT), readVersion(REPO_ROOT));
    assert.match(readVersion(REPO_ROOT), /^\d+\.\d+\.\d+$/);
  });
});

describe("skill discovery", () => {
  test("finds SKILL.md case-insensitively", () => {
    // Robust on both case-sensitive and case-insensitive filesystems,
    // including older checkouts still carrying lowercase `skill.md`.
    const root = fixture({
      ".claude/skills/upper/SKILL.md": "# upper\n",
      ".claude/skills/lower/skill.md": "# lower\n",
    });

    assert.deepEqual(
      discoverSkillSources(root).map(([name]) => name),
      ["lower", "upper"],
    );
  });

  test("ignores a skill directory with no markdown, and loose files", () => {
    const root = fixture({
      ".claude/skills/real/SKILL.md": "# real\n",
      ".claude/skills/empty/notes.txt": "nothing\n",
      ".claude/skills/README.md": "not a skill dir\n",
    });

    assert.deepEqual(
      discoverSkillSources(root).map(([name]) => name),
      ["real"],
    );
  });

  test("copies the source markdown verbatim", () => {
    const root = fixture({
      ".claude/skills/one/SKILL.md": "# one\n\nbody with ◇ glyph\n",
    });

    const planned = planGeneratedFiles(root);
    const skill = planned.find((file) => file.relativePath.includes("one"));

    assert.equal(skill?.content, "# one\n\nbody with ◇ glyph\n");
  });
});

describe("materialize", () => {
  test("reports a missing generated file in check mode", () => {
    const root = fixture({
      ".claude/skills/one/SKILL.md": "# one\n",
    });

    const problems = materialize(root, { write: false });

    assert.ok(problems.some((problem) => problem.startsWith("missing:")));
  });

  test("reports an out-of-date generated file", () => {
    const root = fixture({
      ".claude/skills/one/SKILL.md": "# one\n",
    });
    materialize(root, { write: true });
    writeFileSync(join(root, PLUGIN_DIR, "skills/one/SKILL.md"), "# tampered\n", "utf8");

    assert.deepEqual(materialize(root, { write: false }), [
      `out of date: ${join(PLUGIN_DIR, "skills/one/SKILL.md")}`,
    ]);
  });

  test("reports a stale generated skill, then removes it on write", () => {
    const root = fixture({
      ".claude/skills/one/SKILL.md": "# one\n",
    });
    materialize(root, { write: true });
    // A skill deleted from source but still present in the generated tree.
    const stalePath = join(root, PLUGIN_DIR, "skills/gone/SKILL.md");
    mkdirSync(dirname(stalePath), { recursive: true });
    writeFileSync(stalePath, "# gone\n", "utf8");

    assert.ok(materialize(root, { write: false }).some((p) => p.startsWith("stale:")));

    materialize(root, { write: true });
    assert.ok(!existsSync(dirname(stalePath)));
  });

  test("writing is idempotent and produces the planned bytes", () => {
    const root = fixture({
      ".claude/skills/one/SKILL.md": "# one\n",
    });

    materialize(root, { write: true });
    const first = readFileSync(join(root, PLUGIN_DIR, ".claude-plugin/plugin.json"), "utf8");
    materialize(root, { write: true });

    assert.equal(readFileSync(join(root, PLUGIN_DIR, ".claude-plugin/plugin.json"), "utf8"), first);
    assert.deepEqual(materialize(root, { write: false }), []);
    assert.equal(first, manifestJson("9.9.9"));
  });
});

// CR102: `mm-build` has one body in every runtime. Its Pi copy is the only one
// anyone edits, and both Claude Code copies are generated from it.
describe("Pi-sourced skills", () => {
  const PI_BUILD = join(PI_SKILLS_DIR, "mm-build", "SKILL.md");
  const CLAUDE_BUILD = join(".claude", "skills", "mm-build", "SKILL.md");
  const PLUGIN_BUILD = join(PLUGIN_DIR, "skills", "mm-build", "SKILL.md");
  const FROM_PI = `(generated from ${PI_BUILD}: edit the source, then regenerate)`;
  // A Claude-authored skill beside the Pi-sourced one: a tree always has one.
  const AUTHORED = { ".claude/skills/one/SKILL.md": "# one\n" };

  function planned(root: string, relativePath: string): string | undefined {
    return planGeneratedFiles(root).find((file) => file.relativePath === relativePath)?.content;
  }

  test("plan the Claude copy from the Pi copy, with only the name changed", () => {
    const pi = piCopy("mm-build", "# Builder Mode\n\nPi: `/mm-build`. Claude Code: `/mm:build`.\n");
    const root = fixture({ ...AUTHORED, [PI_BUILD]: pi });

    assert.equal(planned(root, CLAUDE_BUILD), pi.replace('name: "mm-build"', 'name: "mm:build"'));
  });

  test("plan the plugin copy from that content, never from the file on disk", () => {
    // One write must not carry a stale Claude copy into the plugin.
    const root = fixture({ [CLAUDE_BUILD]: "# the old 108-line copy\n" });

    assert.equal(planned(root, PLUGIN_BUILD), planned(root, CLAUDE_BUILD));
    assert.match(planned(root, PLUGIN_BUILD) ?? "", /^name: "mm:build"$/m);
  });

  test("report a missing Claude copy with the source it comes from", () => {
    const root = fixture(AUTHORED);

    assert.ok(materialize(root, { write: false }).includes(`missing: ${CLAUDE_BUILD} ${FROM_PI}`));
  });

  test("an edit to the Pi copy alone is drift in both Claude copies", () => {
    // The case neither guard could see before CR102: a rule reworded inside
    // an existing section, with no heading and no command changed.
    const root = fixture(AUTHORED);
    materialize(root, { write: true });
    writeFileSync(
      join(root, PI_BUILD),
      piCopy("mm-build", "# mm-build\n\nA rule, reworded.\n"),
      "utf8",
    );

    assert.deepEqual(materialize(root, { write: false }), [
      `out of date: ${CLAUDE_BUILD} ${FROM_PI}`,
      `out of date: ${PLUGIN_BUILD} ${FROM_PI}`,
    ]);
  });

  test("a hand edit to the Claude copy is drift, naming the source to edit instead", () => {
    const root = fixture(AUTHORED);
    materialize(root, { write: true });
    writeFileSync(join(root, CLAUDE_BUILD), "# edited by hand\n", "utf8");

    assert.deepEqual(materialize(root, { write: false }), [
      `out of date: ${CLAUDE_BUILD} ${FROM_PI}`,
    ]);
  });

  test("writing regenerates both copies, and writing again changes nothing", () => {
    const root = fixture({ [CLAUDE_BUILD]: "# the old 108-line copy\n" });

    materialize(root, { write: true });
    const first = readFileSync(join(root, CLAUDE_BUILD), "utf8");
    materialize(root, { write: true });

    assert.equal(first, piCopy("mm-build").replace('name: "mm-build"', 'name: "mm:build"'));
    assert.equal(readFileSync(join(root, PLUGIN_BUILD), "utf8"), first);
    assert.deepEqual(materialize(root, { write: false }), []);
  });

  const refusals: [string, string | null, RegExp][] = [
    ["has no Pi copy", null, /mm-build is listed as Pi-sourced/],
    ["has a Pi copy naming another skill", piCopy("mm-explore"), /found `name: "mm-explore"`/],
  ];
  for (const [label, pi, finding] of refusals) {
    test(`refuse, writing nothing, when a listed skill ${label}`, () => {
      const root = fixture({ [PI_BUILD]: pi, ".claude/skills/one/SKILL.md": "# one\n" });

      assert.throws(
        () => materialize(root, { write: true }),
        (error: Error) => {
          assert.ok(error.message.startsWith(`${PI_BUILD}: `), error.message);
          assert.match(error.message, finding);
          return true;
        },
      );
      assert.ok(!existsSync(join(root, PLUGIN_DIR)));
      assert.ok(!existsSync(join(root, CLAUDE_BUILD)));
    });
  }
});

describe("this repository", () => {
  test("every generated copy is in sync with its source", () => {
    // The same assertion `--check` makes in the release flow, run on every
    // suite so a skill edit that forgets to regenerate fails here first: the
    // plugin against .claude/skills/, and since CR102 the Claude copies of a
    // Pi-sourced skill against .pi/skills/.
    assert.deepEqual(materialize(REPO_ROOT, { write: false }), []);
  });

  test("the Claude copies of a Pi-sourced skill differ from Pi in the name line alone", () => {
    for (const skill of PI_SOURCED_SKILLS) {
      const pi = readFileSync(join(REPO_ROOT, PI_SKILLS_DIR, skill, "SKILL.md"), "utf8").split(
        "\n",
      );
      for (const copy of [
        join(".claude", "skills", skill, "SKILL.md"),
        join(PLUGIN_DIR, "skills", skill, "SKILL.md"),
      ]) {
        const lines = readFileSync(join(REPO_ROOT, copy), "utf8").split("\n");
        const differing = lines.filter((line, index) => line !== pi[index]);

        assert.equal(lines.length, pi.length, copy);
        assert.deepEqual(differing, [`name: "${claudeSkillName(skill)}"`], copy);
      }
    }
  });

  test("every generated skill matches its Claude source byte for byte", () => {
    for (const [name, source] of discoverSkillSources(REPO_ROOT)) {
      const generated = join(REPO_ROOT, PLUGIN_DIR, "skills", name, "SKILL.md");
      assert.equal(readFileSync(generated, "utf8"), readFileSync(source, "utf8"), name);
    }
  });
});
