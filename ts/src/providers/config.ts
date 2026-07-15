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
