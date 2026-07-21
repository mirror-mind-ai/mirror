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

// EMBEDDING_MODEL has no resolver function: EmbeddingProvider.embed(text) has
// no model parameter to wire this into today (see CR039 plan). Captured as a
// value only -- an unconsumed function would be dead code; a documented
// default is not.

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
