// CR205: a host reads and edits a persona, in a home `createHome` made.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { DatabaseNotCurrentError } from "#conversation/hostCalls.ts";
import { openDatabaseReadOnly } from "#db/database.ts";
import { regressTo016 } from "#helpers/legacyDb.ts";
import { tempDir } from "#helpers/tempDir.ts";
import { createHome } from "#init/createHome.ts";
import {
  listPersonas,
  PersonaCallRejectedError,
  type PersonaCallRejection,
  readPersona,
  updatePersona,
} from "#persona/personaCalls.ts";

const COACH = "coach";

function home(): string {
  const homePath = join(tempDir("mirror-personas-"), "ana-souza");
  createHome({ homePath, userName: "ana-souza" });
  return join(homePath, "memory.db");
}

interface Row {
  key: string;
  content: string;
  version: string;
  updated_at: string;
  metadata: string | null;
}

function row(dbPath: string, key: string): Row {
  const db = openDatabaseReadOnly(dbPath);
  try {
    const found = db
      .prepare(
        "SELECT key, content, version, updated_at, metadata FROM identity WHERE layer = 'persona' AND key = ?",
      )
      .get(key) as unknown as Row | undefined;
    assert.ok(found, `persona ${key}`);
    return found;
  } finally {
    db.close();
  }
}

function allRows(dbPath: string): Row[] {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return db
      .prepare(
        "SELECT key, content, version, updated_at, metadata FROM identity ORDER BY layer, key",
      )
      .all() as unknown as Row[];
  } finally {
    db.close();
  }
}

function setVersion(dbPath: string, key: string, version: string): void {
  const db = new DatabaseSync(dbPath);
  try {
    db.prepare("UPDATE identity SET version = ? WHERE layer = 'persona' AND key = ?").run(
      version,
      key,
    );
  } finally {
    db.close();
  }
}

/** Write a persona's metadata as an older home might hold it. */
function setRawMetadata(dbPath: string, key: string, metadata: string | null): void {
  const db = new DatabaseSync(dbPath);
  try {
    db.prepare("UPDATE identity SET metadata = ? WHERE layer = 'persona' AND key = ?").run(
      metadata,
      key,
    );
  } finally {
    db.close();
  }
}

function rejects(call: () => unknown, reason: PersonaCallRejection): void {
  assert.throws(call, (error: unknown) => {
    assert.ok(error instanceof PersonaCallRejectedError, String(error));
    assert.equal(error.reason, reason);
    return true;
  });
}

test("listPersonas answers every persona's id, name and description, by id", () => {
  const dbPath = home();
  setRawMetadata(dbPath, "strategist", null);
  const personas = listPersonas(dbPath);
  const ids = personas.map((persona) => persona.id);
  assert.deepEqual(ids, [...ids].sort());
  assert.ok(ids.includes(COACH));
  const coach = personas.find((persona) => persona.id === COACH);
  assert.equal(coach?.name, "Coach");
  assert.match(coach?.description ?? "", /accountability/);
  assert.deepEqual(
    personas.find((persona) => persona.id === "strategist"),
    { id: "strategist", name: null, description: null },
  );
});

test("readPersona answers the persona whole, and null for what it lacks", () => {
  const dbPath = home();
  const stored = row(dbPath, COACH);
  const coach = readPersona(dbPath, { persona: COACH });
  assert.equal(coach.id, COACH);
  assert.equal(coach.name, "Coach");
  assert.equal(coach.prompt, stored.content);
  assert.match(coach.description ?? "", /accountability/);
  assert.ok(coach.routingKeywords.length > 0);
  assert.equal(coach.defaultModel, "anthropic/claude-sonnet-4.6");
  assert.equal(coach.inheritsFrom, "ego");
  assert.equal(coach.updatedAt, stored.updated_at);

  setRawMetadata(dbPath, COACH, null);
  assert.deepEqual(
    { ...readPersona(dbPath, { persona: COACH }), prompt: "", updatedAt: "" },
    {
      id: COACH,
      name: null,
      description: null,
      prompt: "",
      routingKeywords: [],
      defaultModel: null,
      inheritsFrom: null,
      updatedAt: "",
    },
  );
});

