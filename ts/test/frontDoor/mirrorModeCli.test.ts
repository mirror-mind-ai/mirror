import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bootstrapDatabaseIfMissing } from "#db/bootstrap.ts";
import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "#db/database.ts";
import { spawnFrontDoor } from "#helpers/frontDoor.ts";

function mirrorDbCopy(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-modecli-"));
  const temp = join(dir, "tmp");
  mkdirSync(temp);
  const dbPath = join(temp, "copy.db");
  bootstrapDatabaseIfMissing(dbPath);
  const db = openDatabaseCopyForWrite(dbPath);
  const insert = db.prepare(
    "INSERT INTO identity (id, layer, key, content, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, 't', 't', ?)",
  );
  insert.run("ego", "ego", "behavior", "Be useful", null);
  insert.run("user", "user", "identity", "User context", null);
  insert.run(
    "persona",
    "persona",
    "engineer",
    "Engineer context",
    JSON.stringify({ routing_keywords: ["debug"] }),
  );
  insert.run(
    "journey",
    "journey",
    "mirror-ts-core",
    "# Mirror TS Core\n**Status:** active\n\n## Description\nTS migration\n\n## End",
    null,
  );
  db.prepare(
    `INSERT INTO runtime_sessions
      (session_id, interface, started_at, updated_at)
     VALUES ('cli-session', 'pi', 't0', 't0')`,
  ).run();
  db.close();
  return { dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("front door completes the extension-free mode → load → log → deactivate flow in TS", () => {
  const ws = mirrorDbCopy();
  try {
    const statusBefore = spawnFrontDoor(["mode", "status", "--db-path", ws.dbPath]);
    assert.equal(statusBefore.status, 0);
    assert.equal(statusBefore.stdout, "Mirror Mode\n");

    const load = spawnFrontDoor([
      "mirror",
      "load",
      "--persona",
      "engineer",
      "--journey",
      "mirror-ts-core",
      "--session-id",
      "cli-session",
      "--db-path",
      ws.dbPath,
    ]);
    assert.equal(load.status, 0, load.stderr);
    assert.match(load.stdout, /◌ {2}MIRROR MODE ACTIVE/);
    assert.match(load.stdout, /=== persona\/engineer ===\nEngineer context/);
    assert.match(load.stdout, /=== journey\/mirror-ts-core ===/);
    assert.match(load.stderr, /⏺ Mirror Mode active/);

    const log = spawnFrontDoor([
      "mirror",
      "log",
      "Finished the migration slice.",
      "--session-id",
      "cli-session",
      "--db-path",
      ws.dbPath,
    ]);
    assert.equal(log.status, 0, log.stderr);
    assert.equal(log.stderr, "Response recorded.\n");

    const deactivate = spawnFrontDoor([
      "mirror",
      "deactivate",
      "--session-id",
      "cli-session",
      "--db-path",
      ws.dbPath,
    ]);
    assert.equal(deactivate.status, 0, deactivate.stderr);
    assert.equal(deactivate.stderr, "Mirror Mode deactivated.\n");

    const db = openDatabaseReadOnly(ws.dbPath);
    assert.equal(
      db
        .prepare("SELECT mirror_active FROM runtime_sessions WHERE session_id = 'cli-session'")
        .get()?.mirror_active,
      0,
    );
    assert.equal(
      db.prepare("SELECT content FROM messages WHERE role = 'assistant'").get()?.content,
      "Finished the migration slice.",
    );
    assert.equal(
      db.prepare("SELECT title FROM conversations").get()?.title,
      "Finished the migration slice",
    );
    db.close();
    const frontDoorLog = readFileSync(join(ws.dbPath, "..", "front-door.log"), "utf8");
    assert.doesNotMatch(frontDoorLog, /Finished the migration slice|Engineer context|User context/);
    assert.match(frontDoorLog, /\tmirror\tts\texit=0/);
  } finally {
    ws.cleanup();
  }
});

test("front door mirror load query uses scrubbed reception and embedding replay without payload logs", () => {
  const ws = mirrorDbCopy();
  try {
    const fixtureDir = join(ws.dbPath, "..");
    const llmPath = join(fixtureDir, "reception.json");
    const embeddingPath = join(fixtureDir, "embedding.json");
    writeFileSync(
      llmPath,
      JSON.stringify({
        kind: "llm",
        responses: {
          reception: {
            content:
              '{"personas":["engineer"],"journey":"mirror-ts-core","touches_identity":false,"touches_shadow":false}',
            model: "fixture-model",
          },
        },
      }),
    );
    writeFileSync(
      embeddingPath,
      JSON.stringify({
        kind: "embedding",
        response: {
          embedding: Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0)),
        },
      }),
    );
    const result = spawnFrontDoor(
      [
        "mirror",
        "load",
        "--query",
        "private replay routing query",
        "--session-id",
        "cli-session",
        "--db-path",
        ws.dbPath,
      ],
      {
        MIRROR_TS_EXTERNAL_ROUTES: "1",
        MIRROR_TS_MIRROR_LLM_REPLAY: llmPath,
        MIRROR_TS_MIRROR_EMBEDDING_REPLAY: embeddingPath,
        MEMORY_RECEPTION: "1",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /=== persona\/engineer ===\nEngineer context/);
    const log = readFileSync(join(fixtureDir, "front-door.log"), "utf8");
    assert.doesNotMatch(log, /private replay routing query|Engineer context/);
    const db = openDatabaseReadOnly(ws.dbPath);
    const call = db
      .prepare("SELECT role,prompt,response FROM llm_calls WHERE role='reception'")
      .get();
    assert.deepEqual(call, { role: "reception", prompt: "", response: "" });
    db.close();
  } finally {
    ws.cleanup();
  }
});

test("matching native and legacy extension providers stay on the TS mirror route", () => {
  const ws = mirrorDbCopy();
  try {
    const mirrorHome = join(ws.dbPath, "..");
    const extensions = join(mirrorHome, "extensions");
    const native = join(extensions, "native");
    const legacy = join(extensions, "legacy");
    const broken = join(extensions, "broken");
    mkdirSync(native, { recursive: true });
    mkdirSync(legacy, { recursive: true });
    mkdirSync(broken, { recursive: true });
    writeFileSync(
      join(native, "skill.yaml"),
      "id: native\nname: Native\ncategory: extension\nkind: command-skill\nsummary: fixture\n" +
        "entrypoint:\n  module: extension\nruntimes:\n  pi:\n    command_name: ext-native\n" +
        "mirror_context_providers:\n  - id: context\n    description: fixture\n" +
        "    provider_runtime:\n      protocol: mirror-context-v1\n      command: [node, provider.mjs]\n",
    );
    writeFileSync(join(native, "extension.py"), "def register(api):\n    pass\n");
    writeFileSync(
      join(native, "provider.mjs"),
      'process.stdout.write(JSON.stringify({protocol:"mirror-context-v1",text:"native private context"}));\n',
    );
    writeFileSync(
      join(broken, "skill.yaml"),
      "id: broken\nname: Broken\ncategory: extension\nkind: command-skill\nsummary: fixture\n" +
        "entrypoint:\n  module: extension\nruntimes:\n  pi:\n    command_name: ext-broken\n" +
        "mirror_context_providers:\n  - id: context\n    description: fixture\n" +
        "    provider_runtime:\n      protocol: mirror-context-v1\n      command: [node, provider.mjs]\n",
    );
    writeFileSync(join(broken, "extension.py"), "def register(api):\n    pass\n");
    writeFileSync(
      join(broken, "provider.mjs"),
      'process.stderr.write("private provider stderr"); process.stdout.write("not-json");\n',
    );
    writeFileSync(
      join(legacy, "skill.yaml"),
      "id: legacy\nname: Legacy\ncategory: extension\nkind: command-skill\nsummary: fixture\n" +
        "entrypoint:\n  module: extension\nruntimes:\n  pi:\n    command_name: ext-legacy\n" +
        "mirror_context_providers:\n  - id: context\n    description: fixture\n",
    );
    writeFileSync(
      join(legacy, "extension.py"),
      "def register(api):\n    api.register_mirror_context('context', _provide)\n" +
        "def _provide(api, request):\n" +
        "    api.execute(\"INSERT INTO ext_legacy_calls (value) VALUES ('called')\")\n" +
        "    api.commit()\n" +
        "    return 'legacy private context'\n",
    );
    const db = openDatabaseCopyForWrite(ws.dbPath);
    db.exec("CREATE TABLE ext_legacy_calls (value TEXT NOT NULL)");
    db.prepare(
      "INSERT INTO _ext_bindings (extension_id,capability_id,target_kind,target_id,created_at) VALUES (?, 'context', 'journey', 'mirror-ts-core', 't')",
    ).run("native");
    db.prepare(
      "INSERT INTO _ext_bindings (extension_id,capability_id,target_kind,target_id,created_at) VALUES (?, 'context', 'journey', 'mirror-ts-core', 't')",
    ).run("broken");
    db.prepare(
      "INSERT INTO _ext_bindings (extension_id,capability_id,target_kind,target_id,created_at) VALUES (?, 'context', 'journey', 'ancestor-journey', 't')",
    ).run("native");
    db.prepare(
      "INSERT INTO _ext_bindings (extension_id,capability_id,target_kind,target_id,created_at) VALUES (?, 'context', 'journey', 'mirror-ts-core', 't')",
    ).run("legacy");
    db.close();

    const load = spawnFrontDoor([
      "mirror",
      "load",
      "--journey",
      "mirror-ts-core",
      "--db-path",
      ws.dbPath,
    ]);
    assert.equal(load.status, 0, load.stderr);
    assert.match(
      load.stdout,
      /=== extension\/legacy\/context ===\nlegacy private context\n\n=== extension\/native\/context ===\nnative private context/,
    );
    assert.equal([...load.stdout.matchAll(/=== extension\/native\/context ===/g)].length, 1);
    assert.match(load.stderr, /warning: extension context invalid_output; continuing/);
    assert.doesNotMatch(load.stderr, /private provider stderr/);
    const log = readFileSync(join(mirrorHome, "front-door.log"), "utf8");
    assert.match(log, /\tmirror\tts\texit=0/);
    assert.doesNotMatch(
      log,
      /legacy private|native private|private provider stderr|mirror-ts-core/,
    );
    const after = openDatabaseReadOnly(ws.dbPath);
    assert.equal(after.prepare("SELECT COUNT(*) AS count FROM ext_legacy_calls").get()?.count, 1);
    after.close();
  } finally {
    ws.cleanup();
  }
});

test("front door mode activate/status/deactivate preserves the Python surface", () => {
  const ws = mirrorDbCopy();
  try {
    const activate = spawnFrontDoor([
      "mode",
      "activate",
      "Builder Mode",
      "--journey",
      "mirror-ts-core",
      "--db-path",
      ws.dbPath,
    ]);
    assert.equal(activate.status, 0, activate.stderr);
    assert.equal(activate.stdout, "Activated Builder Mode for mirror-ts-core\n");
    const status = spawnFrontDoor(["mode", "status", "--db-path", ws.dbPath]);
    assert.equal(status.stdout, "Builder Mode · mirror-ts-core\n");
    const deactivate = spawnFrontDoor(["mode", "deactivate", "--db-path", ws.dbPath]);
    assert.equal(deactivate.stdout, "Deactivated active mode\n");
    const after = spawnFrontDoor(["mode", "status", "--db-path", ws.dbPath]);
    assert.equal(after.stdout, "Mirror Mode\n");
  } finally {
    ws.cleanup();
  }
});
