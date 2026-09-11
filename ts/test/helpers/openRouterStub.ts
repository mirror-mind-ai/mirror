import type { OpenRouterClient, ProviderRequestOptions } from "#providers/openrouter.ts";

/**
 * A stub OpenRouter client for the live-provider tests.
 *
 * `OpenRouterClient` carries both verbs, and a test that only cares about one
 * of them should not have to spell the other out -- but it must not silently
 * pretend the other works either. The unimplemented verb therefore throws with
 * the test's own name in the message, so a provider that reaches for the wrong
 * endpoint fails loudly rather than returning undefined.
 */
export interface OpenRouterStubHandlers {
  postJson?: (path: string, body: unknown, options: ProviderRequestOptions) => Promise<unknown>;
  getJson?: (path: string, options: ProviderRequestOptions) => Promise<unknown>;
}

export function stubOpenRouterClient(handlers: OpenRouterStubHandlers): OpenRouterClient {
  return {
    postJson: async (path, body, options) => {
      if (!handlers.postJson) throw new Error(`unexpected POST ${path} in a GET-only stub`);
      return handlers.postJson(path, body, options);
    },
    getJson: async (path, options) => {
      if (!handlers.getJson) throw new Error(`unexpected GET ${path} in a POST-only stub`);
      return handlers.getJson(path, options);
    },
  };
}
