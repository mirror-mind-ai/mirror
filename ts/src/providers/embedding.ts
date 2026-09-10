import {
  type ProviderConfig,
  ProviderConfigError,
  resolveEmbeddingModel,
  resolveLlmMaxRetries,
  resolveLlmTimeoutMs,
  resolveProviderConfig,
} from "./config.ts";
import { createOpenRouterClient, LlmTransportError, type OpenRouterClient } from "./openrouter.ts";
import { loadReplayFixture } from "./replay.ts";

/**
 * One embedding call's outcome: the vector, plus what it cost to get it.
 *
 * The usage travels with the vector rather than through a side channel so the
 * ledger row can be priced the way Python prices it (`build_llm_logger` reads
 * `response.usage.prompt_tokens`). `null` means the provider did not report
 * usage -- genuinely unknown, never zero. This mirrors `LlmProvider.complete`,
 * which has always returned tokens alongside content.
 */
export interface EmbeddingResult {
  vector: readonly number[];
  promptTokens: number | null;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<EmbeddingResult>;
}

// Mirrors Python's EMBEDDING_DIMENSIONS / MEMORY_EMBEDDING_ATTEMPTS /
// MEMORY_EMBEDDING_RETRY_BACKOFF exactly (CV9.E2.S1, AI-06 pin family).
export const EMBEDDING_DIMENSIONS = 1536;
export const DEFAULT_EMBEDDING_ATTEMPTS = 3;
export const DEFAULT_EMBEDDING_RETRY_BACKOFF_MS = 500;

export class EmbeddingError extends Error {
  readonly permanent: boolean;
  constructor(message: string, options: { permanent?: boolean } = {}) {
    super(message);
    this.name = "EmbeddingError";
    this.permanent = options.permanent ?? false;
  }
}

export interface EmbeddingAttemptInfo {
  text: string;
  vector: readonly number[] | null;
  latencyMs: number;
  /** Usage for this round-trip, when the provider reported any (CV22.DS8.US1). */
  promptTokens: number | null;
}

export interface GenerateEmbeddingSafelyOptions {
  attempts?: number;
  backoffMs?: number;
  expectedDimensions?: number;
  /** Injectable for fast, deterministic tests -- no real backoff wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Fires once per real API round-trip (not for the empty-input guard,
   * matching Python not logging before any call is attempted). Callers wire
   * this to logLlmCall for ledger observability (AI-09/D-003). */
  onAttempt?: (info: EmbeddingAttemptInfo) => void;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generate an embedding with Python's exact three-way failure taxonomy
 * (`generate_embedding`, CV9.E2.S1):
 *
 * - empty/whitespace input -> permanent `EmbeddingError`, before any provider
 *   call (no doomed spend);
 * - a well-formed call that resolves to an empty vector -> TRANSIENT, retried
 *   up to `attempts` with backoff;
 * - a resolved vector of the wrong length -> PERMANENT, fails immediately
 *   with a `MEMORY_EMBEDDING_MODEL` diagnostic, never retried (a config error
 *   must never be mislabeled "failed after N attempts");
 * - the provider call REJECTS -> TERMINAL, wrapped once, NOT retried at this
 *   layer. The underlying client/SDK is expected to have already retried
 *   transient transport failures itself (AI-01 philosophy); retrying here too
 *   would double the retry budget for exactly the failures already covered.
 *   This is the one branch most likely to be inverted by accident -- it is
 *   deliberately NOT the same as the empty-response transient case above.
 *
 * No fake or zero vector is ever returned: every path yields a validated
 * embedding or throws.
 */
export async function generateEmbeddingSafely(
  provider: EmbeddingProvider,
  text: string,
  options: GenerateEmbeddingSafelyOptions = {},
): Promise<readonly number[]> {
  const attempts = options.attempts ?? DEFAULT_EMBEDDING_ATTEMPTS;
  const backoffMs = options.backoffMs ?? DEFAULT_EMBEDDING_RETRY_BACKOFF_MS;
  const expectedDimensions = options.expectedDimensions ?? EMBEDDING_DIMENSIONS;
  const sleep = options.sleep ?? defaultSleep;

  if (!text?.trim()) {
    throw new EmbeddingError("Cannot embed empty text.", { permanent: true });
  }

  let lastError: EmbeddingError | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const t0 = Date.now();
    let result: EmbeddingResult;
    try {
      result = await provider.embed(text);
    } catch (error) {
      // A missing/invalid key is a CONFIGURATION failure, not a call: Python
      // raises before its attempt loop, so no `llm_calls` row exists for it.
      // Firing onAttempt here would give TS an unpriced row where Python has
      // none -- invisible in every replay test, because replay always has a
      // "key" (CV22.DS8.US1 plan review, engineer).
      if (error instanceof ProviderConfigError) throw error;
      // Provider/transport exception: terminal at this layer, not retried.
      options.onAttempt?.({ text, vector: null, latencyMs: Date.now() - t0, promptTokens: null });
      const detail = error instanceof Error ? error.message : String(error);
      throw new EmbeddingError(`Embedding provider call failed: ${detail}`);
    }
    const { vector, promptTokens } = result;
    if (!vector || vector.length === 0) {
      // Well-formed call, empty payload: transient, retry within budget.
      options.onAttempt?.({ text, vector: null, latencyMs: Date.now() - t0, promptTokens });
      lastError = new EmbeddingError("Empty embedding payload received");
      if (attempt < attempts) await sleep(backoffMs * attempt);
      continue;
    }
    if (vector.length !== expectedDimensions) {
      options.onAttempt?.({ text, vector: null, latencyMs: Date.now() - t0, promptTokens });
      throw new EmbeddingError(
        `Embedding dimension mismatch: expected ${expectedDimensions}, got ${vector.length}. ` +
          "Check MEMORY_EMBEDDING_MODEL -- a model whose vectors are not " +
          `${expectedDimensions}-dim cannot be stored in this corpus.`,
        { permanent: true },
      );
    }
    options.onAttempt?.({ text, vector, latencyMs: Date.now() - t0, promptTokens });
    return vector;
  }
  throw new EmbeddingError(
    `No embedding generated after ${attempts} attempts: ${lastError?.message}`,
  );
}