test("readPersona refuses a persona the home does not keep", () => {
  const dbPath = home();
  rejects(() => readPersona(dbPath, { persona: "nobody" }), "unknown_persona");
  rejects(() => readPersona(dbPath, { persona: "" }), "invalid_request");
});

test("updatePersona writes only the fields it is given, and keeps every other key", () => {
  const dbPath = home();
  const before = row(dbPath, COACH);
  const extra = { ...JSON.parse(before.metadata ?? "{}"), briefing: "kept", legacy: 7 };
  setRawMetadata(dbPath, COACH, JSON.stringify(extra));
  setVersion(dbPath, COACH, "2.3.0");
  const expectedUpdatedAt = row(dbPath, COACH).updated_at;

  const updated = updatePersona(dbPath, {
    persona: COACH,
    expectedUpdatedAt,
    name: "  Treinadora  ",
  });
  assert.equal(updated.name, "Treinadora");
  const after = row(dbPath, COACH);
  assert.equal(after.content, before.content);
  assert.equal(after.version, "2.3.0");
  assert.notEqual(after.updated_at, expectedUpdatedAt);
  assert.equal(updated.updatedAt, after.updated_at);
  assert.deepEqual(JSON.parse(after.metadata ?? "{}"), { ...extra, name: "Treinadora" });
  assert.deepEqual(Object.keys(JSON.parse(after.metadata ?? "{}")), Object.keys(extra));
});

test("updatePersona changes the prompt, the description and the routing keywords", () => {
  const dbPath = home();
  const updated = updatePersona(dbPath, {
    persona: COACH,
    expectedUpdatedAt: row(dbPath, COACH).updated_at,
    prompt: "# Coach\n\nNew words.\n",
    description: "  Habits and momentum.  ",
    routingKeywords: [" habits ", "momentum"],
  });
  assert.equal(updated.prompt, "# Coach\n\nNew words.\n");
  assert.equal(updated.description, "Habits and momentum.");
  assert.deepEqual(updated.routingKeywords, ["habits", "momentum"]);
  const meta = JSON.parse(row(dbPath, COACH).metadata ?? "{}");
  assert.equal(meta.description, "Habits and momentum.");
  assert.deepEqual(meta.routing_keywords, ["habits", "momentum"]);
  assert.equal(row(dbPath, COACH).content, "# Coach\n\nNew words.\n");
});

test("null removes a name or a description, and an empty list removes the keywords", () => {
  const dbPath = home();
  updatePersona(dbPath, {
    persona: COACH,
    expectedUpdatedAt: row(dbPath, COACH).updated_at,
    name: null,
    description: null,
    routingKeywords: [],
  });
  const meta = JSON.parse(row(dbPath, COACH).metadata ?? "{}");
  assert.ok(!("name" in meta));
  assert.ok(!("description" in meta));
  assert.ok(!("routing_keywords" in meta));
  assert.equal(meta.default_model, "anthropic/claude-sonnet-4.6");
});

test("a persona with no metadata gains only what it is given", () => {
  const dbPath = home();
  setRawMetadata(dbPath, COACH, null);
  updatePersona(dbPath, {
    persona: COACH,
    expectedUpdatedAt: row(dbPath, COACH).updated_at,
    name: "Coach",
  });
  assert.equal(row(dbPath, COACH).metadata, JSON.stringify({ name: "Coach" }));
});

test("an update that changes nothing writes nothing", () => {
  const dbPath = home();
  const before = row(dbPath, COACH);
  const answer = updatePersona(dbPath, {
    persona: COACH,
    expectedUpdatedAt: before.updated_at,
    name: "Coach",
    prompt: before.content,
  });
  assert.deepEqual(row(dbPath, COACH), before);
  assert.equal(answer.updatedAt, before.updated_at);
});

