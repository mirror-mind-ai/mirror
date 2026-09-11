/**
 * The one transport-selection precedence for provider-backed command families
 * (CV22.DS8.US1, generalized by CV22.DS8.US3 / CR077).
 *
 * Sixteen leaves reach a provider. Each one needs the same decision: an
 * operational revert to Python, a deterministic replay fixture for CI and the
 * parity harness, or the live provider. Deriving that per leaf is how the US11
 * defect happened -- `LLM_ROLES` had a type and a hand-maintained guard that
 * drifted apart, and the unit tests still passed. One list, no drift.
 *
 * CR077: a family may need MORE THAN ONE replay fixture (the close tail needs
 * an LLM fixture and an embedding fixture; `mirror load --query` and the
 * cultivation family are the same shape). The spec used to name one variable,
 * so the "both or neither" rule lived privately in `loggerRuntime` -- and the
 * router could report `replay` for an invocation the runtime then refused.
 * The spec now carries the whole rule and `incomplete_replay` is a mode, so
 * routing and the runtime agree by construction.
 */

export type ProviderTransportMode = "python" | "replay" | "incomplete_replay" | "live";

/**
 * Read-only env view. Indexed access is deliberate: families name their
 * variables as data, so a typed per-variable interface would have to be
 * extended for every family US3 flips.
 */
export type ProviderTransportEnv = Readonly<Record<string, string | undefined>>;

/** The provider kinds a replay fixture can answer for. */
export type ProviderKind = "llm" | "embedding" | "credits";

/**
 * Which fixture variable answers for which provider kind.
 *
 * Keyed rather than a bare list because the family provider factory has to
 * know what each fixture IS, not only that it is required. The "all or none"
 * rule derives from the declared set either way.
 */
export type ProviderReplaySpec = Partial<Record<ProviderKind, string>>;

export interface ProviderTransportSpec {
  /** Family revert control. `=0` sends the family back to Python. */
  revertVar: string;
  /** Replay fixture variables this family needs. All of them, or none. */
  replay?: ProviderReplaySpec;
  /** Reason recorded when the live provider is selected. */
  liveReason?: string;
}

export interface ProviderTransportDecision {
  mode: ProviderTransportMode;
  /** Route-decision reason, surfaced in the front-door log. Never a payload. */
  reason: string;
  /** Set only in `replay` mode: the fixture path for each declared kind. */
  replayPaths?: Readonly<ProviderReplaySpec>;
  /** Set only in `incomplete_replay`: the fixtures that must also be set. */
  missingReplayVars?: readonly string[];
  /** Set only in `incomplete_replay`: the fixtures that already are. */
  presentReplayVars?: readonly string[];
}

/**
 * Resolve which transport answers a provider-backed command.
 *
 * Precedence, highest first:
 *
 * 1. **revert** -- `<revertVar>=0`. An operational escape hatch must not be
 *    outvoted by leftover replay configuration in the same shell.
 * 2. **replay** -- every declared fixture variable is set. Deterministic, no
 *    network, no spend. This is what CI and `real_db_copy_parity.py` use. It
 *    deliberately does not require `MIRROR_TS_EXTERNAL_ROUTES`: that gate was
 *    DS5's safety catch while replay was the PRODUCTION route, and after the
 *    live cutover replay is a test transport.
 * 3. **incomplete_replay** -- some declared fixtures are set and some are not.
 *    Never live: someone who set one variable meant to replay, and running
 *    half a fixture would spend real money. Never Python either -- Python has
 *    no replay transport, so it would spend too, just on the other engine and
 *    silently. The only honest answer names the missing half.
 * 4. **live** -- the DS8 default. An unconfigured install reaches the provider
 *    through TypeScript.
 *
 * Only an exact `"0"` reverts, so an unrelated value cannot silently disable
 * the TS route; an exported-but-empty fixture variable is treated as absent,
 * because that shell accident should not become a file-not-found later.
 */