/** Provenance for a vector produced by the currently configured embedding pin
 * (CV9.E2.S17, AI-07 shape-guard companion). Records the *configured* model,
 * matching Python's own comment: equals the generation model unless the pin
 * is hot-swapped mid-process. */
export function embeddingProvenance(): { embedding_model: string; embedding_dimensions: number } {
  return { embedding_model: resolveEmbeddingModel(), embedding_dimensions: EMBEDDING_DIMENSIONS };
}

/**
 * Merge current embedding provenance into a metadata JSON string. Foreign
 * keys are preserved; provenance keys are authoritative (a re-embed must be
 * able to overwrite a stale model). Never throws on malformed or non-object
 * existing metadata -- falls back to a fresh object, so a bad metadata value
 * can never fail a memory write (mirrors Python's add_embedding_provenance).
 */
export function addEmbeddingProvenance(metadata: string | null | undefined): string {
  let base: Record<string, unknown> = {};
  if (metadata) {
    try {
      const parsed: unknown = JSON.parse(metadata);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>;
      }
    } catch {
      base = {};
    }
  }
  return JSON.stringify({ ...base, ...embeddingProvenance() });
}

export interface ReplayEmbeddingFixture {
  kind: "embedding";
  request?: {
    model?: string;
    input_sha256?: string;
  };
  response: {
    embedding: readonly number[];
    /** Optional; DS5-era fixtures predate usage and stay valid without it. */
    usage?: { prompt_tokens?: number };
  };
}

export class ReplayEmbeddingProvider implements EmbeddingProvider {
  private readonly fixture: ReplayEmbeddingFixture;

  constructor(fixture: ReplayEmbeddingFixture) {
    this.fixture = fixture;
  }

  async embed(_text: string): Promise<EmbeddingResult> {
    // Fixtures may pin usage; most predate it. `null` is the honest answer --
    // a replayed call cost nothing, so pricing it would be a fiction.
    return {
      vector: this.fixture.response.embedding,
      promptTokens: this.fixture.response.usage?.prompt_tokens ?? null,
    };
  }
}

export interface LiveEmbeddingProviderOptions {
  env?: Record<string, string | undefined>;
  /** Injectable for tests; no test in this repo may reach the network. */
  createClient?: (config: ProviderConfig) => OpenRouterClient;
}

