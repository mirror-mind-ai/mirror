import { createHash } from "node:crypto";

import {
  type LlmTimeoutRole,
  type ProviderConfig,
  resolveExtractionModel,
  resolveLlmMaxRetries,
  resolveLlmTimeoutMs,
  resolveProviderConfig,
} from "./config.ts";
import { createOpenRouterClient, LlmTransportError, type OpenRouterClient } from "./openrouter.ts";
import { loadReplayFixture } from "./replay.ts";

/**
 * Every role the replay transport understands.
 *
 * The type AND the runtime guard are derived from this one array. They used to
 * be written twice -- a union type plus a hand-maintained `isLlmRole` chain --
 * and CV22.DS7.US11 added three roles to the type while the guard silently
 * kept rejecting them. The unit tests passed; the first end-to-end run through
 * the front door failed with "unsupported role 'journal_classification'".
 * One list, no drift.
 */
export const LLM_ROLES = [
  "extraction",
  "task_extraction",
  "summary",
  "curation",
  "consult",
  "reception",
  "consolidation",
  "shadow_scan",
  // CV22.DS7.US10 slice C' -- the close-time metadata surfaces. Role names
  // match Python's `build_llm_logger` roles so the llm_calls ledger agrees.
  "conversation_title",
  "conversation_tags",
  "conversation_summary",
  // CV22.DS7.US11 -- the content & planning tail. Same naming rule, with one
  // deliberate exception: Python's `generate_descriptor` passes no
  // `on_llm_call`, so the `descriptor` role writes NO ledger row on either
  // engine. Parity preserves the gap; closing it is a DS8 plan input.
  "journal_classification",
  "week_plan",
  "descriptor",
] as const;

export type LlmRole = (typeof LLM_ROLES)[number];

/**
 * Which timeout tier each role's call is bounded by (CV22.DS8.US3).
 *
 * Python's `send_to_model` defaults to `LLM_TIMEOUT_EXTRACTION` and only
 * `reception` passes anything else (`LLM_TIMEOUT_RECEPTION`, 10s) -- it runs
 * in front of a waiting human on every Mirror Mode activation, so it must give
 * up six times sooner than a background extraction.
 *
 * A full `Record<LlmRole, ...>` rather than a default plus an exception list:
 * the compiler then forces every role added to `LLM_ROLES` to declare its
 * tier, instead of silently inheriting one. That is the US11 lesson -- a type
 * and a hand-maintained companion that drifted apart.
 */
const LLM_TIMEOUT_TIER: Readonly<Record<LlmRole, LlmTimeoutRole>> = {
  extraction: "extraction",
  task_extraction: "extraction",
  summary: "extraction",
  curation: "extraction",
  consult: "extraction",
  reception: "reception",
  consolidation: "extraction",
  shadow_scan: "extraction",
  conversation_title: "extraction",
  conversation_tags: "extraction",
  conversation_summary: "extraction",
  journal_classification: "extraction",
  week_plan: "extraction",
  descriptor: "extraction",
};

/**
 * The roles a message in Python's envelope can carry.
 *
 * Closed to `system` and `user` on purpose: those are the only two Python ever
 * sends. An assistant prefill or a second turn would satisfy every prompt
 * digest -- digests pin CONTENT, not STRUCTURE -- while changing what the
 * model hears, so widening this union has to be a deliberate, reviewed edit.
 */
export type LlmMessageRole = "system" | "user";

export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
}

