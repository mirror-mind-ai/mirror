export type ConsultTier = "lite" | "mid" | "flagship";

export const CONSULT_TIERS = ["lite", "mid", "flagship"] as const;

export const LLM_FAMILIES: Record<string, Record<ConsultTier, string>> = {
  claude: {
    lite: "anthropic/claude-haiku-4.5",
    mid: "anthropic/claude-sonnet-4.6",
    flagship: "anthropic/claude-opus-4.6",
  },
  deepseek: {
    lite: "deepseek/deepseek-chat",
    mid: "deepseek/deepseek-v3.2",
    flagship: "deepseek/deepseek-r1",
  },
  gemini: {
    lite: "google/gemini-2.5-flash-lite",
    mid: "google/gemini-2.5-flash",
    flagship: "google/gemini-2.5-pro",
  },
  grok: {
    lite: "x-ai/grok-3-mini",
    mid: "x-ai/grok-3",
    flagship: "x-ai/grok-4.1-fast",
  },
  llama: {
    lite: "meta-llama/llama-3.3-70b-instruct",
    mid: "meta-llama/llama-4-scout",
    flagship: "meta-llama/llama-4-maverick",
  },
  openai: {
    lite: "openai/gpt-5.4-nano",
    mid: "openai/gpt-5.4-mini",
    flagship: "openai/gpt-5.4",
  },
};

export function isConsultTier(value: string): value is ConsultTier {
  return value === "lite" || value === "mid" || value === "flagship";
}

export function resolveConsultModel(family: string, tier = "mid"): string {
  if (family.includes("/")) return family;
  const familyLower = family.toLowerCase();
  const tiers = LLM_FAMILIES[familyLower];
  if (!tiers) {
    const available = Object.keys(LLM_FAMILIES).sort().join(", ");
    throw new Error(`Family '${family}' not found. Available: ${available}`);
  }
  const tierLower = tier.toLowerCase();
  if (!isConsultTier(tierLower)) {
    throw new Error(`Tier '${tier}' does not exist for '${family}'. Use: lite, mid, flagship`);
  }
  return tiers[tierLower];
}
