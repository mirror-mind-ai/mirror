// CR207: a host creates a persona, and deletes one after showing what goes.
//
// Nautilus for Mirror lists every persona in its sidebar and asked for the two
// acts CR205 left out. A persona's id is read, without a foreign key, in eight
// places; these tests hold what the deletion does with each:
//
//   - history stays: conversations, memories and runtime sessions keep the id,
//     as a record of who spoke;
//   - machinery goes: the persona's row, its descriptor, its identity
//     integrations and its extension bindings, so a persona that later takes
//     the same id starts clean;
//   - a Journey's `default_persona` naming it is removed, and the home's global
//     sticky default naming it is cleared;
//   - a persona another persona inherits from is refused, naming the heirs.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { DatabaseNotCurrentError } from "#conversation/hostCalls.ts";
import { regressTo016 } from "#helpers/legacyDb.ts";
import { tempDir } from "#helpers/tempDir.ts";
import { createHome } from "#init/createHome.ts";
import { routablePersonas } from "#mirror/personaRouter.ts";
import {
  createPersona,
  listPersonas,
  PersonaCallRejectedError,
  type PersonaCallRejection,
  readPersona,
  updatePersona,
} from "#persona/personaCalls.ts";
import {
  deletePersona,
  PERSONA_DELETION_INVENTORY,
  previewPersonaDeletion,
  verifiedPersonaDeletionBackup,
} from "#persona/personaDeletion.ts";

const NOW = "2026-11-08T12:00:00.000000Z";
const PROMPT = "# Gardener\n\nYou tend gardens: soil, seasons and pruning.\n";

function home(): string {
  const homePath = join(tempDir("mirror-persona-lifecycle-"), "ana-souza");
  createHome({ homePath, userName: "ana-souza" });
  return join(homePath, "memory.db");
}

function raw(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

function scalar(dbPath: string, sql: string, ...params: (string | null)[]): unknown {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
    return row === undefined ? undefined : Object.values(row)[0];
  } finally {
    db.close();
  }
}

function count(dbPath: string, sql: string, ...params: (string | null)[]): number {
  return Number(scalar(dbPath, sql, ...params));
}

function identityRows(dbPath: string): unknown[] {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare("SELECT * FROM identity ORDER BY layer, key").all();
  } finally {
    db.close();
  }
}

function rejects(call: () => unknown, reason: PersonaCallRejection, personas?: string[]): void {
  assert.throws(call, (error: unknown) => {
    assert.ok(error instanceof PersonaCallRejectedError, String(error));
    assert.equal(error.reason, reason);
    if (personas) assert.deepEqual(error.personas, personas);
    return true;
  });
}

function create(dbPath: string, persona = "gardener"): void {
  createPersona(dbPath, { persona, name: "Gardener", prompt: PROMPT });
}

