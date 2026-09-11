import type { WritableDatabase } from "#db/database.ts";
import { logLlmCall } from "#observability/llmCalls.ts";
import type { CreditProvider } from "#providers/credits.ts";
import type { LlmMessage, LlmProvider, LlmRequest } from "#providers/llm.ts";
import { pythonJsonDumps } from "#util/pyGenerators.ts";
import type { ConsultAskCommand, ConsultCreditsCommand, ConsultParseResult } from "./args.ts";
import { renderConsultAsk, renderCredits } from "./render.ts";

export const SYSTEM_PREAMBLE = `You are the user's Mirror, as described in the context below. Answer in first person, as the user.
Respect the vocabulary, tone, and philosophy described in the identity context.

`;

export interface ConsultContextRequest {
  persona: string | null;
  journey: string | null;
  org: boolean;
  query: string | null;
  mirrorHome: string | null;
}

export type ConsultContextLoader = (request: ConsultContextRequest) => Promise<string> | string;

export interface RunConsultOptions {
  llm: LlmProvider;
  credits: CreditProvider;
  loadContext: ConsultContextLoader;
  /** Optional: when provided, `ask` logs to the llm_calls ledger with the
   * real fetched cost (AI-09). Omitted by existing/credits-only callers with
   * no behavior change -- logging is simply skipped. */
  db?: WritableDatabase;
}

export async function runConsult(
  command: ConsultParseResult,
  options: RunConsultOptions,
): Promise<string> {
  if (command.command === "credits") {
    return runConsultCredits(command, options);
  }
  return runConsultAsk(command, options);
}

export async function runConsultCredits(
  _command: ConsultCreditsCommand,
  options: RunConsultOptions,
): Promise<string> {
  return renderCredits(await options.credits.getCredits());
}

export async function runConsultAsk(
  command: ConsultAskCommand,
  options: RunConsultOptions,
): Promise<string> {
  const context = await options.loadContext({
    persona: command.persona,
    journey: command.journey,
    org: command.org,
    query: command.query,
    mirrorHome: command.mirrorHome,
  });
  const request = buildConsultLlmRequest(command.modelId, command.prompt, context);
  const response = await options.llm.complete(request);
  const cost = response.generationId
    ? await options.credits.fetchGenerationCost(response.generationId)
    : null;
  const credits = await options.credits.getCredits();
  if (options.db) {
    // Consult joins the ledger with its real fetched cost (AI-09) -- never the
    // static per-token estimate, which has no entry for consult's models anyway.
    logLlmCall(options.db, {
      role: "consult",
      model: response.model ?? command.modelId,
      prompt: request.prompt,
      response: response.content,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      latencyMs: response.latencyMs,
      costUsd: cost,
    });
  }
  return renderConsultAsk(command.modelId, response, credits, cost);
}

/**
 * Python's `cmd_ask` envelope: a system message carrying the preamble and the
 * Mirror context, then the user's question.
 *
 * `messages` is what leaves for the provider; `prompt` is the same envelope
 * serialized exactly as Python serializes it (`json.dumps(messages,
 * ensure_ascii=False)` inside `send_to_model`), because that string is what
 * the replay transport resolves against and what the ledger's `prompt` column
 * holds under `MEMORY_LOG_LLM_CALLS=full`. `JSON.stringify` was close enough
 * to read but not to compare: it omits the space after `,` and `:` that
 * Python writes, so the two engines recorded different bytes for the same
 * call in a column both of them read (CV22.DS8.US3 plan review,
 * database-architect).
 */
export function buildConsultLlmRequest(
  modelId: string,
  prompt: string,
  context: string,
): LlmRequest {
  const messages: LlmMessage[] = [
    { role: "system", content: SYSTEM_PREAMBLE + context },
    { role: "user", content: prompt },
  ];
  return {
    role: "consult",
    model: modelId,
    messages,
    prompt: pythonJsonDumps(messages),
  };
}