export interface LlmRequest {
  role: LlmRole;
  /**
   * The assembled prompt: what prompt digests pin and what the `llm_calls`
   * ledger records. For a single-message call it is also what is sent.
   */
  prompt: string;
  /**
   * Python's exact message array, for the calls that send more than one
   * message (`consult` sends `system` + `user`).
   *
   * Two fields rather than one because they answer different questions.
   * `prompt` is the AUDIT record -- Python logs `json.dumps(messages)` in the
   * ledger's `prompt` column, and the replay transport resolves and digests
   * against it. `messages` is the WIRE format. Collapsing them is precisely
   * the defect this story found: consult's JSON-encoded envelope would have
   * been sent as the text of one user message, passing every digest while the
   * model read a different conversation.
   */
  messages?: readonly LlmMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmResponse {
  content: string;
  model?: string;
  generationId?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
}

export interface LlmProvider {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export interface ReplayLlmFixture {
  kind: "llm";
  responses: Partial<Record<LlmRole, LlmResponse | string>>;
  /**
   * Optional per-role SHA-256 of the fully assembled prompt (CV22.DS7.US10
   * slice C′, ai-engineer plan review — blocking).
   *
   * Replay resolves by `role` alone, so a TS prompt that drifted from the
   * Python oracle would replay happily and the divergence would only surface
   * at the DS8 live cutover, against real users. When a fixture pins a digest,
   * a mismatch is a hard, deterministic failure instead.
   *
   * Optional by design: DS5-era fixtures predate prompt assembly and stay
   * valid, while every fixture that pins a digest is strictly enforced.
   */
  promptDigests?: Partial<Record<LlmRole, string>>;
}

/** SHA-256 of an assembled prompt, as pinned in replay fixtures. */
export function promptDigest(prompt: string): string {
  return createHash("sha256").update(prompt, "utf8").digest("hex");
}

export class ReplayLlmProvider implements LlmProvider {
  private readonly fixture: ReplayLlmFixture;
  readonly calls: LlmRequest[] = [];

