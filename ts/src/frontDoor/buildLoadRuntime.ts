// CV22.DS7.US8 plateau 7 — the wiring `build load` needs to run for real.
//
// `runBuildLoad` is a pure composition over a database plus three seams: an
// embedding provider, a conversation switch, and the clone-role guard. This
// module builds those seams from the process environment, and it exists at the
// route layer for two reasons: the guard reads the machine, and `builder/` is
// asserted to be provider-free (`test/builder/providerIsolation.test.ts`), which
// is the property that keeps twenty-six of the twenty-seven leaves unable to
// spend money.
//
// TWO callers, which is why it is a module and not an inline block:
// `explore story promote`, whose tail is a Builder session start (plateau 7),
// and plateau 8's `build` route. One wiring, so the two cannot drift about which
// transport answered or whether the close tail ran.
//
// ## The transport decision is COMPOSED, and taken before any byte
//
// `load` prints four surfaces before it reaches a provider, so the decision is
// resolved up front: `MIRROR_TS_BUILD=0`, `MIRROR_TS_SEARCH=0`, or
// `MIRROR_TS_CONVERSATION_LLM_TAIL=0` each send the whole command back to
// Python (`BUILD_LOAD_COMPOSITION`). A `null` return is that fallback; the
// caller must not have printed anything yet.

import { homedir } from "node:os";
import { dirname } from "node:path";
import type { BuildLoadDeps } from "#builder/load.ts";
import { switchConversation } from "#conversation/logger.ts";
import { createLoggerRuntime } from "#conversation/loggerRuntime.ts";
import type { WritableDatabase } from "#db/database.ts";
import { resolveFamilyProviders } from "#providers/familyProviders.ts";
import {
  BUILD_LOAD_COMPOSITION,
  BUILD_LOAD_TRANSPORT,
  CONVERSATION_TAIL_TRANSPORT,
  type ProviderTransportEnv,
  resolveComposedProviderTransport,
} from "#providers/transport.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";
import { inspectBuilderCloneRole } from "./cloneRoleGuard.ts";

export interface BuildLoadRuntimeOptions {
  readonly db: WritableDatabase;
  /** The resolved database path; the mirror home is its directory. */
  readonly dbPath: string;
  readonly env?: ProviderTransportEnv & Record<string, string | undefined>;
  /** Python passes `--ignore-production-role` through to the guard. */
  readonly ignoreProductionRole?: boolean;
  /** Test seam: the home the logger runtime resolves Pi sessions against. */
  readonly homeDir?: string;
}

export interface BuildLoadRuntime {
  /** Which transport answered, for the front-door log. Never a payload. */
  readonly reason: string;
  readonly mode: "replay" | "live";
  /** Ready for `runBuildLoad`. */
  readonly deps: BuildLoadDeps;
}

/**
 * Build the seams, or return `null` when the composition reverts to Python.
 *
 * Throws `ReplayFixtureIncompleteError` when half a fixture is configured: that
 * is a refusal by name, never a live call and never a silent Python fallback
 * (Python has no replay transport, so it would spend too).
 */
export async function createBuildLoadRuntime(
  options: BuildLoadRuntimeOptions,
): Promise<BuildLoadRuntime | null> {
  const env = options.env ?? process.env;
  const decision = resolveComposedProviderTransport(env, BUILD_LOAD_COMPOSITION);
  if (decision.mode === "python") return null;

  const family = await resolveFamilyProviders(env, BUILD_LOAD_COMPOSITION);
  if (family === null) return null; // unreachable: the composed decision agrees
  const embedding = family.embedding;
  if (embedding === undefined) {
    throw new Error("build load requires an embedding provider for its two searches");
  }

  // The close tail is the previous conversation's, and it belongs to the
  // conversation-tail family -- so it runs through that family's own runtime
  // rather than a second implementation here.
  const tail = createLoggerRuntime({
    db: options.db,
    mirrorHome: dirname(options.dbPath),
    homeDir: options.homeDir ?? homedir(),
    env: tailEnv(env, family.mode),
    deps: { newId, nowIso },
  });
  const hooks = await tail.closeHooks();

  return {
    reason: decision.reason,
    mode: family.mode,
    deps: {
      nowIso,
      newId,
      embeddingProvider: embedding,
      switchConversation: async (journey, sessionId) => {
        await switchConversation(
          options.db,
          sessionId,
          { persona: "engineer", journey },
          { newId, nowIso },
          hooks,
        );
      },
      cloneRoleGuard: (projectPath) =>
        inspectBuilderCloneRole(projectPath, {
          ignoreProductionRole: options.ignoreProductionRole ?? false,
        }),
    },
  };
}

/**
 * Under replay, the close tail reads THIS family's fixtures.
 *
 * `createLoggerRuntime` resolves `CONVERSATION_TAIL_TRANSPORT` itself, so a
 * shell holding only `MIRROR_TS_BUILD_*_REPLAY` would replay the two searches
 * and send the close tail to the live provider — spending real money inside a
 * command someone deliberately configured to be deterministic. Overlaying the
 * tail's variables keeps the promise the composition makes: every seam inside
 * `load` is answered by the owning family's fixtures.
 *
 * Live mode needs no overlay: both families resolve to the same live providers.
 */
function tailEnv(
  env: ProviderTransportEnv & Record<string, string | undefined>,
  mode: "replay" | "live",
): Record<string, string | undefined> {
  if (mode !== "replay") return { ...env };
  const llm = BUILD_LOAD_TRANSPORT.replay?.llm;
  const embedding = BUILD_LOAD_TRANSPORT.replay?.embedding;
  return {
    ...env,
    ...(CONVERSATION_TAIL_TRANSPORT.replay?.llm && llm
      ? { [CONVERSATION_TAIL_TRANSPORT.replay.llm]: env[llm] }
      : {}),
    ...(CONVERSATION_TAIL_TRANSPORT.replay?.embedding && embedding
      ? { [CONVERSATION_TAIL_TRANSPORT.replay.embedding]: env[embedding] }
      : {}),
  };
}
