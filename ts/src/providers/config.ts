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
//
// The extraction pin moved from `google/gemini-2.5-flash-lite` to Claude Haiku 5.5
// on 2026-10-28 (CV9.DS9.US3), on DS9's measurement: the Navigator's own blind
// rankings on his conversations, the suite at reasoning off, and Flash Lite's
// upstream rate limits. A pin change is a migration: the pin, its entry in
// MODEL_DEFAULT_REASONING, and MODEL_PRICES (cost.ts) move in one commit, behind
// a green `eval --all` (the development guide's model upgrade playbook).
export const DEFAULT_EXTRACTION_MODEL = "anthropic/claude-haiku-5.5";
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

/**
 * The reasoning efforts OpenRouter's catalogue lists across its models (checked
 * 2026-10-26, CV9.DS9.TS1). `none` turns reasoning off. Whether a given model
 * honours a given effort is the operator's choice; this list is the vocabulary.
 */
export const REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** What `MEMORY_EXTRACTION_REASONING` says: an effort to send, or a value that is not one. */
export interface ExtractionReasoning {
  /** The effort to send as `reasoning.effort`, or null to send no reasoning field. */
  effort: ReasoningEffort | null;
  /** The value as written when it is not an effort; null otherwise. */
  invalid: string | null;
}

/**
 * Read `MEMORY_EXTRACTION_REASONING` (CV9.DS9.TS1): the reasoning effort every
 * extraction-family call sends. Absent or blank sends nothing, which is the request
 * as it was before the setting existed.
 *
 * Unlike the numeric resolvers below, this never throws. They fail loudly, but they
 * are read inside the session-end hooks, where a throw becomes an extraction attempt
 * and three attempts quarantine a conversation for good (CR178). So a value that is
 * not an effort sends nothing too, and comes back as `invalid` for `runtime status`
 * and `runtime diagnose` to show.
 */
export function readExtractionReasoning(options: ModelPinOptions = {}): ExtractionReasoning {
  const env = options.env ?? process.env;
  const raw = env.MEMORY_EXTRACTION_REASONING ?? "";
  const value = raw.trim().toLowerCase();
  if (value === "") return { effort: null, invalid: null };
  const effort = REASONING_EFFORTS.find((candidate) => candidate === value);
  return effort ? { effort, invalid: null } : { effort: null, invalid: raw.trim() };
}

/**
 * The reasoning effort a model sends when `MEMORY_EXTRACTION_REASONING` is unset
 * (CV9.DS9.US3). A property of the model, because what DS9 measured is: Haiku
 * reasons by default and spent the title call's 40-token budget, so it was
 * measured and chosen at `none`; Flash Lite was measured with no reasoning field,
 * and a model absent from this table gets none, which is the request as it was
 * before the setting existed. So the playbook's rollback, `MEMORY_EXTRACTION_MODEL`
 * set to the old pin, reproduces exactly the request the old pin was measured with,
 * and naming the default pin explicitly sends the same request as leaving it unset.
 */
export const MODEL_DEFAULT_REASONING: Readonly<Record<string, ReasoningEffort>> = {
  "anthropic/claude-haiku-5.5": "none",
};

/** Where the effective effort came from: the setting, the model's default, or nowhere. */
export type ReasoningSource = "setting" | "model_default";

/** The effective pair every extraction-family call sends: the model and its effort. */
export interface EffectiveExtractionReasoning {
  /** The model the call names: `MEMORY_EXTRACTION_MODEL` or the default pin. */
  model: string;
  /** The effort to send as `reasoning.effort`, or null to send no reasoning field. */
  effort: ReasoningEffort | null;
  /** What decided `effort`; null when no field is sent. */
  source: ReasoningSource | null;
  /** `MEMORY_EXTRACTION_REASONING` as written when it is not an effort; null otherwise. */
  invalid: string | null;
}

/**
 * Resolve the model and the reasoning effort an extraction-family call sends
 * (CV9.DS9.US3): the model first, then the effort: the setting when it names an
 * effort, else the model's entry in `MODEL_DEFAULT_REASONING`, else no field. An
 * invalid setting reads as unset, so the default pin still sends its model default;
 * `invalid` carries the value for `runtime status` and `runtime diagnose`. The
 * transport, the eval harness, and `runtime status` all read this one resolver.
 */
export function resolveExtractionReasoning(
  options: ModelPinOptions = {},
): EffectiveExtractionReasoning {
  const model = resolveExtractionModel(options);
  const setting = readExtractionReasoning(options);
  if (setting.effort !== null) {
    return { model, effort: setting.effort, source: "setting", invalid: null };
  }
  const modelDefault = MODEL_DEFAULT_REASONING[model];
  if (modelDefault !== undefined) {
    return { model, effort: modelDefault, source: "model_default", invalid: setting.invalid };
  }
  return { model, effort: null, source: null, invalid: setting.invalid };
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

/**
 * `MIRROR_STALE_ORPHAN_MINUTES` (CV21.DS4.US4): how long an open conversation
 * may sit idle before session maintenance closes it as an orphan. On a runtime
 * whose session outlives the TUI (Codex 0.163.0) this is the close path, so an
 * operator may shorten it; a route sets it to 0 to prove the close now.
 */
export function resolveStaleOrphanMinutes(options: ModelPinOptions = {}): number {
  const env = options.env ?? process.env;
  return parsePythonInt(env.MIRROR_STALE_ORPHAN_MINUTES, 30);
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
