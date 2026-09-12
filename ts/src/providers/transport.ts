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
  /**
   * A story that must land before this family may go live, when one exists.
   *
   * Not a revert and not a config error: the port is incomplete, so Python
   * answers and the reason says which story unblocks it. Deleting the field is
   * the whole flip. Used by the cultivation SCAN leaves, whose prompts were
   * never ported (CV22.DS8.TS2).
   */
  liveBlockedBy?: string;
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

  if (spec.liveBlockedBy) {
    return { mode: "python", reason: `live blocked by ${spec.liveBlockedBy}` };
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

/**
 * `soul harvest save` (CV22.DS8.US3) -- the one leaf of the Soul command that
 * crosses the provider seam, and only through the embedding: the save supplies
 * title, layer, and tags, so Python's journal classifier is unreachable.
 *
 * The revert is the whole Soul family switch rather than a new variable: every
 * other Soul leaf is deterministic, so `MIRROR_TS_SOUL=0` reverting all of
 * them costs nothing and adds no third thing to remember.
 */
export const SOUL_HARVEST_TRANSPORT: ProviderTransportSpec = {
  revertVar: "MIRROR_TS_SOUL",
  replay: { embedding: "MIRROR_TS_SOUL_EMBEDDING_REPLAY" },
  liveReason: "DS8.US3 soul harvest save live",
};

/**
 * `consult credits` and `consult ask` (CV22.DS8.US3).
 *
 * TWO specs for one family, because the fixtures are genuinely per leaf:
 * `credits` needs only the credits fixture, while `ask` needs the chat fixture
 * AND the credits one (it fetches the call's real cost, then prints the
 * balance). With the credits fixture alone, `credits` replays and `ask`
 * refuses -- it must not go live for the half nobody configured.
 */
export const CONSULT_CREDITS_TRANSPORT: ProviderTransportSpec = {
  revertVar: "MIRROR_TS_CONSULT",
  replay: { credits: "MIRROR_TS_CREDITS_REPLAY" },
  liveReason: "DS8.US3 consult credits live",
};

export const CONSULT_ASK_TRANSPORT: ProviderTransportSpec = {
  revertVar: "MIRROR_TS_CONSULT",
  replay: { llm: "MIRROR_TS_CONSULT_LLM_REPLAY", credits: "MIRROR_TS_CREDITS_REPLAY" },
  liveReason: "DS8.US3 consult ask live",
};

/**
 * `mirror load --query` (CV22.DS8.US3): the reception classifier plus the
 * query's own embedding for attachment and journey search.
 *
 * Its own revert variable rather than a `mirror` family switch: the
 * deterministic `mirror load` is the most-used read in the product and has
 * answered from TypeScript since DS7.US4. A live-provider scare must revert
 * the query path alone.
 *
 * `MEMORY_RECEPTION=0` still skips the classifier on both engines; the
 * embedding half stays, which is why both fixtures are declared.
 */
export const MIRROR_QUERY_TRANSPORT: ProviderTransportSpec = {
  revertVar: "MIRROR_TS_MIRROR_QUERY",
  replay: {
    llm: "MIRROR_TS_MIRROR_LLM_REPLAY",
    embedding: "MIRROR_TS_MIRROR_EMBEDDING_REPLAY",
  },
  liveReason: "DS8.US3 mirror load --query live",
};

/**
 * `consolidate scan` and `shadow scan` -- the two cultivation leaves that send
 * a PROMPT (CV22.DS8.US3).
 *
 * Blocked from live by CV22.DS8.TS2: TypeScript never ported
 * `CONSOLIDATION_PROMPT` or `SHADOW_SCAN_PROMPT`, so these leaves currently
 * send a fenced Markdown dump of the memories with no task statement and no
 * JSON output contract. Under replay that is invisible -- the provider answers
 * by role and ignores the prompt -- which is why it survived to DS8.
 *
 * The revert is tail-only: `consolidate list|reject|show` are deterministic and
 * have answered from TypeScript since DS7.US3.
 */
export const CULTIVATION_SCAN_TRANSPORT: ProviderTransportSpec = {
  revertVar: "MIRROR_TS_CULTIVATION",
  replay: { llm: "MIRROR_TS_CULTIVATION_LLM_REPLAY" },
  liveReason: "DS8.US3 cultivation scan live",
  liveBlockedBy: "DS8.TS2 (cultivation prompt templates not ported)",
};

/**
 * `consolidate apply` (CV22.DS8.US3).
 *
 * A SEPARATE spec, and not blocked by TS2: apply sends no prompt at all. A
 * `merge` embeds the merged content and an `identity_update` makes no provider
 * call whatsoever, so the only fixture it can need is the embedding one. The
 * plan and the burn-down ledger both said "the three cultivation leaves wait
 * for TS2"; measured, it is two.
 */
export const CULTIVATION_APPLY_TRANSPORT: ProviderTransportSpec = {
  revertVar: "MIRROR_TS_CULTIVATION",
  replay: { embedding: "MIRROR_TS_CULTIVATION_EMBEDDING_REPLAY" },
  liveReason: "DS8.US3 consolidate apply live",
};

/** `journal` (CV22.DS8.US3): classify the entry, then embed the memory. */
export const JOURNAL_TRANSPORT: ProviderTransportSpec = {
  revertVar: "MIRROR_TS_JOURNAL",
  replay: {
    llm: "MIRROR_TS_JOURNAL_LLM_REPLAY",
    embedding: "MIRROR_TS_JOURNAL_EMBEDDING_REPLAY",
  },
  liveReason: "DS8.US3 journal live",
};

/**
 * `week plan` (CV22.DS8.US3). `week save` and `week view` make no provider
 * call and are already ungated; `MIRROR_TS_WEEK=0` still reverts all three,
 * which is the existing family contract.
 */
export const WEEK_PLAN_TRANSPORT: ProviderTransportSpec = {
  revertVar: "MIRROR_TS_WEEK",
  replay: { llm: "MIRROR_TS_WEEK_LLM_REPLAY" },
  liveReason: "DS8.US3 week plan live",
};

/**
 * `descriptor generate` (CV22.DS8.US3). One call per persona AND per journey
 * when no `--layer/--key` narrows it, so the front-door log records `calls=N`.
 */
export const DESCRIPTOR_TRANSPORT: ProviderTransportSpec = {
  revertVar: "MIRROR_TS_DESCRIPTOR",
  replay: { llm: "MIRROR_TS_DESCRIPTOR_LLM_REPLAY" },
  liveReason: "DS8.US3 descriptor generate live",
};