/** The persona `gardener` named in every place a persona's id is read. */
function seedReferences(dbPath: string): void {
  create(dbPath);
  const db = raw(dbPath);
  try {
    const run = (sql: string, ...params: (string | null)[]) => db.prepare(sql).run(...params);
    run(
      "INSERT INTO conversations (id, started_at, interface, persona) VALUES ('c-g', ?, 'test', 'gardener')",
      NOW,
    );
    run(
      "INSERT INTO conversations (id, started_at, interface, persona) VALUES ('c-o', ?, 'test', 'coach')",
      NOW,
    );
    run(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES ('msg-g', 'c-g', 'assistant', 'Prune in winter.', ?)",
      NOW,
    );
    run(
      "INSERT INTO memories (id, memory_type, title, content, persona, conversation_id, created_at) VALUES ('m-g', 'note', 'Soil', 'x', 'gardener', 'c-g', ?)",
      NOW,
    );
    run(
      "INSERT INTO runtime_sessions (session_id, conversation_id, persona, started_at, updated_at) VALUES ('s-g', 'c-g', 'gardener', ?, ?)",
      NOW,
      NOW,
    );
    run(
      "INSERT INTO runtime_sessions (session_id, interface, persona, active, started_at, updated_at) VALUES ('__global_sticky_defaults__', 'global_defaults', 'gardener', 0, ?, ?)",
      NOW,
      NOW,
    );
    run(
      "INSERT INTO identity_descriptors (layer, key, descriptor, generated_at) VALUES ('persona', 'gardener', 'Gardens.', ?)",
      NOW,
    );
    run(
      "INSERT INTO identity_descriptors (layer, key, descriptor, generated_at) VALUES ('journey', 'gardener', 'A Journey with the same id.', ?)",
      NOW,
    );
    run(
      "INSERT INTO identity_integrations (id, layer, key, content, created_at) VALUES ('ii-g', 'persona', 'gardener', 'x', ?)",
      NOW,
    );
    run(
      "INSERT INTO identity_integrations (id, layer, key, content, created_at) VALUES ('ii-o', 'persona', 'coach', 'x', ?)",
      NOW,
    );
    run(
      "INSERT INTO _ext_bindings (extension_id, capability_id, target_kind, target_id, created_at) VALUES ('garden', 'beds', 'persona', 'gardener', ?)",
      NOW,
    );
    run(
      "INSERT INTO _ext_bindings (extension_id, capability_id, target_kind, target_id, created_at) VALUES ('garden', 'beds', 'journey', 'gardener', ?)",
      NOW,
    );
    run(
      "INSERT INTO identity (id, layer, key, content, created_at, updated_at, metadata) VALUES ('j-g', 'journey', 'allotment', 'x', ?, ?, ?)",
      NOW,
      NOW,
      JSON.stringify({ name: "Allotment", default_persona: "gardener", kept: 1 }),
    );
    run(
      "INSERT INTO identity (id, layer, key, content, created_at, updated_at, metadata) VALUES ('j-o', 'journey', 'office', 'x', ?, ?, ?)",
      NOW,
      NOW,
      JSON.stringify({ name: "Office", default_persona: "coach" }),
    );
  } finally {
    db.close();
  }
}

// ── create ──────────────────────────────────────────────────────────────────

test("createPersona writes one persona row and answers it as readPersona reads it", () => {
  const dbPath = home();
  const created = createPersona(dbPath, {
    persona: "gardener",
    name: "  Gardener  ",
    prompt: PROMPT,
    description: "  Gardens, soil and seasons.  ",
    routingKeywords: [" soil ", "pruning"],
  });
  assert.deepEqual(created, readPersona(dbPath, { persona: "gardener" }));
  assert.equal(created.name, "Gardener");
  assert.equal(created.prompt, PROMPT);
  assert.equal(created.description, "Gardens, soil and seasons.");
  assert.deepEqual(created.routingKeywords, ["soil", "pruning"]);
  assert.equal(created.defaultModel, null);
  assert.equal(created.inheritsFrom, null);
  assert.ok(listPersonas(dbPath).some((persona) => persona.id === "gardener"));

  const row = scalar(
    dbPath,
    "SELECT json_object('id', id, 'version', version, 'metadata', metadata) FROM identity WHERE layer = 'persona' AND key = 'gardener'",
  );
  const { id, version, metadata } = JSON.parse(String(row));
  assert.notEqual(id, "gardener", "the row's id is its own, as the seed's are");
  assert.equal(version, "1.0.0");
  assert.deepEqual(JSON.parse(metadata), {
    persona_id: "gardener",
    name: "Gardener",
    description: "Gardens, soil and seasons.",
    routing_keywords: ["soil", "pruning"],
  });
});

