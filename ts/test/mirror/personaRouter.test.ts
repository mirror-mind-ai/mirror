// CR203: a turn's persona by its subject, or none. The Decisions route is
// `alpha`, so its shapes are pinned here with recorded bodies; every failure
// lands on none; the Journey's own default comes after the router, never
// before it; and the ledger keeps the call without its content.

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { openDatabaseReadOnly } from "#db/database.ts";
import { personaRouterFor } from "#frontDoor/mirrorModeRoute.ts";
import { tempDir } from "#helpers/tempDir.ts";
import { createHome } from "#init/createHome.ts";
import {
  DECISIONS_BASE_URL,
  DECISIONS_PATH,
  decisionsRequest,
  journeyDefaultPersona,
  LivePersonaRouter,
  loadReplayPersonaRouter,
  type PersonaRouter,
  type PersonaRouting,
  personaRoutingLedger,
  ReplayPersonaRouter,
  readDecisionsAnswer,
  routablePersonas,
  routeTurnPersona,
} from "#mirror/personaRouter.ts";
import type { ProviderConfig } from "#providers/config.ts";
import type { OpenRouterClient, ProviderRequestOptions } from "#providers/openrouter.ts";

const PERSONAS = [
  { key: "writer", description: "Writes and edits prose." },
  { key: "coach", description: "Plans the week and keeps commitments." },
];

/** A body recorded from the route on 2026-11-07, with the template's personas. */
function recordedAnswer(choice: unknown, noul: unknown): unknown {
  return {
    answers: {
      persona: {
        type: "choice",
        choice,
        probabilities: { writer: 0.71, coach: 0.29 },
        confidence: 0.42,
      },
      fits: { type: "noul", noul },
    },
    usage: { input_tokens: 2150, output_tokens: 0, cost: 9.03e-5 },
  };
}

test("the request is the eval's: one Choice among the personas and one Noul, in one body", () => {
  assert.deepEqual(
    decisionsRequest("liquid/d1-ultra", {
      prompt: "Help me tighten this paragraph.",
      journey: "book",
      personas: PERSONAS,
    }),
    {
      model: "liquid/d1-ultra",
      state: { journey: "book", request: "Help me tighten this paragraph." },
      questions: {
        persona: {
          type: "choice",
          instructions:
            "Which specialist should answer this request, judging only by the subject of `request`?",
          criteria: {
            writer: "Writes and edits prose.",
            coach: "Plans the week and keeps commitments.",
          },
        },
        fits: {
          type: "noul",
          instructions:
            "Does the subject of `request` clearly belong to the domain of one specific specialist from this list: writer: Writes and edits prose.; coach: Plans the week and keeps commitments.?",
          criteria: {
            true: "The request asks for expertise that one listed specialist clearly owns.",
            false:
              "The request is a plain instruction, a confirmation, a general question, or its subject belongs to no listed specialist.",
          },
        },
      },
    },
  );
});

test("the request bounds what the model reads: the prompt and each description", () => {
  const body = decisionsRequest("m", {
    prompt: "x".repeat(5000),
    journey: null,
    personas: [{ key: "writer", description: "d".repeat(500) }],
  }) as {
    state: { request: string; journey: null };
    questions: { persona: { criteria: Record<string, string> }; fits: { instructions: string } };
  };
  assert.equal(body.state.request.length, 2000);
  assert.equal(body.state.journey, null);
  assert.equal(body.questions.persona.criteria.writer?.length, 280);
  assert.ok(body.questions.fits.instructions.includes(`writer: ${"d".repeat(90)}?`));
});

test("the answer: a known persona at or above the threshold is taken, and nothing else is", () => {
  assert.deepEqual(readDecisionsAnswer(recordedAnswer("writer", 0.6), PERSONAS, 0.6), {
    persona: "writer",
    outcome: "chosen",
    noul: 0.6,
    costUsd: 9.03e-5,
  });
  assert.deepEqual(readDecisionsAnswer(recordedAnswer("writer", 0.59), PERSONAS, 0.6), {
    persona: null,
    outcome: "below_threshold",
    noul: 0.59,
    costUsd: 9.03e-5,
  });
  assert.equal(
    readDecisionsAnswer(recordedAnswer("doctor", 0.9), PERSONAS, 0.6).outcome,
    "unknown_persona",
  );
  assert.equal(readDecisionsAnswer(recordedAnswer("doctor", 0.9), PERSONAS, 0.6).persona, null);
});

