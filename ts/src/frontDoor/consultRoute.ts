import { parseConsultArgs } from "../consult/args.ts";
import { runConsult } from "../consult/core.ts";
import { loadReplayCreditProvider } from "../providers/credits.ts";
import { loadReplayLlmProvider } from "../providers/llm.ts";

export async function runConsultRoute(args: readonly string[]): Promise<string> {
  const creditsPath = process.env.MIRROR_TS_CREDITS_REPLAY;
  if (!creditsPath) throw new Error("MIRROR_TS_CREDITS_REPLAY is required for TS consult route");
  const command = parseConsultArgs(args);
  const credits = await loadReplayCreditProvider(creditsPath);
  if (command.command === "credits") {
    return `${await runConsult(command, { credits, llm: missingLlm(), loadContext: () => "" })}\n`;
  }
  const llmPath = process.env.MIRROR_TS_CONSULT_LLM_REPLAY;
  if (!llmPath) throw new Error("MIRROR_TS_CONSULT_LLM_REPLAY is required for TS consult route");
  const llm = await loadReplayLlmProvider(llmPath);
  const context = process.env.MIRROR_TS_CONSULT_CONTEXT ?? "";
  return `${await runConsult(command, { credits, llm, loadContext: () => context })}\n`;
}

function missingLlm() {
  return {
    async complete(): Promise<never> {
      throw new Error("LLM provider is not available for consult credits");
    },
  };
}