test("createPersona leaves out what it is not given", () => {
  const dbPath = home();
  create(dbPath);
  const metadata = scalar(
    dbPath,
    "SELECT metadata FROM identity WHERE layer = 'persona' AND key = 'gardener'",
  );
  assert.deepEqual(JSON.parse(String(metadata)), { persona_id: "gardener", name: "Gardener" });
  createPersona(dbPath, {
    persona: "pruner",
    name: "Pruner",
    prompt: PROMPT,
    description: null,
    routingKeywords: [],
  });
  const pruner = scalar(
    dbPath,
    "SELECT metadata FROM identity WHERE layer = 'persona' AND key = 'pruner'",
  );
  assert.deepEqual(JSON.parse(String(pruner)), { persona_id: "pruner", name: "Pruner" });
  const created = readPersona(dbPath, { persona: "gardener" });
  assert.equal(created.description, null);
  assert.deepEqual(created.routingKeywords, []);
  // The edit screen takes it back at once.
  const updated = updatePersona(dbPath, {
    persona: "gardener",
    expectedUpdatedAt: created.updatedAt,
    description: "Gardens.",
  });
  assert.equal(updated.description, "Gardens.");
});

test("a created persona is offered to the router by its description from the next turn", () => {
  const dbPath = home();
  createPersona(dbPath, {
    persona: "gardener",
    name: "Gardener",
    prompt: PROMPT,
    description: "Gardens, soil and seasons.",
  });
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const offered = routablePersonas(db as never).find((persona) => persona.key === "gardener");
    assert.deepEqual(offered, { key: "gardener", description: "Gardens, soil and seasons." });
  } finally {
    db.close();
  }
});

test("createPersona refuses a taken id, a malformed id and every bad field, writing nothing", () => {
  const dbPath = home();
  create(dbPath);
  const before = identityRows(dbPath);
  const base = { persona: "new-one", name: "New", prompt: PROMPT };
  rejects(() => createPersona(dbPath, { ...base, persona: "gardener" }), "persona_exists");
  rejects(() => createPersona(dbPath, { ...base, persona: "coach" }), "persona_exists");
  // The identity layer's own grammar for a new key (`identity/identityKey.ts`): a kebab slug.
  for (const persona of [
    "Gardener",
    "-new",
    "new-",
    "new--one",
    "novo_um",
    "é-novo",
    "x".repeat(81),
  ]) {
    rejects(() => createPersona(dbPath, { ...base, persona }), "invalid_persona_id");
  }
  rejects(() => createPersona(dbPath, { ...base, persona: "" }), "invalid_request");
  rejects(() => createPersona(dbPath, { ...base, name: "  " }), "invalid_name");
  rejects(() => createPersona(dbPath, { ...base, name: null as never }), "invalid_name");
  rejects(() => createPersona(dbPath, { ...base, prompt: " \n " }), "invalid_prompt");
  rejects(() => createPersona(dbPath, { ...base, description: "" }), "invalid_description");
  rejects(
    () => createPersona(dbPath, { ...base, routingKeywords: [""] }),
    "invalid_routing_keywords",
  );
  rejects(
    () => createPersona(dbPath, { ...base, inheritsFrom: "ego" } as never),
    "invalid_request",
  );
  assert.deepEqual(identityRows(dbPath), before);
});

test("createPersona accepts an id another layer already uses", () => {
  const dbPath = home();
  const journey = scalar(dbPath, "SELECT key FROM identity WHERE layer = 'journey' LIMIT 1");
  assert.equal(typeof journey, "string");
  createPersona(dbPath, { persona: String(journey), name: "Same id", prompt: PROMPT });
  assert.equal(readPersona(dbPath, { persona: String(journey) }).name, "Same id");
});

// ── preview ─────────────────────────────────────────────────────────────────

test("previewPersonaDeletion counts every place the persona is named, and changes nothing", () => {
  const dbPath = home();
  seedReferences(dbPath);
  const before = readFileSync(dbPath);
  const preview = previewPersonaDeletion(dbPath, { persona: "gardener" });
  assert.deepEqual(
    { ...preview, digest: "" },
    {
      persona: "gardener",
      heirs: [],
      kept: { conversations: 1, memories: 1, runtime_sessions: 1 },
      deleted: { descriptors: 1, identity_integrations: 1, extension_bindings: 1 },
      cleared: { journey_defaults: ["allotment"], sticky_default: true },
      digest: "",
    },
  );
  assert.match(preview.digest, /^[0-9a-f]{64}$/);
  assert.deepEqual(readFileSync(dbPath), before);
});

