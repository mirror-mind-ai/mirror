import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import {
  collectExtensionContext,
  MIRROR_CONTEXT_PROTOCOL,
  selectExtensionBindings,
} from "#extensions/contextRuntime.ts";

function workspace(): {
  root: string;
  dbPath: string;
  db: ReturnType<typeof openDatabaseCopyForWrite>;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), "mirror-extension-context-"));
  const temp = join(root, "tmp");
  mkdirSync(temp);
  mkdirSync(join(temp, "extensions"));
  const dbPath = join(temp, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  db.exec(`CREATE TABLE _ext_bindings (
    extension_id TEXT NOT NULL,
    capability_id TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    target_id TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (extension_id, capability_id, target_kind, target_id)
  )`);
  return { root: temp, dbPath, db, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function installNative(root: string, id: string, capability = "context"): void {
  const extension = join(root, "extensions", id);
  mkdirSync(extension, { recursive: true });
  writeFileSync(
    join(extension, "skill.yaml"),
    `id: ${id}\nname: ${id}\ncategory: extension\nkind: command-skill\nsummary: fixture\n` +
      `entrypoint:\n  module: extension\nruntimes:\n  pi:\n    command_name: ext-${id}\n` +
      `mirror_context_providers:\n  - id: ${capability}\n    description: fixture\n` +
      `    provider_runtime:\n      protocol: mirror-context-v1\n      command: [node, provider.mjs]\n`,
  );
  writeFileSync(join(extension, "extension.py"), "def register(api):\n    pass\n");
  writeFileSync(
    join(extension, "provider.mjs"),
    `let input = "";
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const text = [request.extension_id, request.capability_id, request.binding_kind,
  request.binding_target, request.persona_id, request.journey_id, request.user,
  request.query].join("|");
process.stdout.write(JSON.stringify({protocol: "mirror-context-v1", text}));
`,
  );
}

function bind(
  db: ReturnType<typeof openDatabaseCopyForWrite>,
  extension: string,
  capability: string,
  kind: string,
  target: string,
): void {
  db.prepare("INSERT INTO _ext_bindings VALUES (?, ?, ?, ?, 't')").run(
    extension,
    capability,
    kind,
    target,
  );
}

test("selects persona and journey bindings in the Python oracle order", () => {
  const ws = workspace();
  try {
    bind(ws.db, "zeta", "a", "persona", "engineer");
    bind(ws.db, "alpha", "z", "journey", "mirror-ts-core");
    bind(ws.db, "alpha", "a", "persona", "engineer");
    bind(ws.db, "alpha", "a", "journey", "other");
    assert.deepEqual(selectExtensionBindings(ws.db, "engineer", "mirror-ts-core"), [
      { extensionId: "alpha", capabilityId: "a", targetKind: "persona", targetId: "engineer" },
      {
        extensionId: "alpha",
        capabilityId: "z",
        targetKind: "journey",
        targetId: "mirror-ts-core",
      },
      { extensionId: "zeta", capabilityId: "a", targetKind: "persona", targetId: "engineer" },
    ]);
  } finally {
    ws.db.close();
    ws.cleanup();
  }
});

test("invokes native process providers in stable order and renders exact sections", () => {
  const ws = workspace();
  try {
    installNative(ws.root, "zeta");
    installNative(ws.root, "alpha");
    bind(ws.db, "zeta", "context", "persona", "engineer");
    bind(ws.db, "alpha", "context", "journey", "mirror-ts-core");
    const result = collectExtensionContext(ws.db, {
      mirrorHome: ws.root,
      databasePath: ws.dbPath,
      personaId: "engineer",
      journeyId: "mirror-ts-core",
      user: "private-user",
      query: "private-query",
    });
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.sections.length, 2);
    assert.equal(
      result.rendered,
      "=== extension/alpha/context ===\n" +
        "alpha|context|journey|mirror-ts-core|engineer|mirror-ts-core|private-user|private-query\n\n" +
        "=== extension/zeta/context ===\n" +
        "zeta|context|persona|engineer|engineer|mirror-ts-core|private-user|private-query",
    );
  } finally {
    ws.db.close();
    ws.cleanup();
  }
});

test("normalizes Unicode/null/empty output and rejects wrong-version or oversized output", () => {
  const ws = workspace();
  try {
    installNative(ws.root, "shapes");
    writeFileSync(
      join(ws.root, "extensions", "shapes", "provider.mjs"),
      `let input = ""; for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const result = request.query === "null" ? null : request.query === "empty" ? "" :
  request.query === "large" ? "x".repeat(5000) : "Olá 🧭";
process.stdout.write(JSON.stringify({protocol: request.query === "wrong" ? "wrong" : request.protocol, text: result}));`,
    );
    bind(ws.db, "shapes", "context", "persona", "engineer");
    const collect = (query: string, maxOutputBytes = 1024 * 1024) =>
      collectExtensionContext(ws.db, {
        mirrorHome: ws.root,
        databasePath: ws.dbPath,
        personaId: "engineer",
        query,
        maxOutputBytes,
      });
    assert.match(collect("unicode").rendered, /Olá 🧭$/u);
    assert.equal(collect("null").rendered, "");
    assert.equal(collect("empty").rendered, "");
    assert.deepEqual(collect("wrong").diagnostics, [{ kind: "invalid_output" }]);
    assert.deepEqual(collect("large", 100).diagnostics, [{ kind: "provider_failed" }]);
  } finally {
    ws.db.close();
    ws.cleanup();
  }
});

test("native providers observe and commit through the SQLite seam on a second connection", () => {
  const ws = workspace();
  try {
    installNative(ws.root, "writer");
    ws.db.exec("CREATE TABLE ext_writer_events (value TEXT NOT NULL)");
    writeFileSync(
      join(ws.root, "extensions", "writer", "provider.mjs"),
      `import { DatabaseSync } from "node:sqlite";
let input = ""; for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const db = new DatabaseSync(request.database_path);
db.prepare("INSERT INTO ext_writer_events VALUES ('committed')").run();
db.close();
process.stdout.write(JSON.stringify({protocol: request.protocol, text: "wrote"}));`,
    );
    bind(ws.db, "writer", "context", "journey", "mirror-ts-core");
    const result = collectExtensionContext(ws.db, {
      mirrorHome: ws.root,
      databasePath: ws.dbPath,
      journeyId: "mirror-ts-core",
    });
    assert.equal(result.rendered, "=== extension/writer/context ===\nwrote");
    assert.equal(ws.db.prepare("SELECT COUNT(*) count FROM ext_writer_events").get()?.count, 1);
  } finally {
    ws.db.close();
    ws.cleanup();
  }
});

test("legacy descriptors use the compatibility command without changing the protocol", () => {
  const ws = workspace();
  try {
    const extension = join(ws.root, "extensions", "legacy");
    mkdirSync(extension);
    writeFileSync(
      join(extension, "skill.yaml"),
      "id: legacy\nname: Legacy\ncategory: extension\nkind: command-skill\nsummary: fixture\n" +
        "entrypoint:\n  module: extension\nruntimes:\n  pi:\n    command_name: ext-legacy\n" +
        "mirror_context_providers:\n  - id: context\n    description: fixture\n",
    );
    writeFileSync(join(extension, "extension.py"), "def register(api):\n    pass\n");
    const host = join(ws.root, "legacy-host.mjs");
    writeFileSync(
      host,
      `let input = ""; for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
process.stdout.write(JSON.stringify({protocol: request.protocol, text: "legacy:" + request.capability_id}));`,
    );
    bind(ws.db, "legacy", "context", "journey", "mirror-ts-core");
    const result = collectExtensionContext(ws.db, {
      mirrorHome: ws.root,
      databasePath: ws.dbPath,
      journeyId: "mirror-ts-core",
      legacyCommand: [process.execPath, host],
    });
    assert.equal(result.rendered, "=== extension/legacy/context ===\nlegacy:context");
    assert.equal(MIRROR_CONTEXT_PROTOCOL, "mirror-context-v1");
  } finally {
    ws.db.close();
    ws.cleanup();
  }
});

test("missing, malformed, failed, and timed-out providers are isolated without payload diagnostics", () => {
  const ws = workspace();
  try {
    bind(ws.db, "ghost", "context", "persona", "engineer");
    const bad = join(ws.root, "extensions", "bad");
    mkdirSync(bad);
    writeFileSync(join(bad, "skill.yaml"), "id: bad\nmirror_context_providers: []\n");
    bind(ws.db, "bad", "context", "persona", "engineer");
    const escapeRoot = join(ws.root, "extensions", "escape");
    mkdirSync(escapeRoot);
    writeFileSync(
      join(escapeRoot, "skill.yaml"),
      "id: escape\nmirror_context_providers:\n  - id: context\n    provider_runtime:\n" +
        "      protocol: mirror-context-v1\n      command: [node, ../escape.mjs]\n",
    );
    bind(ws.db, "escape", "context", "persona", "engineer");
    installNative(ws.root, "failed");
    writeFileSync(join(ws.root, "extensions", "failed", "provider.mjs"), "process.exit(7);\n");
    bind(ws.db, "failed", "context", "persona", "engineer");
    installNative(ws.root, "slow");
    writeFileSync(
      join(ws.root, "extensions", "slow", "provider.mjs"),
      "setTimeout(() => {}, 10000);\n",
    );
    bind(ws.db, "slow", "context", "persona", "engineer");
    const result = collectExtensionContext(ws.db, {
      mirrorHome: ws.root,
      databasePath: ws.dbPath,
      personaId: "engineer",
      timeoutMs: 500,
    });
    assert.equal(result.rendered, "");
    assert.deepEqual(
      result.diagnostics.map((item) => item.kind),
      [
        "unknown_capability",
        "invalid_manifest",
        "provider_failed",
        "missing_extension",
        "provider_timeout",
      ],
    );
    assert.doesNotMatch(JSON.stringify(result.diagnostics), /engineer|private|escape|ghost|slow/);
  } finally {
    ws.db.close();
    ws.cleanup();
  }
});