test("a malformed answer is none", () => {
  for (const body of [
    null,
    "writer",
    {},
    { answers: {} },
    recordedAnswer(7, 0.9),
    recordedAnswer("writer", "0.9"),
    recordedAnswer("writer", 1.5),
    recordedAnswer("writer", -0.1),
    recordedAnswer("writer", Number.NaN),
  ]) {
    const read = readDecisionsAnswer(body, PERSONAS, 0.6);
    assert.equal(read.persona, null, JSON.stringify(body));
    assert.equal(read.outcome, "malformed");
  }
});

/** A client that records what it was asked and answers as told. */
function fakeClient(answer: () => unknown) {
  const calls: {
    config: ProviderConfig;
    path: string;
    body: unknown;
    options: ProviderRequestOptions;
  }[] = [];
  const createClient = (config: ProviderConfig): OpenRouterClient => ({
    async postJson(path, body, options) {
      calls.push({ config, path, body, options });
      return answer();
    },
    async getJson() {
      throw new Error("not used");
    },
  });
  return { calls, createClient };
}

test("the live router asks the Decisions route once, bounded like reception, with the key it was given", async () => {
  const fake = fakeClient(() => recordedAnswer("writer", 0.8));
  let tick = 1000;
  const router = new LivePersonaRouter({
    env: { OPENROUTER_API_KEY: "sk-test" },
    createClient: fake.createClient,
    clock: () => {
      tick += 250;
      return tick;
    },
  });
  const routed = await router.route({ prompt: "Edit this.", journey: null, personas: PERSONAS });
  assert.deepEqual(routed, {
    persona: "writer",
    outcome: "chosen",
    noul: 0.8,
    costUsd: 9.03e-5,
    model: "liquid/d1-ultra",
    latencyMs: 250,
  });
  assert.equal(fake.calls.length, 1);
  const [call] = fake.calls;
  assert.equal(call?.path, DECISIONS_PATH);
  assert.equal(call?.config.baseUrl, DECISIONS_BASE_URL);
  assert.equal(call?.config.apiKey, "sk-test");
  assert.deepEqual(call?.options, { timeoutMs: 10_000, maxRetries: 0 });
});

test("the model and the threshold are settings; an invalid threshold reads as unset", async () => {
  const fake = fakeClient(() => recordedAnswer("writer", 0.7));
  const configured = new LivePersonaRouter({
    env: {
      OPENROUTER_API_KEY: "k",
      MEMORY_PERSONA_ROUTER_MODEL: "typesafe/jev-1.14",
      MEMORY_PERSONA_ROUTER_THRESHOLD: "0.75",
    },
    createClient: fake.createClient,
  });
  const routed = await configured.route({ prompt: "p", journey: null, personas: PERSONAS });
  assert.equal(routed.outcome, "below_threshold");
  assert.equal(routed.model, "typesafe/jev-1.14");
  assert.equal((fake.calls[0]?.body as { model: string }).model, "typesafe/jev-1.14");

  for (const threshold of ["", "abc", "1.5", "-1"]) {
    const router = new LivePersonaRouter({
      env: { OPENROUTER_API_KEY: "k", MEMORY_PERSONA_ROUTER_THRESHOLD: threshold },
      createClient: fake.createClient,
    });
    const answer = await router.route({ prompt: "p", journey: null, personas: PERSONAS });
    assert.equal(answer.outcome, "chosen", `threshold ${JSON.stringify(threshold)} reads as 0.6`);
  }
});

test("no key, no personas, or a failed call: none, and the turn goes on", async () => {
  const fake = fakeClient(() => recordedAnswer("writer", 0.9));
  const noKey = new LivePersonaRouter({ env: {}, createClient: fake.createClient });
  assert.deepEqual(await noKey.route({ prompt: "p", journey: null, personas: PERSONAS }), {
    persona: null,
    outcome: "no_key",
  });
  const keyed = new LivePersonaRouter({
    env: { OPENROUTER_API_KEY: "k" },
    createClient: fake.createClient,
  });
  assert.deepEqual(await keyed.route({ prompt: "p", journey: null, personas: [] }), {
    persona: null,
    outcome: "no_personas",
  });
  assert.equal(fake.calls.length, 0, "no call without a key or a persona");

  const failing = fakeClient(() => {
    throw new Error("timed out");
  });
  const routed = await new LivePersonaRouter({
    env: { OPENROUTER_API_KEY: "k" },
    createClient: failing.createClient,
  }).route({ prompt: "p", journey: null, personas: PERSONAS });
  assert.equal(routed.persona, null);
  assert.equal(routed.outcome, "failed");
  assert.equal(routed.model, "liquid/d1-ultra", "a call was made, so the ledger sees it");
});