test("previewPersonaDeletion refuses a persona the home does not keep", () => {
  const dbPath = home();
  rejects(() => previewPersonaDeletion(dbPath, { persona: "nobody" }), "unknown_persona");
  rejects(() => previewPersonaDeletion(dbPath, { persona: "" }), "invalid_request");
});

test("the preview names the heirs, and the deletion refuses them", () => {
  const dbPath = home();
  create(dbPath);
  // Created after `teacher`, so the table's own order would put it last.
  create(dbPath, "aaa-heir");
  const db = raw(dbPath);
  try {
    db.prepare(
      "UPDATE identity SET metadata = json_set(metadata, '$.inherits_from', 'gardener') WHERE layer = 'persona' AND key IN ('teacher', 'aaa-heir')",
    ).run();
  } finally {
    db.close();
  }
  const preview = previewPersonaDeletion(dbPath, { persona: "gardener" });
  assert.deepEqual(preview.heirs, ["aaa-heir", "teacher"]);
  rejects(
    () => deletePersona(dbPath, { persona: "gardener", expectedDigest: preview.digest }),
    "persona_has_heirs",
    ["aaa-heir", "teacher"],
  );
  assert.equal(readPersona(dbPath, { persona: "gardener" }).name, "Gardener");
});

// ── delete ──────────────────────────────────────────────────────────────────

test("deletePersona removes the machinery, keeps the history and clears what named it", () => {
  const dbPath = home();
  seedReferences(dbPath);
  const preview = previewPersonaDeletion(dbPath, { persona: "gardener" });
  const receipt = deletePersona(dbPath, { persona: "gardener", expectedDigest: preview.digest });
  assert.deepEqual(receipt.deleted, preview);
  assert.ok(!listPersonas(dbPath).some((persona) => persona.id === "gardener"));

  // Machinery.
  assert.equal(
    count(dbPath, "SELECT COUNT(*) FROM identity WHERE layer = 'persona' AND key = 'gardener'"),
    0,
  );
  assert.equal(
    count(
      dbPath,
      "SELECT COUNT(*) FROM identity_descriptors WHERE layer = 'persona' AND key = 'gardener'",
    ),
    0,
  );
  assert.equal(
    count(
      dbPath,
      "SELECT COUNT(*) FROM identity_integrations WHERE layer = 'persona' AND key = 'gardener'",
    ),
    0,
  );
  assert.equal(
    count(
      dbPath,
      "SELECT COUNT(*) FROM _ext_bindings WHERE target_kind = 'persona' AND target_id = 'gardener'",
    ),
    0,
  );
  // What only shares the id, in another layer or kind, stays.
  assert.equal(
    count(
      dbPath,
      "SELECT COUNT(*) FROM identity_descriptors WHERE layer = 'journey' AND key = 'gardener'",
    ),
    1,
  );
  assert.equal(
    count(
      dbPath,
      "SELECT COUNT(*) FROM _ext_bindings WHERE target_kind = 'journey' AND target_id = 'gardener'",
    ),
    1,
  );
  assert.equal(count(dbPath, "SELECT COUNT(*) FROM identity_integrations WHERE key = 'coach'"), 1);

  // History.
  assert.equal(scalar(dbPath, "SELECT persona FROM conversations WHERE id = 'c-g'"), "gardener");
  assert.equal(
    scalar(dbPath, "SELECT content FROM messages WHERE id = 'msg-g'"),
    "Prune in winter.",
  );
  assert.equal(scalar(dbPath, "SELECT persona FROM memories WHERE id = 'm-g'"), "gardener");
  assert.equal(
    scalar(dbPath, "SELECT persona FROM runtime_sessions WHERE session_id = 's-g'"),
    "gardener",
  );

  // What named it as a live choice.
  const allotment = JSON.parse(
    String(
      scalar(dbPath, "SELECT metadata FROM identity WHERE layer = 'journey' AND key = 'allotment'"),
    ),
  );
  assert.deepEqual(allotment, { name: "Allotment", kept: 1 });
  const office = JSON.parse(
    String(
      scalar(dbPath, "SELECT metadata FROM identity WHERE layer = 'journey' AND key = 'office'"),
    ),
  );
  assert.equal(office.default_persona, "coach");
  assert.equal(
    scalar(
      dbPath,
      "SELECT persona FROM runtime_sessions WHERE session_id = '__global_sticky_defaults__'",
    ),
    null,
  );

  // The way back.
  assert.ok(existsSync(receipt.backup.path));
  assert.match(
    receipt.backup.path,
    /backups\/pre-persona-deletion-gardener-\d{8}T\d{6}Z-[0-9a-f]{12}\.db$/,
  );
  assert.equal((statSync(receipt.backup.path).mode & 0o777).toString(8), "600");
  assert.equal(
    receipt.backup.sha256,
    createHash("sha256").update(readFileSync(receipt.backup.path)).digest("hex"),
  );
  assert.equal(receipt.backup.sizeBytes, statSync(receipt.backup.path).size);
  const backupDb = new DatabaseSync(receipt.backup.path, { readOnly: true });
  try {
    assert.ok(
      backupDb.prepare("SELECT 1 FROM identity WHERE layer = 'persona' AND key = 'gardener'").get(),
    );
  } finally {
    backupDb.close();
  }
});