  constructor(fixture: ReplayLlmFixture) {
    this.fixture = fixture;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push(request);
    const expectedDigest = this.fixture.promptDigests?.[request.role];
    if (expectedDigest !== undefined) {
      const actualDigest = promptDigest(request.prompt);
      if (actualDigest !== expectedDigest) {
        throw new Error(
          `replay prompt digest mismatch for role '${request.role}': ` +
            `fixture pins ${expectedDigest}, assembled prompt is ${actualDigest}. ` +
            "The TypeScript prompt drifted from the Python oracle; regrade the " +
            "assembled-prompt golden before changing the fixture.",
        );
      }
    }
    const response = this.fixture.responses[request.role];
    if (response === undefined) {
      throw new Error(`missing replay LLM response for role '${request.role}'`);
    }
    return typeof response === "string" ? { content: response } : response;
  }
}

export async function loadReplayLlmProvider(path: string): Promise<ReplayLlmProvider> {
  const fixture = await loadReplayFixture(path);
  assertReplayLlmFixture(fixture);
  return new ReplayLlmProvider(fixture);
}

export function assertReplayLlmFixture(value: unknown): asserts value is ReplayLlmFixture {
  if (!isRecord(value) || value.kind !== "llm") {
    throw new Error("LLM replay fixture must declare kind='llm'");
  }
  if (!isRecord(value.responses)) {
    throw new Error("LLM replay fixture must include responses object");
  }
  if (value.promptDigests !== undefined) {
    if (!isRecord(value.promptDigests)) {
      throw new Error("LLM replay fixture promptDigests must be an object");
    }
    for (const [role, digest] of Object.entries(value.promptDigests)) {
      if (!isLlmRole(role)) {
        throw new Error(`LLM replay fixture pins a digest for unsupported role '${role}'`);
      }
      if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) {
        throw new Error(`LLM replay fixture digest for '${role}' must be a sha256 hex string`);
      }
    }
  }
  for (const [role, response] of Object.entries(value.responses)) {
    if (!isLlmRole(role)) {
      throw new Error(`LLM replay fixture includes unsupported role '${role}'`);
    }
    if (typeof response === "string") continue;
    if (!isRecord(response) || typeof response.content !== "string") {
      throw new Error(`LLM replay fixture response '${role}' must be a string or { content }`);
    }
  }
}

function isLlmRole(value: string): value is LlmRole {
  return (LLM_ROLES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// --- Live chat completions (CV22.DS8.US2) ----------------------------------

/** Python's `send_to_model` defaults, which every un-overridden call inherits. */
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 4096;

export interface LiveLlmProviderOptions {
  env?: Record<string, string | undefined>;
  /** Injectable for tests; no test in this repo may reach the network. */
  createClient?: (config: ProviderConfig) => OpenRouterClient;
}

/**
 * The live chat provider (CV22.DS8.US2), mirroring Python's `send_to_model`.
 *
 * Three properties carry the weight:
 *
 * 1. **The envelope is Python's.** Exactly one message, role `user`, content
 *    byte-identical to the assembled prompt. US10 pinned SHA-256 digests of
 *    every close-tail prompt so a drift fails under replay -- but those
 *    digests pin CONTENT, not STRUCTURE. A system message, an assistant
 *    prefill, or a second turn would satisfy every digest and still change
 *    what the model hears. The envelope is asserted by test for that reason.
 * 2. **Config resolves lazily**, on the first call. A missing key must surface
 *    inside the close tail -- where the extraction driver records a failed
 *    attempt -- not at construction, where it would crash the session-end hook
 *    before any accounting happened.
 * 3. **Model output is not transport output.** An empty or non-JSON completion
 *    is a legitimate model outcome that the parser upstream reports as
 *    `no_signal`/`parse_failed`. Only a broken HTTP-level SHAPE (no usable
 *    `choices[0]`, Python's `IndexError`) is `malformed_output`. Conflating
 *    them would retry a deterministic model answer and pay for it each time.
 */
export class LiveLlmProvider implements LlmProvider {
  private readonly env: Record<string, string | undefined>;
  private readonly createClient: (config: ProviderConfig) => OpenRouterClient;
  private client: OpenRouterClient | null = null;

  constructor(options: LiveLlmProviderOptions = {}) {
    this.env = options.env ?? process.env;
    this.createClient = options.createClient ?? ((config) => createOpenRouterClient(config));
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const client = this.resolveClient();
    const model = request.model ?? resolveExtractionModel({ env: this.env });
    const startedAt = Date.now();
    const body = await client.postJson(
      "/chat/completions",
      {
        model,
        // Python sends `[{"role": "user", "content": prompt}]` for every caller
        // that assembles one prompt, and its own array for the callers that do
        // not (`consult`). Nothing else, ever.
        messages: request.messages
          ? request.messages.map((message) => ({ role: message.role, content: message.content }))
          : [{ role: "user", content: request.prompt }],
        temperature: request.temperature ?? DEFAULT_TEMPERATURE,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      },
      {
        timeoutMs: resolveLlmTimeoutMs(LLM_TIMEOUT_TIER[request.role], { env: this.env }),
        maxRetries: resolveLlmMaxRetries({ env: this.env }),
      },
    );
    return interpretChatResponse(body, model, Date.now() - startedAt);
  }

  private resolveClient(): OpenRouterClient {
    this.client ??= this.createClient(resolveProviderConfig("openrouter", { env: this.env }));
    return this.client;
  }
}

/** Mirrors `send_to_model`'s response handling branch for branch. */
function interpretChatResponse(body: unknown, model: string, latencyMs: number): LlmResponse {
  if (!isRecord(body)) {
    throw new LlmTransportError("malformed_output", "chat response was not an object");
  }
  const choices = body.choices;
  if (!Array.isArray(choices) || choices.length === 0 || !isRecord(choices[0])) {
    // Python indexes `response.choices[0]` unguarded, so this is its
    // IndexError: the response has no usable shape at all.
    throw new LlmTransportError("malformed_output", "chat response carried no usable choice");
  }
  const message = choices[0].message;
  const rawContent = isRecord(message) ? message.content : null;
  // Python: `(response.choices[0].message.content or "").strip()`. An empty or
  // absent completion is data, not a failure.
  const content = typeof rawContent === "string" ? rawContent.trim() : "";
  const usage = isRecord(body.usage) ? body.usage : null;
  return {
    content,
    model,
    generationId: typeof body.id === "string" ? body.id : null,
    promptTokens: readTokenCount(usage?.prompt_tokens),
    completionTokens: readTokenCount(usage?.completion_tokens),
    latencyMs,
  };
}

/** Usage is reported only when the provider gives a real integer; never 0 by default. */
function readTokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}
