import { parseConsultArgs } from "#consult/args.ts";
import { runConsult } from "#consult/core.ts";
import type { WritableDatabase } from "#db/database.ts";
import { resolveFamilyProviders } from "#providers/familyProviders.ts";
import { CONSULT_ASK_TRANSPORT, CONSULT_CREDITS_TRANSPORT } from "#providers/transport.ts";

/**
 * `db` is optional (AI-09): when provided, `consult ask` logs to the
 * llm_calls ledger with its real fetched cost. `consult credits` never logs
 * (Python doesn't either), so `db` is passed through but unused on that path.
 */
export async function runConsultRoute(
  db: WritableDatabase | null,
  args: readonly string[],
): Promise<string> {
  const command = parseConsultArgs(args);
  // Per leaf, from the same specs `routing.ts` decided with: `credits` needs
  // only a credit provider, `ask` needs a chat provider too (CV22.DS8.US3).
  const spec = command.command === "credits" ? CONSULT_CREDITS_TRANSPORT : CONSULT_ASK_TRANSPORT;
  const family = await resolveFamilyProviders(process.env, spec);
  if (!family?.credits) {
    // `routing.ts` sends a reverted or half-configured family to Python before
    // the route is reached, so this is defense in depth.
    throw new Error("consult requires a credit provider");
  }
  if (command.command === "credits") {
    return `${await runConsult(command, {
      credits: family.credits,
      llm: missingLlm(),
      loadContext: () => "",
      db: db ?? undefined,
    })}\n`;
  }
  if (!family.llm) throw new Error("consult ask requires an LLM provider");
  const context = process.env.MIRROR_TS_CONSULT_CONTEXT ?? "";
  return `${await runConsult(command, {
    credits: family.credits,
    llm: family.llm,
    loadContext: () => context,
    db: db ?? undefined,
  })}\n`;
}

function missingLlm() {
  return {
    async complete(): Promise<never> {
      throw new Error("LLM provider is not available for consult credits");
    },
  };
}