test("a persona that takes a deleted one's id starts clean", () => {
  const dbPath = home();
  seedReferences(dbPath);
  const { digest } = previewPersonaDeletion(dbPath, { persona: "gardener" });
  deletePersona(dbPath, { persona: "gardener", expectedDigest: digest });
  create(dbPath);
  const preview = previewPersonaDeletion(dbPath, { persona: "gardener" });
  assert.deepEqual(preview.deleted, {
    descriptors: 0,
    identity_integrations: 0,
    extension_bindings: 0,
  });
  assert.deepEqual(preview.cleared, { journey_defaults: [], sticky_default: false });
});

test("deletePersona refuses a home that changed since the preview, deleting nothing", () => {
  const dbPath = home();
  seedReferences(dbPath);
  const preview = previewPersonaDeletion(dbPath, { persona: "gardener" });
  const changes: [string, () => void][] = [
    [
      "edited",
      () => {
        updatePersona(dbPath, {
          persona: "gardener",
          expectedUpdatedAt: readPersona(dbPath, { persona: "gardener" }).updatedAt,
          name: "Gardener Two",
        });
      },
    ],
    [
      "routed",
      () =>
        raw(dbPath)
          .prepare(
            "INSERT INTO conversations (id, started_at, interface, persona) VALUES ('c-g2', ?, 'test', 'gardener')",
          )
          .run(NOW),
    ],
    [
      "bound",
      () =>
        raw(dbPath)
          .prepare(
            "INSERT INTO _ext_bindings (extension_id, capability_id, target_kind, target_id, created_at) VALUES ('garden', 'paths', 'persona', 'gardener', ?)",
          )
          .run(NOW),
    ],
  ];
  for (const [label, change] of changes) {
    const dir = join(dirname(dbPath), "backups");
    const backupsBefore = existsSync(dir) ? readdirSync(dir).length : 0;
    const { digest } = previewPersonaDeletion(dbPath, { persona: "gardener" });
    change();
    rejects(
      () => deletePersona(dbPath, { persona: "gardener", expectedDigest: digest }),
      "persona_changed",
    );
    assert.ok(readPersona(dbPath, { persona: "gardener" }), label);
    assert.equal(existsSync(dir) ? readdirSync(dir).length : 0, backupsBefore, label);
  }
  rejects(
    () => deletePersona(dbPath, { persona: "gardener", expectedDigest: preview.digest }),
    "persona_changed",
  );
  rejects(
    () => deletePersona(dbPath, { persona: "nobody", expectedDigest: preview.digest }),
    "unknown_persona",
  );
  rejects(
    () => deletePersona(dbPath, { persona: "gardener", expectedDigest: "" }),
    "invalid_request",
  );
});

