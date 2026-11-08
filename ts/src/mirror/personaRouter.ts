// CR203: a turn's persona, by its subject, or none.
//
// Until CR203 a turn always had a persona: a keyword count chose one, and when
// nothing scored the session's kept answering. Measured on production data, a
// third of consecutive turns switched persona and specialists from unrelated
// domains answered. The Navigator's criterion: a wrong persona is worse than
// none, because it puts a false specialist into the answer, while no persona
// only loses one domain's lens.
//
// So a turn's persona is, in order:
//
//   1. the router's answer: a Decisions model through OpenRouter's Decisions
//      API, asked one Choice (which persona) and one Noul (does the subject
//      belong to any of them) in one request; the Choice is taken only when
//      the Noul is at or above the threshold and it names a known persona;
//   2. else the persona the turn's Journey names as its own default
//      (`default_persona` in the Journey's metadata): the Journey's word, not
//      an inference;
//   3. else none.
//
// Every failure lands on none: no key, a timeout, a refusal, a malformed
// answer, an unknown persona. The router never throws into a turn. Both the
// doorman's delta and the full load call `routeTurnPersona`, so the two paths
// cannot disagree.
//
// The route is `alpha`. Its request and answer shapes live here and nowhere
// else, pinned by a contract test, so a change in the shape fails a test, not
// a turn.

import { readFileSync } from "node:fs";
import type { Database, StatementRunner } from "#db/database.ts";
import { descriptorsByLayer } from "#descriptor/descriptorRead.ts";
import { logLlmCall } from "#observability/llmCalls.ts";
import {
  DEFAULT_PERSONA_ROUTER_THRESHOLD,
  hasOpenRouterKey,
  type ProviderConfig,
  resolveLlmTimeoutMs,
  resolvePersonaRouterModel,
  resolvePersonaRouterThreshold,
  resolveProviderConfig,
} from "#providers/config.ts";
import { createOpenRouterClient, type OpenRouterClient } from "#providers/openrouter.ts";
import { sliceCodePoints } from "./reception.ts";

/** A persona as the router offers it: its key and what it is for. */
export interface RoutablePersona {
  readonly key: string;
  readonly description: string;
}

export interface PersonaRouteInput {
  readonly prompt: string;
  readonly journey: string | null;
  readonly personas: readonly RoutablePersona[];
}

/** Why the router answered what it did; content-free. */
export type PersonaRoutingOutcome =
  | "chosen"
  | "below_threshold"
  | "unknown_persona"
  | "malformed"
  | "failed"
  | "no_key"
  | "no_personas";

export interface PersonaRouting {
  readonly persona: string | null;
  readonly outcome: PersonaRoutingOutcome;
  /** The model asked; absent when no call was made. */
  readonly model?: string;
  readonly noul?: number;
  readonly latencyMs?: number;
  readonly costUsd?: number | null;
}

export interface PersonaRouter {
  route(input: PersonaRouteInput): Promise<PersonaRouting>;
}

/** The Decisions route, under `/api`, not the chat client's `/api/v1`. */
export const DECISIONS_BASE_URL = "https://openrouter.ai/api";
export const DECISIONS_PATH = "/alpha/decisions";

/** The bounds the eval measured with: what the model reads of each part. */
const REQUEST_CHARS = 2000;
const DESCRIPTION_CHARS = 280;
const NOUL_DESCRIPTION_CHARS = 90;