test("updatePersona refuses an invalid field, naming it, and writes nothing", () => {
  const dbPath = home();
  const before = allRows(dbPath);
  const expectedUpdatedAt = row(dbPath, COACH).updated_at;
  const update = (fields: Record<string, unknown>) => () =>
    updatePersona(dbPath, { persona: COACH, expectedUpdatedAt, ...fields } as never);
  rejects(update({ name: "   " }), "invalid_name");
  rejects(update({ name: "x".repeat(81) }), "invalid_name");
  rejects(update({ name: "Co\nach" }), "invalid_name");
  rejects(update({ name: "Co\u0085ach" }), "invalid_name");
  rejects(update({ name: 7 }), "invalid_name");
  rejects(update({ prompt: "  \n " }), "invalid_prompt");
  rejects(update({ prompt: null }), "invalid_prompt");
  rejects(update({ description: "" }), "invalid_description");
  rejects(update({ description: "x".repeat(2001) }), "invalid_description");
  rejects(update({ routingKeywords: "habits" }), "invalid_routing_keywords");
  rejects(update({ routingKeywords: ["habits", " "] }), "invalid_routing_keywords");
  rejects(update({ routingKeywords: ["habits", 3] }), "invalid_routing_keywords");
  rejects(update({ routingKeywords: ["hab\tits"] }), "invalid_routing_keywords");
  rejects(update({}), "invalid_request");
  rejects(update({ defaultModel: "other/model" }), "invalid_request");
  rejects(update({ inheritsFrom: "self" }), "invalid_request");
  rejects(update({ name: "Fine", defaultModel: "other/model" }), "invalid_request");
  // A valid field beside an invalid one writes neither.
  rejects(update({ name: "Fine", prompt: "" }), "invalid_prompt");
  assert.deepEqual(allRows(dbPath), before);
});

test("updatePersona refuses a stale edit, an unknown persona and unreadable metadata", () => {
  const dbPath = home();
  const before = row(dbPath, COACH);
  rejects(
    () => updatePersona(dbPath, { persona: COACH, expectedUpdatedAt: "2000-01-01", name: "X" }),
    "persona_changed",
  );
  rejects(
    () => updatePersona(dbPath, { persona: COACH, expectedUpdatedAt: "", name: "X" }),
    "invalid_request",
  );
  rejects(
    () =>
      updatePersona(dbPath, {
        persona: "nobody",
        expectedUpdatedAt: before.updated_at,
        name: "X",
      }),
    "unknown_persona",
  );
  setRawMetadata(dbPath, COACH, "{not json");
  const broken = row(dbPath, COACH);
  rejects(
    () =>
      updatePersona(dbPath, { persona: COACH, expectedUpdatedAt: broken.updated_at, name: "X" }),
    "metadata_unreadable",
  );
  assert.deepEqual(row(dbPath, COACH), broken);
  // The prompt alone does not touch the metadata, so it can still change.
  updatePersona(dbPath, {
    persona: COACH,
    expectedUpdatedAt: broken.updated_at,
    prompt: "Only the words.",
  });
  assert.equal(row(dbPath, COACH).metadata, "{not json");
  assert.equal(row(dbPath, COACH).content, "Only the words.");
});

test("a write goes behind the front door's verified snapshot", () => {
  const dbPath = home();
  const snapshot = join(dbPath, "..", "backups", "frontdoor-pre-write-backup.db");
  assert.ok(!existsSync(snapshot));
  updatePersona(dbPath, {
    persona: COACH,
    expectedUpdatedAt: row(dbPath, COACH).updated_at,
    name: "Treinadora",
  });
  assert.ok(existsSync(snapshot));
});

test("a database that is not current is refused before anything is opened for writing", () => {
  const dbPath = home();
  const updatedAt = row(dbPath, COACH).updated_at;
  regressTo016(dbPath);
  const before = allRows(dbPath);
  assert.throws(() => listPersonas(dbPath), DatabaseNotCurrentError);
  assert.throws(() => readPersona(dbPath, { persona: COACH }), DatabaseNotCurrentError);
  assert.throws(
    () => updatePersona(dbPath, { persona: COACH, expectedUpdatedAt: updatedAt, name: "X" }),
    DatabaseNotCurrentError,
  );
  assert.deepEqual(allRows(dbPath), before);
  assert.ok(!existsSync(join(dbPath, "..", "backups", "frontdoor-pre-write-backup.db")));
});