function home(): { dbPath: string; journey: string } {
  const root = tempDir("mirror-persona-router-");
  const homePath = join(root, "ana-souza");
  createHome({ homePath, userName: "ana-souza" });
  const dbPath = join(homePath, "memory.db");
  const db = openDatabaseReadOnly(dbPath);
  const journey = String(
    db.prepare("SELECT key FROM identity WHERE layer = 'journey' ORDER BY key").get()?.key,
  );
  db.close();
  return { dbPath, journey };
}

function setJourneyDefault(dbPath: string, journey: string, persona: unknown): void {
  const db = new DatabaseSync(dbPath);
  const row = db
    .prepare("SELECT metadata FROM identity WHERE layer = 'journey' AND key = ?")
    .get(journey) as { metadata: string | null };
  const metadata = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
  db.prepare("UPDATE identity SET metadata = ? WHERE layer = 'journey' AND key = ?").run(
    JSON.stringify({ ...metadata, default_persona: persona }),
    journey,
  );
  db.close();
}

const answering = (routing: PersonaRouting): PersonaRouter => ({ route: async () => routing });

test("each persona is offered with its own description, else its descriptor, else the start of its content", () => {
  const { dbPath } = home();
  const db = new DatabaseSync(dbPath);
  const set = (key: string, metadata: unknown) =>
    db
      .prepare("UPDATE identity SET metadata = ? WHERE layer = 'persona' AND key = ?")
      .run(metadata === null ? null : JSON.stringify(metadata), key);
  set("writer", { description: "  Writes and edits prose.\n" });
  set("coach", { description: "" });
  set("designer", null);
  db.prepare(
    "INSERT OR REPLACE INTO identity_descriptors (layer, key, descriptor, generated_at) VALUES ('persona', ?, ?, 't')",
  ).run("writer", "A generated line about writing.");
  db.prepare(
    "INSERT OR REPLACE INTO identity_descriptors (layer, key, descriptor, generated_at) VALUES ('persona', ?, ?, 't')",
  ).run("coach", "A generated line about coaching.");
  db.prepare("DELETE FROM identity_descriptors WHERE layer = 'persona' AND key = 'designer'").run();
  const content = String(
    db.prepare("SELECT content FROM identity WHERE layer = 'persona' AND key = 'designer'").get()
      ?.content,
  );
  db.close();
  const read = openDatabaseReadOnly(dbPath);
  try {
    const offered = new Map(
      routablePersonas(read).map((persona) => [persona.key, persona.description]),
    );
    assert.equal(offered.get("writer"), "Writes and edits prose.", "the declared purpose first");
    assert.equal(offered.get("coach"), "A generated line about coaching.", "then the descriptor");
    assert.equal(offered.get("designer"), [...content].slice(0, 200).join(""), "then the content");
  } finally {
    read.close();
  }
});

test("the router is offered every persona with its descriptor, or the start of its content", () => {
  const { dbPath } = home();
  const db = openDatabaseReadOnly(dbPath);
  try {
    const personas = routablePersonas(db);
    const keys = db
      .prepare("SELECT key FROM identity WHERE layer = 'persona' ORDER BY key")
      .all()
      .map((row) => String(row.key));
    assert.deepEqual(
      personas.map((persona) => persona.key),
      keys,
    );
    assert.ok(personas.every((persona) => persona.description.length > 0));
  } finally {
    db.close();
  }
});

test("the turn's persona: the router's answer, else the Journey's default, else none", async () => {
  const { dbPath, journey } = home();
  const db = openDatabaseReadOnly(dbPath);
  try {
    const chosen = answering({ persona: "writer", outcome: "chosen" });
    const none = answering({ persona: null, outcome: "below_threshold" });
    assert.deepEqual(await routeTurnPersona(db, { prompt: "p", journey, router: chosen }), {
      persona: "writer",
      source: "router",
    });
    assert.deepEqual(await routeTurnPersona(db, { prompt: "p", journey, router: none }), {
      persona: null,
      source: null,
    });
    assert.deepEqual(await routeTurnPersona(db, { prompt: "p", journey }), {
      persona: null,
      source: null,
    });
  } finally {
    db.close();
  }

  setJourneyDefault(dbPath, journey, "coach");
  const withDefault = openDatabaseReadOnly(dbPath);
  try {
    assert.equal(journeyDefaultPersona(withDefault, journey), "coach");
    assert.deepEqual(
      await routeTurnPersona(withDefault, {
        prompt: "p",
        journey,
        router: answering({ persona: "writer", outcome: "chosen" }),
      }),
      { persona: "writer", source: "router" },
      "the router's answer comes before the Journey's default",
    );
    for (const router of [
      answering({ persona: null, outcome: "below_threshold" }),
      { route: async () => Promise.reject(new Error("boom")) },
      answering({ persona: "nobody-here", outcome: "chosen" }),
      undefined,
    ]) {
      assert.deepEqual(await routeTurnPersona(withDefault, { prompt: "p", journey, router }), {
        persona: "coach",
        source: "journey",
      });
    }
    assert.deepEqual(
      await routeTurnPersona(withDefault, {
        prompt: "p",
        journey: null,
        router: answering({ persona: null, outcome: "below_threshold" }),
      }),
      { persona: null, source: null },
      "no Journey, no default",
    );
  } finally {
    withDefault.close();
  }
});

