/**
 * The live transport for eval probes (CV22.DS10.TS3 plateau 4).
 *
 * This is the point of the whole transfer: the Python harness imported a
 * Python pipeline function, so a green run described Python's behavior while
 * TypeScript answered the surfaces in production. Here every probe calls the
 * TypeScript pipeline through the same `LiveLlmProvider` the close tail and
 * the front door use, so the gate measures the engine users actually run.
 *
 * Config resolves lazily on the first call, so importing a probe module --
 * which `--all` discovery does for every module, including ones it will not
 * run -- costs nothing and requires no key.
 */

import { LiveLlmProvider, type LlmProvider } from "#providers/llm.ts";

let provider: LlmProvider | null = null;

/** The shared live provider. One instance per process, created on first use. */
export function liveProvider(): LlmProvider {
  provider ??= new LiveLlmProvider();
  return provider;
}
