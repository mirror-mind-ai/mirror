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
  buildManifest,
  discoverSkillSources,
  manifestJson,
  materialize,
  PLUGIN_DIR,
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
  test("declares the launcher, never an engine", () => {
    // DS9 decision D5: the manifest points at the plugin's own launcher so the
    // engine can be reverted without editing a plugin installed inside
    // someone's runtime. TS5 removes that launcher's Python branch; US3
    // repoints it at the npm entry. Either way the manifest does not name an
    // interpreter, and must not start to.
    const manifest = buildManifest("1.2.3") as Record<string, Record<string, unknown>>;
    const command = (manifest.mcpServers?.["mirror-mind"] as { command: string }).command;

    // biome-ignore lint/suspicious/noTemplateCurlyInString: Claude expands this at load time, not JS
    assert.equal(command, "${CLAUDE_PLUGIN_ROOT}/mcp/launch.sh");
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
