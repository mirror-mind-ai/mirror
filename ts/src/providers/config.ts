export type ProviderName = "openrouter";

export interface ProviderConfig {
  provider: ProviderName;
  apiKey: string;
  baseUrl: string;
}

export interface ProviderConfigOptions {
  env?: Record<string, string | undefined>;
  argv?: readonly string[];
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const ARG_SECRET_PATTERN =
  /^(?:--)?(?:api[-_]?key|openrouter[-_]?api[-_]?key|token|secret)(?:=|$)/i;

// Model pins (AI-06, CV9.E2.S12): a deprecated pinned model would fail every
// extraction/embedding call, and those paths fail soft -- so the pins must be
// env-overridable to repoint a deployed instance without a release.
export const DEFAULT_EXTRACTION_MODEL = "google/gemini-2.5-flash-lite";
export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";

export interface ModelPinOptions {
  env?: Record<string, string | undefined>;
}

/**
 * Mirrors Python's `EXTRACTION_MODEL = os.getenv("MEMORY_EXTRACTION_MODEL", ...)`.
 * Every extraction-family LLM call (extract, task-extract, curate, summary)
 * uses this single pin -- Python has no per-role model, so TS does not invent one.
 *
 * Uses `??`, not `||`: matches `os.getenv(name, default)` precisely -- only
 * absence triggers the default, an empty-string override is a real value.
 */
export function resolveExtractionModel(options: ModelPinOptions = {}): string {
  const env = options.env ?? process.env;
  return env.MEMORY_EXTRACTION_MODEL ?? DEFAULT_EXTRACTION_MODEL;
}

/**
 * Mirrors Python's `EMBEDDING_MODEL = os.getenv("MEMORY_EMBEDDING_MODEL", ...)`.
 * CR039 deliberately shipped no resolver here -- EmbeddingProvider.embed(text)
 * had no model parameter to wire it into, and an unconsumed function would
 * have been dead code. CR043 gives it a real consumer: embedding provenance
 * (recording which model produced a stored vector) needs the *configured*
 * embedding pin, not the extraction pin -- a different constant entirely.
 */
export function resolveEmbeddingModel(options: ModelPinOptions = {}): string {
  const env = options.env ?? process.env;
  return env.MEMORY_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
}

// Observability (AI-09, CV9.E2.S13): mirrors Python's MEMORY_LOG_LLM_CALLS
// resolution exactly -- off | metadata | full, default metadata (never a
// silent full -- bodies are opt-in only). Legacy "1" maps to "full" for
// back-compat with Python's original boolean-flag meaning.
export type LogLlmCallsMode = "off" | "metadata" | "full";

export function resolveLogLlmCallsMode(options: ModelPinOptions = {}): LogLlmCallsMode {
  const env = options.env ?? process.env;
  const raw = (env.MEMORY_LOG_LLM_CALLS ?? "").trim().toLowerCase();
  if (raw === "" || raw === "metadata") return "metadata";
  if (raw === "1" || raw === "full") return "full";
  return "off";
}

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

export function resolveProviderConfig(
  provider: ProviderName,
  options: ProviderConfigOptions = {},
): ProviderConfig {
  rejectArgvSecrets(options.argv ?? []);
  const env = options.env ?? process.env;
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new ProviderConfigError("OPENROUTER_API_KEY is not configured.");
  }
  return { provider, apiKey, baseUrl: OPENROUTER_BASE_URL };
}

function rejectArgvSecrets(argv: readonly string[]): void {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (ARG_SECRET_PATTERN.test(arg)) {
      throw new ProviderConfigError("API keys must come from env/config, not argv-like inputs.");
    }
    const previous = argv[index - 1] ?? "";
    if (ARG_SECRET_PATTERN.test(previous) && arg.trim().length > 0) {
      throw new ProviderConfigError("API keys must come from env/config, not argv-like inputs.");
    }
  }
}

// Extraction-pipeline switches (CV22.DS7.US10 slice F). Python reads each once
// at import; the front door resolves them per invocation from the same names
// so a session-end under TypeScript makes the same calls Python would.

