import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import { resolveMirrorDefaults } from "#mirror/defaultResolution.ts";
import { GLOBAL_STICKY_DEFAULTS_SESSION_ID } from "#mirror/runtimeSession.ts";
import { ReplayLlmProvider } from "#providers/llm.ts";

function fixture() {
  const dir = mkdtempSync("/tmp/mirror-defaults-");
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createIdentityTable(db);
  createRuntimeTables(db);
  db.exec(
    "CREATE TABLE identity_descriptors (layer TEXT, key TEXT, descriptor TEXT, generated_at TEXT, PRIMARY KEY(layer,key))",
  );
  db.prepare(
    "INSERT INTO identity (id, layer, key, content, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, 't', 't', ?)",
  ).run("p", "persona", "engineer", "Engineer", JSON.stringify({ routing_keywords: ["debug"] }));
  db.prepare(
    "INSERT INTO identity (id, layer, key, content, created_at, updated_at) VALUES (?, ?, ?, ?, 't', 't')",
  ).run("j", "journey", "mirror-ts-core", "# Mirror TS Core");
  db.prepare(
    `INSERT INTO runtime_sessions
      (session_id, interface, persona, journey, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    GLOBAL_STICKY_DEFAULTS_SESSION_ID,
    "global_defaults",
    "sticky-persona",
    "sticky-journey",
    "t",
    "t",
  );
  return db;
}

test("explicit defaults win over reception and sticky values", async () => {
  const db = fixture();
  const provider = new ReplayLlmProvider({
    kind: "llm",
    responses: { reception: '{"personas":["engineer"],"journey":"mirror-ts-core"}' },
  });
  const result = await resolveMirrorDefaults(db, {
    persona: "explicit-persona",
    journey: "explicit-journey",
    query: "debug",
    receptionEnabled: true,
    llmProvider: provider,
  });
  assert.equal(result.persona, "explicit-persona");
  assert.equal(result.journey, "explicit-journey");
  db.close();
});

test("reception overrides sticky and controls identity/shadow gating", async () => {
  const db = fixture();
  const provider = new ReplayLlmProvider({
    kind: "llm",
    responses: {
      reception:
        '{"personas":["engineer"],"journey":"mirror-ts-core","touches_identity":false,"touches_shadow":true}',
    },
  });
  const result = await resolveMirrorDefaults(db, {
    query: "debug",
    receptionEnabled: true,
    llmProvider: provider,
  });
  assert.deepEqual(result, {
    persona: "engineer",
    journey: "mirror-ts-core",
    detectedJourney: null,
    touchesIdentity: false,
    touchesShadow: true,
  });
  db.close();
});

test("sticky defaults precede keyword fallback", async () => {
  const db = fixture();
  const result = await resolveMirrorDefaults(db, {
    query: "debug mirror ts core",
    receptionEnabled: false,
  });
  assert.equal(result.persona, "sticky-persona");
  assert.equal(result.journey, "sticky-journey");
  assert.equal(result.touchesIdentity, true);
  db.close();
});