test("a Journey's default counts only when it names a persona that exists", () => {
  const { dbPath, journey } = home();
  for (const named of ["nobody-here", "", 7, null]) {
    setJourneyDefault(dbPath, journey, named);
    const db = openDatabaseReadOnly(dbPath);
    try {
      assert.equal(journeyDefaultPersona(db, journey), null, JSON.stringify(named));
    } finally {
      db.close();
    }
  }
});

test("the ledger: one row per call made, with no prompt and no answer in any mode", () => {
  const { dbPath } = home();
  const previous = process.env.MEMORY_LOG_LLM_CALLS;
  process.env.MEMORY_LOG_LLM_CALLS = "full";
  const db = new DatabaseSync(dbPath);
  try {
    const log = personaRoutingLedger(db, { sessionId: "s-1", now: () => "2026-11-08T00:00:00Z" });
    log({ persona: null, outcome: "no_key" });
    log({
      persona: "writer",
      outcome: "chosen",
      model: "liquid/d1-ultra",
      latencyMs: 560,
      costUsd: 9.2e-5,
    });
    const rows = db
      .prepare(
        "SELECT role, model, prompt, response, latency_ms, cost_usd, session_id FROM llm_calls WHERE role = 'persona_routing'",
      )
      .all();
    assert.deepEqual(
      rows.map((row) => ({ ...row })),
      [
        {
          role: "persona_routing",
          model: "liquid/d1-ultra",
          prompt: "",
          response: "",
          latency_ms: 560,
          cost_usd: 9.2e-5,
          session_id: "s-1",
        },
      ],
    );
  } finally {
    db.close();
    if (previous === undefined) delete process.env.MEMORY_LOG_LLM_CALLS;
    else process.env.MEMORY_LOG_LLM_CALLS = previous;
  }
});

test("a replay answers from recorded bodies, read as the live route's are; anything unmatched is none", async () => {
  const router = new ReplayPersonaRouter({
    kind: "persona_router",
    answers: [
      { contains: "Draft", body: recordedAnswer("writer", 0.9) },
      { contains: "maybe", body: recordedAnswer("coach", 0.3) },
      { contains: "ghost", body: recordedAnswer("doctor", 0.9) },
    ],
  });
  const route = (prompt: string) => router.route({ prompt, journey: null, personas: PERSONAS });
  assert.deepEqual(await route("a draft, please"), {
    persona: "writer",
    outcome: "chosen",
    noul: 0.9,
    costUsd: 9.03e-5,
  });
  assert.equal((await route("maybe the week")).outcome, "below_threshold");
  assert.equal((await route("a ghost")).outcome, "unknown_persona");
  assert.deepEqual(await route("thanks"), { persona: null, outcome: "below_threshold" });
  assert.equal((await route("a draft")).model, undefined, "a replay writes no ledger row");
});

test("the router follows the transport: live asks the route, replay reads its fixture or routes nothing", () => {
  const dir = tempDir("mirror-persona-router-replay-");
  const fixture = join(dir, "router.json");
  writeFileSync(fixture, JSON.stringify({ kind: "persona_router", answers: [] }));
  assert.ok(personaRouterFor("live", {}) instanceof LivePersonaRouter);
  assert.ok(
    personaRouterFor("replay", { MIRROR_TS_PERSONA_ROUTER_REPLAY: fixture }) instanceof
      ReplayPersonaRouter,
  );
  assert.equal(personaRouterFor("replay", {}), undefined, "a replay never reaches the network");
  const wrong = join(dir, "wrong.json");
  writeFileSync(wrong, JSON.stringify({ kind: "llm", responses: {} }));
  assert.throws(() => loadReplayPersonaRouter(wrong), /not a persona_router fixture/);
});