export function resolveProviderTransport(
  env: ProviderTransportEnv,
  spec: ProviderTransportSpec,
): ProviderTransportDecision {
  if (env[spec.revertVar] === "0") {
    return { mode: "python", reason: `${spec.revertVar}=0 revert to Python` };
  }

  const declared = declaredReplayVars(spec);
  const present = declared.filter(([, variable]) => Boolean(env[variable]));

  if (declared.length > 0 && present.length === declared.length) {
    const replayPaths: ProviderReplaySpec = {};
    for (const [kind, variable] of declared) replayPaths[kind] = env[variable];
    return {
      mode: "replay",
      reason: `${declared.map(([, variable]) => variable).join(" + ")} replay transport`,
      replayPaths,
    };
  }

  if (present.length > 0) {
    const missingReplayVars = declared
      .filter(([, variable]) => !env[variable])
      .map(([, variable]) => variable);
    const presentReplayVars = present.map(([, variable]) => variable);
    return {
      mode: "incomplete_replay",
      reason:
        `incomplete replay fixture: ${presentReplayVars.join(", ")} set, ` +
        `${missingReplayVars.join(", ")} missing`,
      missingReplayVars,
      presentReplayVars,
    };
  }

  return { mode: "live", reason: spec.liveReason ?? "live provider" };
}

/** The declared fixture variables, in a stable kind order for stable reasons. */
function declaredReplayVars(spec: ProviderTransportSpec): [ProviderKind, string][] {
  const order: ProviderKind[] = ["llm", "embedding", "credits"];
  return order
    .filter((kind) => Boolean(spec.replay?.[kind]))
    .map((kind) => [kind, spec.replay?.[kind] as string]);
}

/**
 * Exactly one half of a multi-fixture family's replay configuration is set.
 *
 * Deliberately NOT the Python fallback: that would be no safer, because Python
 * has no replay transport and would spend on the live provider too -- just on
 * the other engine, and silently. Someone who set one variable meant to
 * replay, so the only honest answer is to stop and name the missing half.
 *
 * Lived in `loggerRuntime` until CR077; it is the whole family rule's error,
 * so it belongs beside the rule.
 */
export class ReplayFixtureIncompleteError extends Error {
  constructor(decision: ProviderTransportDecision) {
    const missing = (decision.missingReplayVars ?? []).join(", ");
    const present = (decision.presentReplayVars ?? []).join(", ");
    super(
      `${present} is set but ${missing} is not. This command needs EVERY replay ` +
        "fixture its family declares; running with part of one would reach the live " +
        `provider and spend real money. Set ${missing}, or unset ${present} to run live ` +
        "deliberately.",
    );
    this.name = "ReplayFixtureIncompleteError";
  }
}

// --- Family transport specs ------------------------------------------------
//
// Each provider-backed family names its variables here, in one place, rather
// than in the route that happens to consume them: `routing.ts` decides the
// engine and the provider factory builds the providers, and both must read the
// same spec or they can disagree about which transport is live.

/**
 * Fresh semantic search (CV22.DS8.US1).
 *
 * `MIRROR_TS_EXTERNAL_ROUTES` is deliberately absent: it was DS5's safety gate
 * while replay was the PRODUCTION route for this leaf, and after the live
 * cutover replay is a test transport.
 */
export const SEARCH_TRANSPORT: ProviderTransportSpec = {
  revertVar: "MIRROR_TS_SEARCH",
  replay: { embedding: "MIRROR_TS_SEARCH_EMBEDDING_REPLAY" },
  liveReason: "DS8.US1 fresh semantic search live",
};

/**
 * The conversation close tail (CV22.DS8.US2): title, tags, summary, memory and
 * task extraction, and their embeddings.
 *
 * Two fixtures back this family, not one -- the pair rule that motivated
 * CR077. It now lives in the spec, so the router cannot report `replay` for an
 * invocation the runtime refuses.
 *
 * The revert is tail-only on purpose. `MIRROR_TS_CONVERSATION_LOGGER=0` still
 * reverts all fifteen subcommands, but the seven deterministic ones have
 * answered from TypeScript since 2026-09-02 and a live-provider scare must not
 * drag them back with the five that cross the model.
 */
export const CONVERSATION_TAIL_TRANSPORT: ProviderTransportSpec = {
  revertVar: "MIRROR_TS_CONVERSATION_LLM_TAIL",
  replay: {
    llm: "MIRROR_TS_CONVERSATION_LLM_REPLAY",
    embedding: "MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY",
  },
  liveReason: "DS8.US2 conversation close tail live",
};
