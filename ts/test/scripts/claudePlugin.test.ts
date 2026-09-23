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

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const roots: string[] = [];

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "mirror-claude-plugin-"));
  roots.push(root);
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(root, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
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
    // re-points that body at ts/package.json and the builder follows with no
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
      "pyproject.toml": 'version = "9.9.9"\n',
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
      "pyproject.toml": 'version = "9.9.9"\n',
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
      "pyproject.toml": 'version = "9.9.9"\n',
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
      "pyproject.toml": 'version = "9.9.9"\n',
      ".claude/skills/one/SKILL.md": "# one\n",
    });

    const problems = materialize(root, { write: false });

    assert.ok(problems.some((problem) => problem.startsWith("missing:")));
  });

  test("reports an out-of-date generated file", () => {
    const root = fixture({
      "pyproject.toml": 'version = "9.9.9"\n',
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
      "pyproject.toml": 'version = "9.9.9"\n',
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
      "pyproject.toml": 'version = "9.9.9"\n',
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

describe("this repository", () => {
  test("the committed plugin tree is in sync with .claude/skills/", () => {
    // The same assertion `--check` makes in the release flow, run on every
    // suite so a skill edit that forgets to regenerate fails here first.
    assert.deepEqual(materialize(REPO_ROOT, { write: false }), []);
  });

  test("every generated skill matches its Claude source byte for byte", () => {
    for (const [name, source] of discoverSkillSources(REPO_ROOT)) {
      const generated = join(REPO_ROOT, PLUGIN_DIR, "skills", name, "SKILL.md");
      assert.equal(readFileSync(generated, "utf8"), readFileSync(source, "utf8"), name);
    }
  });
});
