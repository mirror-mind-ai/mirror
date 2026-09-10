/**
 * The live OpenRouter HTTP transport (AI-18, CV22.DS8.US1).
 *
 * Python reaches OpenRouter through the OpenAI SDK and inherits its retry
 * policy; TypeScript ports the POLICY, not the package. Node >= 24 ships a
 * global `fetch`, so the only thing an SDK would add here is a dependency with
 * its own release cadence sitting on the path of every paid call.
 *
 * Every side effect is injectable (`fetch`, `sleep`) so no test in this repo
 * can reach the network by accident. The client itself logs NOTHING:
 * observability belongs to `logLlmCall` (metadata mode) and the front-door
 * log, both of which are already redacted by contract.
 */

import type { ProviderConfig } from "./config.ts";
import { redactString } from "./redaction.ts";

/**
 * The AI-18 failure taxonomy. Closed on purpose: a caller that switches on
 * `kind` must break at compile time when a class is added, rather than
 * silently funnelling a new failure into `provider_error`.
 */
export type LlmTransportErrorKind =
  | "timeout"
  | "auth"
  | "rate_limit"
  | "malformed_output"
  | "provider_error";

/**
 * A provider failure, carrying the classification and NOTHING else.
 *
 * The fields are deliberately minimal. Error objects get serialized whole by
 * loggers, test reporters, and crash handlers, so a `Response`, a body, or a
 * `cause` chain kept "just for debugging" is a leak path for both the API key
 * and the request content (a query, a transcript, an identity document). The
 * message is redacted; the enumerable surface is `kind`, `status`, `retryable`.
 */
export class LlmTransportError extends Error {
  readonly kind: LlmTransportErrorKind;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    kind: LlmTransportErrorKind,
    message: string,
    options: { status?: number | null; retryable?: boolean } = {},
  ) {
    // No `cause`: it would carry the original error's message and, through it,
    // whatever the provider echoed back.
    super(message);
    this.name = "LlmTransportError";
    this.kind = kind;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}

export interface OpenRouterClientOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface PostJsonOptions {
  /** Hard bound for one attempt, from the per-role pins in config.ts. */
  timeoutMs: number;
  /** Additional attempts after the first. Defaults to Python's ceiling of 2. */
  maxRetries?: number;
}

export interface OpenRouterClient {
  postJson(path: string, body: unknown, options: PostJsonOptions): Promise<unknown>;
}

/** Base backoff; doubles per attempt (0.5s, 1s, 2s, ...). */
const BASE_BACKOFF_MS = 500;
/** Ceiling for computed backoff and for an honored `retry-after`. */
const MAX_BACKOFF_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;

/**
 * One attempt's outcome. The retry hint travels HERE rather than on the error,
 * so the error's serialized shape stays minimal and the loop keeps the whole
 * retry decision in one place.
 */
type AttemptOutcome =
  | { ok: true; body: unknown }
  | { ok: false; error: LlmTransportError; retryAfterMs: number | null };

/**
 * Statuses the OpenAI SDK retries, which is what Python's behavior is made of:
 * request timeout, conflict, rate limit, and any server-side failure. Every
 * other 4xx is a deterministic client error -- retrying it spends money to get
 * the same answer.
 */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function classifyStatus(status: number): LlmTransportErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  return "provider_error";
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Honor `retry-after` when the provider states one, capped so a hostile or
 * confused header cannot park a session hook for an hour.
 */
function retryAfterMs(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw.trim());
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds * 1000, MAX_BACKOFF_MS);
}

function backoffMs(attemptIndex: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attemptIndex, MAX_BACKOFF_MS);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

export function createOpenRouterClient(
  config: ProviderConfig,
  options: OpenRouterClientOptions = {},
): OpenRouterClient {
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  // Every message leaving this client passes through here. The key is the only
  // secret the client holds, so it is the only needle redaction needs.
  const redact = (message: string): string => redactString(message, { secrets: [config.apiKey] });

  async function attempt(path: string, body: unknown, timeoutMs: number): Promise<AttemptOutcome> {
    let response: Response;
    try {
      response = await fetchImpl(`${config.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        // The base URL is a module constant; there is no legitimate redirect.
        // Refusing is explicit, rather than trusting the spec to strip the
        // Authorization header on a cross-origin hop (RS005).
        redirect: "error",
      });
    } catch (error) {
      if (isAbortError(error)) {
        return {
          ok: false,
          retryAfterMs: null,
          error: new LlmTransportError("timeout", `provider call timed out after ${timeoutMs}ms`, {
            retryable: true,
          }),
        };
      }
      // Transport-level failure (DNS, TLS, connection reset, refused redirect).
      // The underlying message can echo request details, so it is not carried.
      return {
        ok: false,
        retryAfterMs: null,
        error: new LlmTransportError("provider_error", "provider connection failed", {
          retryable: true,
        }),
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        retryAfterMs: retryAfterMs(response),
        error: new LlmTransportError(
          classifyStatus(response.status),
          redact(`provider returned HTTP ${response.status}`),
          { status: response.status, retryable: isRetryableStatus(response.status) },
        ),
      };
    }

    try {
      return { ok: true, body: await response.json() };
    } catch {
      // A 200 that is not JSON is deterministic -- a gateway page, a truncated
      // body. Retrying pays for the same answer, so it is terminal.
      return {
        ok: false,
        retryAfterMs: null,
        error: new LlmTransportError("malformed_output", "provider returned a non-JSON body", {
          status: response.status,
          retryable: false,
        }),
      };
    }
  }

  return {
    async postJson(path, body, postOptions) {
      const maxRetries = postOptions.maxRetries ?? DEFAULT_MAX_RETRIES;

      for (let index = 0; ; index += 1) {
        const outcome = await attempt(path, body, postOptions.timeoutMs);
        if (outcome.ok) return outcome.body;
        if (!outcome.error.retryable || index === maxRetries) throw outcome.error;
        await sleep(outcome.retryAfterMs ?? backoffMs(index));
      }
    },
  };
}
