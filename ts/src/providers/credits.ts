import { type ProviderConfig, resolveLlmTimeoutMs, resolveProviderConfig } from "./config.ts";
import { createOpenRouterClient, LlmTransportError, type OpenRouterClient } from "./openrouter.ts";
import { loadReplayFixture } from "./replay.ts";

export interface CreditInfo {
  totalCredits: number;
  totalUsage: number;
  balance: number;
}

export interface CreditProvider {
  getCredits(): Promise<CreditInfo>;
  fetchGenerationCost(generationId: string): Promise<number | null>;
}

export interface ReplayCreditFixture {
  kind: "credits";
  credits: CreditInfo;
  generationCosts?: Record<string, number | null>;
}

export class ReplayCreditProvider implements CreditProvider {
  private readonly fixture: ReplayCreditFixture;

  constructor(fixture: ReplayCreditFixture) {
    this.fixture = fixture;
  }

  async getCredits(): Promise<CreditInfo> {
    return this.fixture.credits;
  }

  async fetchGenerationCost(generationId: string): Promise<number | null> {
    return this.fixture.generationCosts?.[generationId] ?? null;
  }
}

export async function loadReplayCreditProvider(path: string): Promise<ReplayCreditProvider> {
  const fixture = await loadReplayFixture(path);
  assertReplayCreditFixture(fixture);
  return new ReplayCreditProvider(fixture);
}

export function assertReplayCreditFixture(value: unknown): asserts value is ReplayCreditFixture {
  if (!isRecord(value) || value.kind !== "credits") {
    throw new Error("credits replay fixture must declare kind='credits'");
  }
  if (!isCreditInfo(value.credits)) {
    throw new Error("credits replay fixture must include numeric credits");
  }
  if (value.generationCosts !== undefined && !isRecord(value.generationCosts)) {
    throw new Error("credits replay fixture generationCosts must be an object");
  }
}

function isCreditInfo(value: unknown): value is CreditInfo {
  return (
    isRecord(value) &&
    typeof value.totalCredits === "number" &&
    typeof value.totalUsage === "number" &&
    typeof value.balance === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// --- Live credits and generation cost (CV22.DS8.US3) ------------------------

/** Python's `fetch_generation_cost(retries=4)`: attempts 0..4, five in all. */
const GENERATION_COST_ATTEMPTS = 5;

export interface LiveCreditProviderOptions {
  env?: Record<string, string | undefined>;
  /** Injectable for tests; no test in this repo may reach the network. */
  createClient?: (config: ProviderConfig) => OpenRouterClient;
  /** Injectable for tests so the generation poll does not really sleep. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The live credit provider, mirroring Python's `get_credits` and
 * `fetch_generation_cost`.
 *
 * Both are plain `urlopen` GETs in Python, and both are load-bearing for
 * `consult`: the balance bar after every answer, and the real cost of the call
 * that the ledger prefers over the static estimate.
 *
 * Two properties are worth stating because they are easy to get wrong:
 *
 * 1. **The generation poll is not a transport retry.** OpenRouter exposes
 *    usage a few seconds after the completion, so Python asks up to five
 *    times with 1/2/3/4s between attempts and swallows every error. Each
 *    attempt is therefore sent with `maxRetries: 0` -- letting the transport
 *    retry inside the poll would multiply the two budgets into ~15 requests
 *    for a number that is optional by design.
 * 2. **Failure is `null`, never a throw.** Python returns None and the caller
 *    prints no cost line. A cost lookup must not be able to fail a command
 *    that already succeeded and was already paid for.
 */
export class LiveCreditProvider implements CreditProvider {
  private readonly env: Record<string, string | undefined>;
  private readonly createClient: (config: ProviderConfig) => OpenRouterClient;
  private readonly sleep: (ms: number) => Promise<void>;
  private client: OpenRouterClient | null = null;

  constructor(options: LiveCreditProviderOptions = {}) {
    this.env = options.env ?? process.env;
    this.createClient = options.createClient ?? ((config) => createOpenRouterClient(config));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async getCredits(): Promise<CreditInfo> {
    const body = await this.resolveClient().getJson("/credits", {
      timeoutMs: this.readTimeoutMs(),
      // Python makes exactly one request here and lets the error surface.
      maxRetries: 0,
    });
    const data = isRecord(body) && isRecord(body.data) ? body.data : null;
    if (!data) {
      // Python indexes `["data"]` unguarded: a response without it is a
      // KeyError, not a zero balance. Reporting R$ 0.00 for a malformed
      // response would read as "you are out of credits".
      throw new LlmTransportError("malformed_output", "credits response carried no data object");
    }
    const totalCredits = readAmount(data.total_credits, "total_credits");
    const totalUsage = readAmount(data.total_usage, "total_usage");
    return { totalCredits, totalUsage, balance: totalCredits - totalUsage };
  }

  async fetchGenerationCost(generationId: string): Promise<number | null> {
    // The id comes back from the provider and goes into a URL. Same provider,
    // so the realistic risk is small -- but it is still untrusted input
    // crossing into a request line, and Python would simply have built a
    // broken URL and returned None (CV22.DS8.US3 plan review, security).
    if (!isWellFormedGenerationId(generationId)) return null;
    const path = `/generation?id=${encodeURIComponent(generationId)}`;

    for (let attempt = 0; attempt < GENERATION_COST_ATTEMPTS; attempt += 1) {
      // Python: `if attempt > 0: time.sleep(attempt)` -- 1s, 2s, 3s, 4s.
      if (attempt > 0) await this.sleep(attempt * 1000);
      const cost = await this.readGenerationCost(path);
      if (cost !== null) return cost;
    }
    return null;
  }

  /** One poll attempt. Every failure is swallowed, exactly as Python's is. */
  private async readGenerationCost(path: string): Promise<number | null> {
    try {
      const body = await this.resolveClient().getJson(path, {
        timeoutMs: this.readTimeoutMs(),
        maxRetries: 0,
      });
      const data = isRecord(body) && isRecord(body.data) ? body.data : {};
      const cost = data.total_cost;
      // Python: `if cost is not None: return float(cost)`. A genuine zero is a
      // real answer, so truthiness would turn free calls into "unknown".
      if (cost === null || cost === undefined) return null;
      const parsed = Number(cost);
      // `float(cost)` raises inside Python's try for a non-numeric string, so
      // the loop simply continues.
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private resolveClient(): OpenRouterClient {
    this.client ??= this.createClient(resolveProviderConfig("openrouter", { env: this.env }));
    return this.client;
  }

  /**
   * Python bounds neither GET. TypeScript bounds both at the embedding tier --
   * the tier Python itself uses for its other cheap GET (`/models`) -- so a
   * hung connection cannot park an interactive command. Recorded in
   * `docs/project/decisions.md`.
   */
  private readTimeoutMs(): number {
    return resolveLlmTimeoutMs("embedding", { env: this.env });
  }
}

/**
 * Python's `data.get("total_credits", 0)` followed by a subtraction: an absent
 * field is zero, a present non-numeric field is a TypeError.
 */
function readAmount(value: unknown, field: string): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new LlmTransportError(
      "malformed_output",
      `credits response carried a non-numeric ${field}`,
    );
  }
  return value;
}

/** Non-empty, and nothing that would have to be escaped out of a request line. */
function isWellFormedGenerationId(generationId: string): boolean {
  return generationId.length > 0 && !/\s/.test(generationId);
}
