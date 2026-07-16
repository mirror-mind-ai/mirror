import type { CreditProvider } from "../providers/credits.ts";
import type { LlmProvider, LlmRequest } from "../providers/llm.ts";
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
  return renderConsultAsk(command.modelId, response, credits, cost);
}

export function buildConsultLlmRequest(
  modelId: string,
  prompt: string,
  context: string,
): LlmRequest {
  return {
    role: "consult",
    model: modelId,
    prompt: JSON.stringify(
      [
        { role: "system", content: SYSTEM_PREAMBLE + context },
        { role: "user", content: prompt },
      ],
      null,
      0,
    ),
  };
}