/**
 * The live embedding provider (CV22.DS8.US1).
 *
 * Two properties are load-bearing and easy to get backwards:
 *
 * 1. **Config resolves lazily**, on the first `embed()`. Resolving in the
 *    constructor would throw outside `searchMemoriesWithStatus`'s try block,
 *    crashing `memories --search` for an install with no key instead of
 *    degrading to lexical-only the way Python does.
 * 2. **An empty payload returns an EMPTY VECTOR, it does not throw.** Python's
 *    `_extract_embedding` treats "no data"/"empty payload" as transient and
 *    lets `generate_embedding` retry; at the `generateEmbeddingSafely` layer a
 *    thrown error is TERMINAL. Throwing here would silently convert a
 *    retryable emptiness into a hard failure -- the exact taxonomy inversion
 *    the AI-18 contract exists to prevent.
 *
 * Dimension is deliberately NOT checked here: `generateEmbeddingSafely` owns
 * the permanent mismatch diagnostic (AI-07), and duplicating it would give the
 * corpus two places to disagree about what fits in it.
 */
export class LiveEmbeddingProvider implements EmbeddingProvider {
  private readonly env: Record<string, string | undefined>;
  private readonly createClient: (config: ProviderConfig) => OpenRouterClient;
  private client: OpenRouterClient | null = null;

  constructor(options: LiveEmbeddingProviderOptions = {}) {
    this.env = options.env ?? process.env;
    this.createClient = options.createClient ?? ((config) => createOpenRouterClient(config));
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const client = this.resolveClient();
    const body = await client.postJson(
      "/embeddings",
      { input: text, model: resolveEmbeddingModel({ env: this.env }) },
      {
        timeoutMs: resolveLlmTimeoutMs("embedding", { env: this.env }),
        maxRetries: resolveLlmMaxRetries({ env: this.env }),
      },
    );
    return interpretEmbeddingResponse(body);
  }

  private resolveClient(): OpenRouterClient {
    // Throws ProviderConfigError when the key is absent -- inside embed(), so
    // the caller's degraded path can catch it.
    this.client ??= this.createClient(resolveProviderConfig("openrouter", { env: this.env }));
    return this.client;
  }
}

/** Mirrors Python's `_extract_embedding` branch for branch. */
function interpretEmbeddingResponse(body: unknown): EmbeddingResult {
  if (!isRecord(body)) {
    throw new LlmTransportError("malformed_output", "embedding response was not an object");
  }
  const promptTokens = readPromptTokens(body.usage);
  const data = body.data;
  // No `data` at all, or an empty list: transient (Python: "No embedding data
  // received"). Reported as an empty vector so the retry budget applies.
  if (data === undefined || data === null || (Array.isArray(data) && data.length === 0)) {
    return { vector: [], promptTokens };
  }
  if (!Array.isArray(data) || !isRecord(data[0])) {
    throw new LlmTransportError("malformed_output", "embedding response data was not a list");
  }
  const payload = data[0].embedding;
  if (payload === undefined || payload === null || (Array.isArray(payload) && payload.length === 0))
    return { vector: [], promptTokens };
  if (!Array.isArray(payload)) {
    throw new LlmTransportError("malformed_output", "embedding payload was not a list");
  }
  if (!payload.every((value) => typeof value === "number" && Number.isFinite(value))) {
    // A NaN or a string in the vector would be written to the corpus as a BLOB
    // and poison every future cosine against it.
    throw new LlmTransportError("malformed_output", "embedding payload was not finite numbers");
  }
  return { vector: payload as readonly number[], promptTokens };
}

function readPromptTokens(usage: unknown): number | null {
  if (!isRecord(usage)) return null;
  const raw = usage.prompt_tokens;
  return typeof raw === "number" && Number.isInteger(raw) ? raw : null;
}

export async function loadReplayEmbeddingProvider(path: string): Promise<ReplayEmbeddingProvider> {
  const fixture = await loadReplayFixture(path);
  assertReplayEmbeddingFixture(fixture);
  return new ReplayEmbeddingProvider(fixture);
}

export function assertReplayEmbeddingFixture(
  value: unknown,
): asserts value is ReplayEmbeddingFixture {
  if (!isRecord(value) || value.kind !== "embedding") {
    throw new Error("embedding replay fixture must declare kind='embedding'");
  }
  const response = value.response;
  if (!isRecord(response) || !Array.isArray(response.embedding)) {
    throw new Error("embedding replay fixture must include response.embedding[]");
  }
  if (!response.embedding.every((item) => typeof item === "number" && Number.isFinite(item))) {
    throw new Error("embedding replay fixture response.embedding must contain only finite numbers");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