/** Python `SUMMARIZE_ENABLED = os.getenv("MEMORY_SUMMARIZE", "") == "1"`. */
export function resolveSummarizeEnabled(options: ModelPinOptions = {}): boolean {
  const env = options.env ?? process.env;
  return env.MEMORY_SUMMARIZE === "1";
}

/** Python `TWO_PASS_ENABLED = os.getenv("MEMORY_TWO_PASS", "") == "1"`. */
export function resolveTwoPassEnabled(options: ModelPinOptions = {}): boolean {
  const env = options.env ?? process.env;
  return env.MEMORY_TWO_PASS === "1";
}

/** Python `int(os.getenv("MEMORY_MAINTENANCE_MAX_EXTRACTIONS", "10"))` (AI-05). */
export function resolveMaintenanceMaxExtractions(options: ModelPinOptions = {}): number {
  const env = options.env ?? process.env;
  return parsePythonInt(env.MEMORY_MAINTENANCE_MAX_EXTRACTIONS, 10);
}

/** Python `int(os.getenv("MEMORY_EXTRACTION_MAX_ATTEMPTS", "3"))` (CV9.E2.S7). */
export function resolveExtractionMaxAttempts(options: ModelPinOptions = {}): number {
  const env = options.env ?? process.env;
  return parsePythonInt(env.MEMORY_EXTRACTION_MAX_ATTEMPTS, 3);
}

/**
 * Python `int(os.getenv(name, default))`: absence yields the default; a
 * present value that is not an integer makes Python's import fail, so the
 * front door fails the same way rather than silently substituting.
 */
function parsePythonInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  if (!/^\s*[+-]?\d+\s*$/.test(raw)) {
    throw new Error(`invalid literal for int() with base 10: '${raw}'`);
  }
  return Number.parseInt(raw, 10);
}

/**
 * Python `float(os.getenv(name, default))`. Same contract as `parsePythonInt`:
 * only absence takes the default, and a present non-numeric value fails loudly
 * instead of silently reverting to a value the operator did not ask for.
 */
function parsePythonFloat(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (raw.trim() === "" || Number.isNaN(parsed)) {
    throw new Error(`could not convert string to float: '${raw}'`);
  }
  return parsed;
}

// Per-role call bounds (AI-18, CV22.DS8.US1). Python bounds every model call at
// client construction (`config.py` LLM_TIMEOUT_*, LLM_MAX_RETRIES) so a hung
// provider connection cannot stall a session hook or the interactive path --
// the OpenAI SDK default is 600s. The TS live transport carries the same bounds
// under the same env names; only the unit changes (Python seconds -> ms for
// AbortSignal.timeout).

/** The three call classes Python bounds separately. */
export type LlmTimeoutRole = "extraction" | "reception" | "embedding";

const LLM_TIMEOUT_ENV: Readonly<Record<LlmTimeoutRole, { name: string; defaultSeconds: number }>> =
  {
    extraction: { name: "MEMORY_LLM_TIMEOUT_EXTRACTION", defaultSeconds: 60 },
    reception: { name: "MEMORY_LLM_TIMEOUT_RECEPTION", defaultSeconds: 10 },
    embedding: { name: "MEMORY_LLM_TIMEOUT_EMBEDDING", defaultSeconds: 15 },
  };

/**
 * Milliseconds to bound one provider call of `role`, from Python's per-role
 * second-valued pins. All three ship together even though CV22.DS8.US1 only
 * uses `embedding`: the config surface is the same shape for US2/US3, and a
 * half-ported timeout table is how per-role bounds quietly become one bound.
 */
export function resolveLlmTimeoutMs(role: LlmTimeoutRole, options: ModelPinOptions = {}): number {
  const env = options.env ?? process.env;
  const { name, defaultSeconds } = LLM_TIMEOUT_ENV[role];
  return parsePythonFloat(env[name], defaultSeconds) * 1000;
}

/** Python `LLM_MAX_RETRIES = int(os.getenv("MEMORY_LLM_MAX_RETRIES", "2"))`. */
export function resolveLlmMaxRetries(options: ModelPinOptions = {}): number {
  const env = options.env ?? process.env;
  return parsePythonInt(env.MEMORY_LLM_MAX_RETRIES, 2);
}