/** The request body, as the eval of 2026-11-07 sent it. Pure. */
export function decisionsRequest(model: string, input: PersonaRouteInput): unknown {
  const criteria = Object.fromEntries(
    input.personas.map((persona) => [
      persona.key,
      sliceCodePoints(persona.description, DESCRIPTION_CHARS),
    ]),
  );
  const listed = input.personas
    .map(
      (persona) =>
        `${persona.key}: ${sliceCodePoints(persona.description, NOUL_DESCRIPTION_CHARS)}`,
    )
    .join("; ");
  return {
    model,
    state: { journey: input.journey, request: sliceCodePoints(input.prompt, REQUEST_CHARS) },
    questions: {
      persona: {
        type: "choice",
        instructions:
          "Which specialist should answer this request, judging only by the subject of `request`?",
        criteria,
      },
      fits: {
        type: "noul",
        instructions: `Does the subject of \`request\` clearly belong to the domain of one specific specialist from this list: ${listed}?`,
        criteria: {
          true: "The request asks for expertise that one listed specialist clearly owns.",
          false:
            "The request is a plain instruction, a confirmation, a general question, or its subject belongs to no listed specialist.",
        },
      },
    },
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The answer read against the personas offered and the threshold. Pure. */
export function readDecisionsAnswer(
  body: unknown,
  personas: readonly RoutablePersona[],
  threshold: number,
): PersonaRouting {
  const answers = record(record(body)?.answers);
  const choice = record(answers?.persona)?.choice;
  const noul = record(answers?.fits)?.noul;
  const cost = record(record(body)?.usage)?.cost;
  const costUsd = typeof cost === "number" && Number.isFinite(cost) ? cost : null;
  if (typeof choice !== "string" || typeof noul !== "number" || !(noul >= 0 && noul <= 1)) {
    return { persona: null, outcome: "malformed", costUsd };
  }
  if (noul < threshold) return { persona: null, outcome: "below_threshold", noul, costUsd };
  if (!personas.some((persona) => persona.key === choice)) {
    return { persona: null, outcome: "unknown_persona", noul, costUsd };
  }
  return { persona: choice, outcome: "chosen", noul, costUsd };
}

export interface LivePersonaRouterOptions {
  /** Where the key and the settings are read; a host passes its own. */
  env?: Record<string, string | undefined>;
  /** Tests only: a client in place of the live one. */
  createClient?: (config: ProviderConfig) => OpenRouterClient;
  /** Tests only: the clock latency is measured with. */
  clock?: () => number;
}

/**
 * The router over OpenRouter's Decisions API: one attempt, bounded like
 * reception (10 s), since a person's turn waits on it. The eval's p95 was 1.1 s.
 */
export class LivePersonaRouter implements PersonaRouter {
  readonly #env: Record<string, string | undefined>;
  readonly #createClient: (config: ProviderConfig) => OpenRouterClient;
  readonly #clock: () => number;

  constructor(options: LivePersonaRouterOptions = {}) {
    this.#env = options.env ?? process.env;
    this.#createClient = options.createClient ?? ((config) => createOpenRouterClient(config));
    this.#clock = options.clock ?? (() => performance.now());
  }

  async route(input: PersonaRouteInput): Promise<PersonaRouting> {
    if (input.personas.length === 0) return { persona: null, outcome: "no_personas" };
    if (!hasOpenRouterKey(this.#env)) return { persona: null, outcome: "no_key" };
    const env = this.#env;
    const model = resolvePersonaRouterModel({ env });
    const started = this.#clock();
    try {
      const client = this.#createClient({
        ...resolveProviderConfig("openrouter", { env }),
        baseUrl: DECISIONS_BASE_URL,
      });
      const body = await client.postJson(DECISIONS_PATH, decisionsRequest(model, input), {
        timeoutMs: resolveLlmTimeoutMs("reception", { env }),
        maxRetries: 0,
      });
      const latencyMs = Math.round(this.#clock() - started);
      return {
        ...readDecisionsAnswer(body, input.personas, resolvePersonaRouterThreshold({ env })),
        model,
        latencyMs,
      };
    } catch {
      return {
        persona: null,
        outcome: "failed",
        model,
        latencyMs: Math.round(this.#clock() - started),
      };
    }
  }
}

/**
 * Where a replay run finds its router's recorded answers. A family's replay
 * reaches no network, and without this its turns could only ever have none:
 * the route from the command to the session row would go untested.
 */
export const PERSONA_ROUTER_REPLAY_ENV = "MIRROR_TS_PERSONA_ROUTER_REPLAY";

export interface PersonaRouterReplayFixture {
  readonly kind: "persona_router";
  /** The first answer whose `contains` is in the prompt, case aside, is the route's body. */
  readonly answers: readonly { readonly contains: string; readonly body: unknown }[];
}

/**
 * Recorded Decisions bodies, read through the same `readDecisionsAnswer` the
 * live route's are. A prompt no answer matches is below the threshold. No
 * model is named, so a replay writes no ledger row.
 */
export class ReplayPersonaRouter implements PersonaRouter {
  readonly #fixture: PersonaRouterReplayFixture;
  readonly #threshold: number;

  constructor(fixture: PersonaRouterReplayFixture, threshold = DEFAULT_PERSONA_ROUTER_THRESHOLD) {
    this.#fixture = fixture;
    this.#threshold = threshold;
  }

  async route(input: PersonaRouteInput): Promise<PersonaRouting> {
    const prompt = input.prompt.toLowerCase();
    const answer = this.#fixture.answers.find((candidate) =>
      prompt.includes(candidate.contains.toLowerCase()),
    );
    if (!answer) return { persona: null, outcome: "below_threshold" };
    const {
      model: _model,
      latencyMs: _latency,
      ...read
    } = readDecisionsAnswer(answer.body, input.personas, this.#threshold);
    return read;
  }
}

export function loadReplayPersonaRouter(path: string): ReplayPersonaRouter {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const fixture = record(parsed);
  if (fixture?.kind !== "persona_router" || !Array.isArray(fixture.answers)) {
    throw new Error(`${PERSONA_ROUTER_REPLAY_ENV} is not a persona_router fixture: ${path}`);
  }
  return new ReplayPersonaRouter(fixture as unknown as PersonaRouterReplayFixture);
}

/**
 * Every persona with what it is for: its own `description` (seeded from its
 * YAML), else its generated descriptor, else the start of its content. The
 * description comes first because it is the persona's declared purpose and
 * what the eval measured with; the rerun on the Core's code with descriptors
 * first doubled the wrong picks, since 11 of 28 production personas had none
 * and fell back to a heading.
 */
export function routablePersonas(db: Database): RoutablePersona[] {
  const descriptors = new Map(
    descriptorsByLayer(db, "persona").map((row) => [row.key, row.descriptor]),
  );
  return db
    .prepare("SELECT key, content, metadata FROM identity WHERE layer = 'persona' ORDER BY key")
    .all()
    .map((row) => {
      const key = String(row.key);
      return {
        key,
        description:
          declaredDescription(row.metadata) ||
          descriptors.get(key)?.trim() ||
          sliceCodePoints(String(row.content), 200),
      };
    });
}

function declaredDescription(metadata: unknown): string {
  if (typeof metadata !== "string") return "";
  try {
    const description = record(JSON.parse(metadata))?.description;
    return typeof description === "string" ? description.trim() : "";
  } catch {
    return "";
  }
}

/**
 * The persona a Journey names as its own default, when it names one that
 * exists. Read from the Journey's metadata (`default_persona`).
 */
export function journeyDefaultPersona(db: Database, journey: string | null): string | null {
  if (!journey) return null;
  const row = db
    .prepare("SELECT metadata FROM identity WHERE layer = 'journey' AND key = ?")
    .get(journey);
  if (typeof row?.metadata !== "string") return null;
  let named: unknown;
  try {
    named = record(JSON.parse(row.metadata))?.default_persona;
  } catch {
    return null;
  }
  if (typeof named !== "string" || !named.trim()) return null;
  const exists = db
    .prepare("SELECT 1 AS found FROM identity WHERE layer = 'persona' AND key = ?")
    .get(named.trim());
  return exists ? named.trim() : null;
}

export interface TurnPersona {
  readonly persona: string | null;
  /** Where the persona came from; null when the turn has none. */
  readonly source: "router" | "journey" | null;
}

export interface RouteTurnPersonaInput {
  readonly prompt: string;
  readonly journey: string | null;
  /** Absent: no call is made, and the turn falls to the Journey's default or none. */
  readonly router?: PersonaRouter;
  /** Where the call's ledger row goes; content-free. */
  readonly onRouting?: (routing: PersonaRouting) => void;
}

/** The turn's persona: the router's answer, else the Journey's default, else none. */
export async function routeTurnPersona(
  db: Database,
  input: RouteTurnPersonaInput,
): Promise<TurnPersona> {
  if (input.router) {
    const personas = routablePersonas(db);
    let routing: PersonaRouting;
    try {
      routing = await input.router.route({
        prompt: input.prompt,
        journey: input.journey,
        personas,
      });
    } catch {
      routing = { persona: null, outcome: "failed" };
    }
    input.onRouting?.(routing);
    const chosen = routing.persona;
    if (chosen !== null && personas.some((persona) => persona.key === chosen)) {
      return { persona: chosen, source: "router" };
    }
  }
  const fallback = journeyDefaultPersona(db, input.journey);
  return fallback ? { persona: fallback, source: "journey" } : { persona: null, source: null };
}

/**
 * One `llm_calls` row for a call that was made, without the prompt or the
 * answer in any logging mode: the subject of a person's turn is not the
 * ledger's to keep.
 */
export function personaRoutingLedger(
  db: StatementRunner,
  context: { sessionId?: string | null; now?: () => string } = {},
): (routing: PersonaRouting) => void {
  return (routing) => {
    if (!routing.model) return;
    logLlmCall(
      db,
      {
        role: "persona_routing",
        model: routing.model,
        prompt: "",
        response: "",
        latencyMs: routing.latencyMs ?? null,
        costUsd: routing.costUsd ?? null,
        sessionId: context.sessionId ?? null,
      },
      context.now ? { now: context.now } : {},
    );
  };
}
