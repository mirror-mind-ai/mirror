import { resolveEmbeddingModel } from "./config.ts";
import { loadReplayFixture } from "./replay.ts";

export interface EmbeddingProvider {
  embed(text: string): Promise<readonly number[]>;
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
    let vector: readonly number[];
    try {
      vector = await provider.embed(text);
    } catch (error) {
      // Provider/transport exception: terminal at this layer, not retried.
      options.onAttempt?.({ text, vector: null, latencyMs: Date.now() - t0 });
      const detail = error instanceof Error ? error.message : String(error);
      throw new EmbeddingError(`Embedding provider call failed: ${detail}`);
    }
    if (!vector || vector.length === 0) {
      // Well-formed call, empty payload: transient, retry within budget.
      options.onAttempt?.({ text, vector: null, latencyMs: Date.now() - t0 });
      lastError = new EmbeddingError("Empty embedding payload received");
      if (attempt < attempts) await sleep(backoffMs * attempt);
      continue;
    }
    if (vector.length !== expectedDimensions) {
      options.onAttempt?.({ text, vector: null, latencyMs: Date.now() - t0 });
      throw new EmbeddingError(
        `Embedding dimension mismatch: expected ${expectedDimensions}, got ${vector.length}. ` +
          "Check MEMORY_EMBEDDING_MODEL -- a model whose vectors are not " +
          `${expectedDimensions}-dim cannot be stored in this corpus.`,
        { permanent: true },
      );
    }
    options.onAttempt?.({ text, vector, latencyMs: Date.now() - t0 });
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
  };
}

export class ReplayEmbeddingProvider implements EmbeddingProvider {
  private readonly fixture: ReplayEmbeddingFixture;

  constructor(fixture: ReplayEmbeddingFixture) {
    this.fixture = fixture;
  }

  async embed(_text: string): Promise<readonly number[]> {
    return this.fixture.response.embedding;
  }
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