test("a deletion that fails after its backup leaves no backup and deletes nothing", () => {
  const dbPath = home();
  seedReferences(dbPath);
  const db = raw(dbPath);
  try {
    db.exec(
      "CREATE TRIGGER hold_gardener BEFORE DELETE ON identity WHEN old.key = 'gardener' BEGIN SELECT RAISE(ABORT, 'held'); END",
    );
  } finally {
    db.close();
  }
  const { digest } = previewPersonaDeletion(dbPath, { persona: "gardener" });
  assert.throws(
    () => deletePersona(dbPath, { persona: "gardener", expectedDigest: digest }),
    /held/,
  );
  const dir = join(dirname(dbPath), "backups");
  assert.deepEqual(
    (existsSync(dir) ? readdirSync(dir) : []).filter((name) =>
      name.startsWith("pre-persona-deletion-"),
    ),
    [],
  );
  assert.equal(count(dbPath, "SELECT COUNT(*) FROM _ext_bindings WHERE target_id = 'gardener'"), 2);
  assert.equal(readPersona(dbPath, { persona: "gardener" }).name, "Gardener");
});

test("the backup check refuses a backup that does not read as the preview", () => {
  const dbPath = home();
  seedReferences(dbPath);
  const preview = previewPersonaDeletion(dbPath, { persona: "gardener" });
  rejects(
    () => verifiedPersonaDeletionBackup(dbPath, { ...preview, digest: "0".repeat(64) }),
    "backup_failed",
  );
  const dir = join(dirname(dbPath), "backups");
  assert.deepEqual(
    (existsSync(dir) ? readdirSync(dir) : []).filter((name) =>
      name.startsWith("pre-persona-deletion-"),
    ),
    [],
  );
  const backup = verifiedPersonaDeletionBackup(dbPath, preview);
  assert.ok(existsSync(backup.path));
  assert.ok(!existsSync(`${backup.path}-wal`));
});

test("the calls refuse a home that is not current", () => {
  const dbPath = home();
  create(dbPath);
  regressTo016(dbPath);
  assert.throws(
    () => createPersona(dbPath, { persona: "other", name: "Other", prompt: PROMPT }),
    DatabaseNotCurrentError,
  );
  assert.throws(
    () => previewPersonaDeletion(dbPath, { persona: "gardener" }),
    DatabaseNotCurrentError,
  );
  assert.throws(
    () => deletePersona(dbPath, { persona: "gardener", expectedDigest: "0".repeat(64) }),
    DatabaseNotCurrentError,
  );
});

test("every core column that holds a persona's id has a decision", () => {
  const dbPath = home();
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'memories_fts%' AND name NOT LIKE 'ext\\_%' ESCAPE '\\' ORDER BY name",
      )
      .all()
      .map((row) => String(row.name));
    const holders = tables.flatMap((table) =>
      db
        .prepare(`PRAGMA table_info("${table}")`)
        .all()
        .map((column) => String(column.name))
        .filter((column) => column === "persona" || column === "target_kind" || column === "layer")
        .map((column) => `${table}.${column}`),
    );
    const decided = [
      ...PERSONA_DELETION_INVENTORY.kept,
      ...PERSONA_DELETION_INVENTORY.deleted,
      ...PERSONA_DELETION_INVENTORY.cleared,
      ...PERSONA_DELETION_INVENTORY.notPersonas,
    ].map((entry) => entry.split(" ")[0]);
    assert.deepEqual(
      holders.filter((holder) => !decided.includes(holder)),
      [],
      "a column that can hold a persona's id has no decision in PERSONA_DELETION_INVENTORY",
    );
  } finally {
    db.close();
  }
});
