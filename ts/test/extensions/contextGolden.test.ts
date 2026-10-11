import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import { collectExtensionContext } from "#extensions/contextRuntime.ts";

interface GoldenCase {
  name: string;
  persona_id: string | null;
  journey_id: string | null;
  sections: unknown[];
  rendered: string;
}

const golden = JSON.parse(
  readFileSync(new URL("../goldens/extension-context.golden.json", import.meta.url), "utf8"),
) as { cases: GoldenCase[] };

test("TS provider dispatch reproduces the committed Python extension-context oracle", () => {
  const outer = mkdtempSync(join(tmpdir(), "mirror-extension-golden-"));
  const home = join(outer, "tmp");
  const extension = join(home, "extensions", "hello");
  mkdirSync(extension, { recursive: true });
  const dbPath = join(home, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    db.exec(`CREATE TABLE _ext_bindings (
      extension_id TEXT NOT NULL, capability_id TEXT NOT NULL,
      target_kind TEXT NOT NULL, target_id TEXT, created_at TEXT NOT NULL,
      PRIMARY KEY (extension_id, capability_id, target_kind, target_id)
    )`);
    for (const [kind, target] of [
      ["persona", "engineer"],
      ["journey", "mirror-ts-core"],
    ] as const) {
      db.prepare("INSERT INTO _ext_bindings VALUES ('hello','greeting',?,?, 't')").run(
        kind,
        target,
      );
    }
    writeFileSync(
      join(extension, "skill.yaml"),
      "id: hello\nname: Hello\ncategory: extension\nkind: command-skill\nsummary: fixture\n" +
        "entrypoint:\n  module: extension\nruntimes:\n  pi:\n    command_name: ext-hello\n" +
        "mirror_context_providers:\n  - id: greeting\n    description: fixture\n" +
        "    provider_runtime:\n      protocol: mirror-context-v1\n      command: [node, provider.mjs]\n",
    );
    writeFileSync(join(extension, "extension.py"), "def register(api):\n    pass\n");
    writeFileSync(
      join(extension, "provider.mjs"),
      'process.stdout.write(JSON.stringify({protocol:"mirror-context-v1",text:"Latest ping: oracle ping"}));\n',
    );

    for (const expected of golden.cases) {
      const actual = collectExtensionContext(db, {
        mirrorHome: home,
        databasePath: dbPath,
        personaId: expected.persona_id,
        journeyId: expected.journey_id,
        user: "fixture-user",
        query: "fixture-query",
      });
      assert.deepEqual(actual.sections, expected.sections, expected.name);
      assert.equal(actual.rendered, expected.rendered, expected.name);
      assert.deepEqual(actual.diagnostics, [], expected.name);
    }
  } finally {
    db.close();
    rmSync(outer, { recursive: true, force: true });
  }
});
