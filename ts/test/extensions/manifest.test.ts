// The command-skill entrypoint contract (CV22.DS10.TS5, decision D10).
//
// The validator is a byte-for-byte port of Python's, and it required every
// command-skill to declare `entrypoint.module` resolving to a `.py` file. Since
// CV22.DS10.TS2 the core imports that file NEVER: every capability declares its
// own runtime, `mirror-cli-v1` or `mirror-context-v1`, and the core spawns that
// command and nothing else. So the rule demanded a Python file from every
// extension -- a Node one included -- and read nothing from it.
//
// D10: `entrypoint` is optional for a command-skill. When an extension DOES
// declare one, it is validated exactly as before, so every installed extension
// validates as it did.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";

import { ExtensionValidationError } from "#extensions/errors.ts";
import { loadExtensionManifest } from "#extensions/manifest.ts";

const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const BASE =
  "id: demo-widget\nname: Demo Widget\ncategory: extension\nkind: command-skill\n" +
  "summary: a fixture extension\nruntimes:\n  pi:\n    command_name: ext-demo-widget\n";

function extension(manifest: string, files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "manifest-"));
  roots.push(root);
  const directory = join(root, "demo-widget");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "skill.yaml"), manifest, "utf8");
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, name)), { recursive: true });
    writeFileSync(join(directory, name), body);
  }
  return directory;
}

function refusal(directory: string): string {
  try {
    loadExtensionManifest(directory);
  } catch (error) {
    assert.ok(error instanceof ExtensionValidationError, String(error));
    return error.message;
  }
  assert.fail("the manifest validated");
}

describe("a command-skill without an entrypoint", () => {
  test("validates, and carries no entrypoint", () => {
    const manifest = loadExtensionManifest(extension(BASE));
    assert.equal(manifest.kind, "command-skill");
    assert.deepEqual(manifest.entrypoint, []);
  });

  test("an empty `entrypoint:` is the same as none", () => {
    const manifest = loadExtensionManifest(extension(`${BASE}entrypoint:\n`));
    assert.deepEqual(manifest.entrypoint, []);
  });

  test("still has its table prefix checked", () => {
    // Only the entrypoint rule relaxed. The prefix guards the extension's
    // tables in the shared database, and it binds with or without one.
    const message = refusal(extension(`${BASE}table_prefix: ext_other_\n`));
    assert.match(message, /^table_prefix 'ext_other_' does not match the required prefix/);
  });
});

describe("a command-skill that declares an entrypoint", () => {
  test("validates as before, with the resolved module path appended", () => {
    const directory = extension(`${BASE}entrypoint:\n  module: extension\n  function: register\n`, {
      "extension.py": "def register(api):\n    pass\n",
    });
    assert.deepEqual(loadExtensionManifest(directory).entrypoint, [
      ["module", "extension"],
      ["function", "register"],
      ["module_path", join(directory, "extension.py")],
    ]);
  });

  test("still needs the module it names to exist", () => {
    const directory = extension(`${BASE}entrypoint:\n  module: extension\n`);
    assert.equal(
      refusal(directory),
      `entrypoint.module 'extension' not found at ${join(directory, "extension.py")}`,
    );
  });

  test("still needs a module, and says so without claiming every command-skill does", () => {
    const directory = extension(`${BASE}entrypoint:\n  function: register\n`);
    assert.equal(
      refusal(directory),
      "a declared entrypoint requires entrypoint.module (a Python module name under " +
        `the extension directory) in ${join(directory, "skill.yaml")}`,
    );
  });

  test("that is not a mapping is refused the same way", () => {
    const directory = extension(`${BASE}entrypoint: extension\n`);
    assert.match(refusal(directory), /^a declared entrypoint requires entrypoint\.module/);
  });
});

describe("the extension template", () => {
  test("fills in to a command-skill the validator accepts, with no Python in it", () => {
    // TS5's finding F13: deleting `extension.py.template` while the rule still
    // demanded an entrypoint would have left the template producing extensions
    // the validator rejects. The template is graded as an author uses it: every
    // placeholder filled in, every `.template` renamed.
    const template = new URL("../../../docs/product/extensions/template/", import.meta.url)
      .pathname;
    const fill = (text: string): string =>
      text
        .replaceAll("<id_underscored>", "demo_widget")
        .replaceAll("<id>", "demo-widget")
        .replaceAll("<Human Name>", "Demo Widget")
        .replaceAll("<one-line summary>", "a filled-in template")
        .replaceAll("<capability_id>", "summary")
        .replaceAll("<subcommand>", "report");
    const read = (name: string): string => fill(readFileSync(join(template, name), "utf8"));
    const directory = extension(read("skill.yaml.template"), {
      "SKILL.md": read("SKILL.md.template"),
      "context-provider.mjs": read("context-provider.mjs.template"),
      "commands/report.mjs": read("commands/subcommand.mjs.template"),
      "migrations/001_init.sql": read("migrations/001_init.sql.template"),
    });
    const manifest = loadExtensionManifest(directory);
    assert.equal(manifest.kind, "command-skill");
    assert.deepEqual(manifest.entrypoint, []);
    const leftovers = readdirSync(template, { recursive: true }).filter((name) =>
      String(name).endsWith(".py.template"),
    );
    assert.deepEqual(leftovers, []);
  });
});
