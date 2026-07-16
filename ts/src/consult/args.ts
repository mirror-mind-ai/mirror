import { isConsultTier, resolveConsultModel } from "./modelCatalog.ts";

export type ConsultParseResult = ConsultCreditsCommand | ConsultAskCommand;

export interface ConsultCreditsCommand {
  command: "credits";
}

export interface ConsultAskCommand {
  command: "ask";
  modelId: string;
  prompt: string;
  persona: string | null;
  journey: string | null;
  org: boolean;
  query: string | null;
  mirrorHome: string | null;
}

export class ConsultArgError extends Error {}

export const CONSULT_USAGE =
  "Usage: consult <family> [tier] [question] [--persona P] [--journey J] [--org]\n" +
  "     consult credits";

export function parseConsultArgs(argv: readonly string[]): ConsultParseResult {
  if (argv.length === 0) {
    throw new ConsultArgError(CONSULT_USAGE);
  }
  if (argv[0] === "credits") {
    return { command: "credits" };
  }

  let persona: string | null = null;
  let journey: string | null = null;
  let org = false;
  let query: string | null = null;
  let mirrorHome: string | null = null;
  const positional: string[] = [];

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--persona" && next !== undefined) {
      persona = next;
      i += 2;
    } else if (arg === "--journey" && next !== undefined) {
      journey = next;
      i += 2;
    } else if (arg === "--query" && next !== undefined) {
      query = next;
      i += 2;
    } else if (arg === "--mirror-home" && next !== undefined) {
      mirrorHome = next;
      i += 2;
    } else if (arg === "--org") {
      org = true;
      i += 1;
    } else {
      positional.push(arg);
      i += 1;
    }
  }

  if (positional.length === 0) {
    throw new ConsultArgError("Error: model family is required.");
  }

  const family = positional[0] ?? "";
  let tier = "lite";
  let prompt: string | null = null;

  if (positional.length === 1) {
    throw new ConsultArgError("Error: question is required.");
  }
  if (positional.length === 2) {
    if (isConsultTier(positional[1] ?? "")) {
      throw new ConsultArgError("Error: question is required.");
    }
    prompt = positional[1] ?? "";
  } else if (isConsultTier(positional[1] ?? "")) {
    tier = positional[1] ?? "lite";
    prompt = positional.slice(2).join(" ");
  } else {
    prompt = positional.slice(1).join(" ");
  }

  return {
    command: "ask",
    modelId: resolveConsultModel(family, tier),
    prompt,
    persona,
    journey,
    org,
    query,
    mirrorHome,
  };
}
