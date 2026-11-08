import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import { tempDir } from "#helpers/tempDir.ts";
import { resolveMirrorDefaults } from "#mirror/defaultResolution.ts";
import type { PersonaRouter, PersonaRouting } from "#mirror/personaRouter.ts";
import { GLOBAL_STICKY_DEFAULTS_SESSION_ID } from "#mirror/runtimeSession.ts";
import { ReplayLlmProvider } from "#providers/llm.ts";

function fixture() {
  const dir = tempDir("mirror-defaults-");
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

test("reception sets the Journey and the gating; it no longer decides the persona (CR203)", async () => {
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
    persona: null,
    journey: "mirror-ts-core",
    detectedJourney: null,
    touchesIdentity: false,
    touchesShadow: true,
  });
  db.close();
});

/** A router that answers as told and records what it was asked. */
function router(persona: string | null) {
  const asked: { prompt: string; journey: string | null }[] = [];
  const routings: PersonaRouting[] = [];
  return {
    asked,
    routings,
    personaRouter: {
      async route(input: { prompt: string; journey: string | null }): Promise<PersonaRouting> {
        asked.push({ prompt: input.prompt, journey: input.journey });
        return { persona, outcome: persona ? "chosen" : "below_threshold", model: "m" };
      },
    } satisfies PersonaRouter,
    onPersonaRouting: (routing: PersonaRouting) => {
      routings.push(routing);
    },
  };
}

test("the persona is the router's answer for the query, with the Journey already resolved (CR203)", async () => {
  const db = fixture();
  const routed = router("engineer");
  const result = await resolveMirrorDefaults(db, {
    query: "debug mirror ts core",
    receptionEnabled: false,
    personaRouter: routed.personaRouter,
    onPersonaRouting: routed.onPersonaRouting,
  });
  assert.equal(result.persona, "engineer");
  assert.deepEqual(routed.asked, [{ prompt: "debug mirror ts core", journey: "sticky-journey" }]);
  assert.equal(routed.routings.length, 1, "the call goes to the ledger's sink");
  db.close();
});

test("the sticky Journey still applies; the sticky persona and the keywords no longer do (CR203)", async () => {
  const db = fixture();
  const result = await resolveMirrorDefaults(db, {
    query: "debug mirror ts core",
    receptionEnabled: false,
  });
  assert.equal(result.persona, null, "neither sticky-persona nor the 'debug' keyword");
  assert.equal(result.journey, "sticky-journey");
  assert.equal(result.touchesIdentity, true);
  const none = router(null);
  assert.equal(
    (
      await resolveMirrorDefaults(db, {
        query: "debug mirror ts core",
        receptionEnabled: false,
        personaRouter: none.personaRouter,
      })
    ).persona,
    null,
  );
  db.close();
});

test("a named persona is not routed; a load without a query takes the Journey's default (CR203)", async () => {
  const db = fixture();
  db.prepare(
    "UPDATE identity SET metadata = ? WHERE layer = 'journey' AND key = 'mirror-ts-core'",
  ).run(JSON.stringify({ default_persona: "engineer" }));
  const named = router("engineer");
  const explicit = await resolveMirrorDefaults(db, {
    persona: "explicit-persona",
    query: "debug",
    receptionEnabled: false,
    personaRouter: named.personaRouter,
  });
  assert.equal(explicit.persona, "explicit-persona");
  assert.equal(named.asked.length, 0, "the person's word is not second-guessed");

  const unasked = router("other");
  const fallback = await resolveMirrorDefaults(db, {
    journey: "mirror-ts-core",
    receptionEnabled: false,
    personaRouter: unasked.personaRouter,
  });
  assert.equal(fallback.persona, "engineer");
  assert.equal(unasked.asked.length, 0, "no query, no routing call");

  const below = router(null);
  const routedNone = await resolveMirrorDefaults(db, {
    journey: "mirror-ts-core",
    query: "thanks",
    receptionEnabled: false,
    personaRouter: below.personaRouter,
  });
  assert.equal(routedNone.persona, "engineer", "the router said none: the Journey's default");
  db.close();
});
