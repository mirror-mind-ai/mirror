// CV22.DS10.US3 plateau 1 -- the tarball is checked, not trusted.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { checkPackContents, checkPackedContent, REQUIRED_FILES } from "#guards/packContents.ts";
import { packedContents, packInventory } from "../../scripts/checkPackContents.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

const MANIFEST = {
  name: "mirror-mind",
  version: "1.0.0",
  bin: { mirror: "bin/mirror.js" },
  files: ["ts/src"],
  scripts: { test: "node --test" },
};

function clean(): string[] {
  return [...REQUIRED_FILES, "templates/identity/self/soul.yaml", "docs/releases/v1.0.0.md"];
}

test("the runtime subset with a clean manifest has no problems", () => {
  assert.deepEqual(checkPackContents({ files: clean(), manifest: MANIFEST }), []);
});

test("each forbidden class is named, even under an allowed prefix", () => {
  const cases: [string, RegExp][] = [
    ["ts/test/foo.test.ts", /tests, smokes/],
    ["ts/src/x.test.ts", /a test file/],
    ["ts/src/goldens/a.txt", /a golden/],
    ["tmp/us3/before.tsv", /scratch/],
    [".env", /environment file/],
    [".env.example", /environment file/],
    ["templates/.env", /environment file/],
    ["docs/releases/memory.db", /a database/],
    ["ts/src/memory/cli.py", /Python/],
    ["pyproject.toml", /Python packaging/],
    ["uv.lock", /Python packaging/],
    ["frame/main/index.js", /Windows product/],
    ["installer/install.ps1", /Windows product/],
    ["spikes/one.ts", /spikes/],
    ["node_modules/yaml/index.js", /dependencies/],
    ["mirror-mind-1.0.0.tgz", /binary artifact/],
  ];
  for (const [path, why] of cases) {
    const problems = checkPackContents({ files: [...clean(), path], manifest: MANIFEST });
    assert.equal(problems.length, 1, path);
    assert.equal(problems[0]?.code, "forbidden_path", path);
    assert.match(problems[0]?.message ?? "", why, path);
  }
});

test("a path outside the whitelist is unlisted, not silently accepted", () => {
  const problems = checkPackContents({ files: [...clean(), "docs/index.md"], manifest: MANIFEST });
  assert.deepEqual(
    problems.map((p) => p.code),
    ["unlisted_path"],
  );
});

test("every required file and prefix is demanded by name", () => {
  const files = clean().filter(
    (p) => p !== "ts/src/hooks/main.ts" && !p.startsWith("docs/releases/"),
  );
  const problems = checkPackContents({ files, manifest: MANIFEST });
  assert.deepEqual(
    problems.map((p) => `${p.code}:${p.message.split(":")[0]}`),
    ["missing_file:ts/src/hooks/main.ts", "missing_prefix:docs/releases/"],
  );
});

test("the manifest is graded: name, private, files, bin, and install lifecycle scripts", () => {
  const files = clean();
  const codes = (manifest: object): string[] =>
    checkPackContents({ files, manifest }).map((p) => `${p.code}:${p.message.split(":")[0]}`);
  assert.deepEqual(codes({ ...MANIFEST, name: "mirror-core" }), ["manifest:name"]);
  assert.deepEqual(codes({ ...MANIFEST, private: true }), ["manifest:private"]);
  assert.deepEqual(codes({ ...MANIFEST, files: [] }), ["manifest:files"]);
  assert.deepEqual(codes({ ...MANIFEST, bin: {} }), ["manifest:bin.mirror"]);
  assert.deepEqual(codes({ ...MANIFEST, bin: { mirror: "ts/src/nope.ts" } }), [
    "manifest:bin.mirror",
  ]);
  assert.deepEqual(codes({ ...MANIFEST, scripts: { postinstall: "curl x | sh", test: "t" } }), [
    "lifecycle_script:scripts.postinstall",
  ]);
});

test("a shipped file that names the author is named, by file and line; LICENSE and README may", () => {
  // US3 F4: two skills told every user's agent to "present each proposal to
  // Vinícius". Whatever ships is read by whoever installed Mirror, so it
  // addresses them, never its first owner. The author is credited where that
  // is the point: the license and the README.
  const problems = checkPackedContent([
    {
      path: ".pi/skills/mm-shadow/SKILL.md",
      content: "intro\n## 3. Present each observation to Vinícius\n",
    },
    { path: "plugins/mirror-mind/skills/mm-consolidate/SKILL.md", content: "Ask Vinicius first\n" },
    { path: "LICENSE", content: "Copyright (c) Vinícius Teles\n" },
    { path: "README.md", content: "Created by Vinícius\n" },
    { path: "AGENTS.md", content: "Present each proposal to the user.\n" },
  ]);
  assert.deepEqual(
    problems.map((p) => `${p.code}:${p.message.split(": ")[0]}`),
    [
      "forbidden_content:.pi/skills/mm-shadow/SKILL.md:2",
      "forbidden_content:plugins/mirror-mind/skills/mm-consolidate/SKILL.md:1",
    ],
  );
  assert.match(problems[0]?.message ?? "", /names the author/);
});

test("the rule cannot trip on its own source, which ships in the tarball", () => {
  const source = readFileSync(join(REPO_ROOT, "ts/src/guards/packContents.ts"), "utf8");
  assert.deepEqual(
    checkPackedContent([{ path: "ts/src/guards/packContents.ts", content: source }]),
    [],
  );
});

test("this repository packs clean", () => {
  // The one test that runs npm: a dry run, nothing written. It is what CI
  // runs, so a change to `files` that leaks a test or a database fails here
  // before it fails there -- and so does a shipped file that carries what no
  // shipped file may.
  const inventory = packInventory(REPO_ROOT);
  assert.ok(inventory.files.length > 300, `only ${inventory.files.length} files packed`);
  assert.deepEqual(checkPackContents(inventory), []);
  assert.deepEqual(checkPackedContent(packedContents(REPO_ROOT, inventory.files)), []);
});
