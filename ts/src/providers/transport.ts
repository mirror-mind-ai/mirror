/**
 * The one transport-selection precedence for provider-backed command families
 * (CV22.DS8.US1, generalized by CV22.DS8.US3 / CR077).
 *
 * Sixteen leaves reach a provider. Each one needs the same decision: a
 * deterministic replay fixture for CI and the smokes, or the live provider.
 * Deriving that per leaf is how the US11 defect happened -- `LLM_ROLES` had a
 * type and a hand-maintained guard that drifted apart, and the unit tests
 * still passed. One list, no drift.
 *
 * Until CV22.DS10.TS5 there was a third answer, an operational revert to
 * Python (`<revertVar>=0`), and it outranked everything else. It left with the
 * engine it reverted to (decision D3). A leftover variable is inert, and
 * `runtime diagnose` says so.
 *
 * CR077: a family may need MORE THAN ONE replay fixture (the close tail needs
 * an LLM fixture and an embedding fixture; `mirror load --query` and the
 * cultivation family are the same shape). The spec used to name one variable,
 * so the "both or neither" rule lived privately in `loggerRuntime` -- and the
 * router could report `replay` for an invocation the runtime then refused.
 * The spec now carries the whole rule and `incomplete_replay` is a mode, so
 * routing and the runtime agree by construction.
 */

export type ProviderTransportMode = "replay" | "incomplete_replay" | "live";

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
 * 1. **replay** -- every declared fixture variable is set. Deterministic, no
 *    network, no spend. This is what CI and the smokes use. It deliberately
 *    does not require `MIRROR_TS_EXTERNAL_ROUTES`: that gate was DS5's safety
 *    catch while replay was the PRODUCTION route, and after the live cutover
 *    replay is a test transport.
 * 2. **incomplete_replay** -- some declared fixtures are set and some are not.
 *    Never live: someone who set one variable meant to replay, and running
 *    half a fixture would spend real money. The only honest answer names the
 *    missing half.
 * 3. **live** -- the DS8 default. An unconfigured install reaches the provider
 *    through TypeScript.
 *
 * An exported-but-empty fixture variable is treated as absent, because that
 * shell accident should not become a file-not-found later.
 */
export function resolveProviderTransport(
  env: ProviderTransportEnv,
  spec: ProviderTransportSpec,
): ProviderTransportDecision {
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
 * A command whose provider work belongs to families it does not own
 * (CV22.DS7.US8 item 18b).
 *
 * `build load` is the case that forced this. It owns no provider seam: its two
 * embeddings ARE the search family, and the previous conversation's close tail
 * IS the conversation-tail family -- both already live in production since DS8.
 * Its fixtures are the owner's; the composed families only say whether replay
 * was intended somewhere, so a half-configured harness refuses instead of
 * reaching the live provider through fixtures nobody set.
 */
export interface ComposedProviderTransportSpec {
  /** Named in every composed reason, so the log says which command composed. */
  readonly label: string;
  /** The family whose fixtures the command's providers are actually built from. */
  readonly owner: ProviderTransportSpec;
  /**
   * Families whose work this command performs. Consulted for replay intent --
   * never for fixtures, because a composing command runs every seam off the
   * owner's.
   */
  readonly composes: readonly ProviderTransportSpec[];
}

/**
 * Resolve one transport decision for a command that composes several families.
 *
 * Precedence, extending `resolveProviderTransport` rather than replacing it:
 *
 * 1. **any incomplete fixture refuses** -- including a composed family's. Its
 *    own pair rule cannot be honoured by a runtime that never sees it.
 * 2. **replay intent anywhere requires the OWNER's complete fixture set.** A
 *    harness that configured the search family for replay and then ran `build
 *    load` would reach the live provider through fixtures nobody set -- a
 *    silent charge -- so the only honest answer names the fixtures missing
 *    here.
 * 3. otherwise the owner's decision stands, unchanged.
 *
 * (A fourth rule, "any revert wins", sat on top until CV22.DS10.TS5 deleted
 * the reverts with the engine they reverted to.)
 *
 * With an empty `composes` the result is byte-identical to the single-family
 * decision: the composition is data, not a second precedence to drift from.
 */
export function resolveComposedProviderTransport(
  env: ProviderTransportEnv,
  spec: ComposedProviderTransportSpec,
): ProviderTransportDecision {
  const owner = resolveProviderTransport(env, spec.owner);
  const composed = spec.composes.map((family) => resolveProviderTransport(env, family));

  if (owner.mode === "incomplete_replay") return owner;
  const incomplete = composed.find((decision) => decision.mode === "incomplete_replay");
  if (incomplete) return composedReason(incomplete, spec.label);

  const replaying = spec.composes.filter((_, index) => composed[index]?.mode === "replay");
  if (owner.mode === "live" && replaying.length > 0) {
    const missingReplayVars = declaredReplayVars(spec.owner).map(([, variable]) => variable);
    // A composition whose owner declares no fixture has nothing to name, and
    // nothing of its own to replay either: the owner's decision stands.
    if (missingReplayVars.length > 0) {
      const presentReplayVars = replaying.flatMap((family) =>
        declaredReplayVars(family)
          .map(([, variable]) => variable)
          .filter((variable) => Boolean(env[variable])),
      );
      return composedReason(
        {
          mode: "incomplete_replay",
          reason:
            `incomplete replay fixture: ${presentReplayVars.join(", ")} set, ` +
            `${missingReplayVars.join(", ")} missing`,
          missingReplayVars,
          presentReplayVars,
        },
        spec.label,
      );
    }
  }

  return owner;
}

/** Same decision, with the composing command named for the front-door log. */
function composedReason(
  decision: ProviderTransportDecision,
  label: string,
): ProviderTransportDecision {
  return { ...decision, reason: `${decision.reason} (composed by ${label})` };
}

/**
 * Exactly one half of a multi-fixture family's replay configuration is set.
 *
 * Someone who set one variable meant to replay, so the only honest answer is
 * to stop and name the missing half. (Until CV22.DS10.TS5 a PLAIN family sent
 * this case to the Python fallback, which has no replay transport and would
 * have called the live provider; only compositions refused. With the fallback
 * gone every family refuses.)
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
// route and the provider factory builds the providers, and both must read the
// same spec or they can disagree about which transport is live.

/**
 * Fresh semantic search (CV22.DS8.US1).
 *
 * `MIRROR_TS_EXTERNAL_ROUTES` is deliberately absent: it was DS5's safety gate
 * while replay was the PRODUCTION route for this leaf, and after the live
 * cutover replay is a test transport.
 */
export const SEARCH_TRANSPORT: ProviderTransportSpec = {
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
 */
export const CONVERSATION_TAIL_TRANSPORT: ProviderTransportSpec = {
  replay: {
    llm: "MIRROR_TS_CONVERSATION_LLM_REPLAY",
    embedding: "MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY",
  },
  liveReason: "DS8.US2 conversation close tail live",
};

/**
 * `soul harvest save` (CV22.DS8.US3) -- the one leaf of the Soul command that
 * crosses the provider seam, and only through the embedding: the save supplies
 * title, layer, and tags, so the journal classifier is unreachable.
 */
export const SOUL_HARVEST_TRANSPORT: ProviderTransportSpec = {
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
  replay: { credits: "MIRROR_TS_CREDITS_REPLAY" },
  liveReason: "DS8.US3 consult credits live",
};

export const CONSULT_ASK_TRANSPORT: ProviderTransportSpec = {
  replay: { llm: "MIRROR_TS_CONSULT_LLM_REPLAY", credits: "MIRROR_TS_CREDITS_REPLAY" },
  liveReason: "DS8.US3 consult ask live",
};

/**
 * `mirror load --query` (CV22.DS8.US3): the reception classifier plus the
 * query's own embedding for attachment and journey search.
 *
 * `MEMORY_RECEPTION=0` skips the classifier; the embedding half stays, which is
 * why both fixtures are declared.
 */
export const MIRROR_QUERY_TRANSPORT: ProviderTransportSpec = {
  replay: {
    llm: "MIRROR_TS_MIRROR_LLM_REPLAY",
    embedding: "MIRROR_TS_MIRROR_EMBEDDING_REPLAY",
  },
  liveReason: "DS8.US3 mirror load --query live",
};

/**
 * `consolidate scan` and `shadow scan` -- the two cultivation leaves that send
 * a PROMPT. Everything around the call landed in CV22.DS8.US3; the flip
 * itself waited for CV22.DS8.TS2, because until then TypeScript sent a fenced
 * Markdown dump of the memories with no task statement and no JSON output
 * contract -- invisible under replay, which answers by role and never reads
 * the prompt. The real templates now travel with the call and their assembled
 * bytes are digest-pinned against the Python oracle (`cultivation/propose.ts`).
 */
export const CULTIVATION_SCAN_TRANSPORT: ProviderTransportSpec = {
  replay: { llm: "MIRROR_TS_CULTIVATION_LLM_REPLAY" },
  liveReason: "DS8.TS2 cultivation scan live",
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
  replay: { embedding: "MIRROR_TS_CULTIVATION_EMBEDDING_REPLAY" },
  liveReason: "DS8.US3 consolidate apply live",
};

/** `journal` (CV22.DS8.US3): classify the entry, then embed the memory. */
export const JOURNAL_TRANSPORT: ProviderTransportSpec = {
  replay: {
    llm: "MIRROR_TS_JOURNAL_LLM_REPLAY",
    embedding: "MIRROR_TS_JOURNAL_EMBEDDING_REPLAY",
  },
  liveReason: "DS8.US3 journal live",
};

/** `week plan` (CV22.DS8.US3). `week save` and `week view` make no provider call. */
export const WEEK_PLAN_TRANSPORT: ProviderTransportSpec = {
  replay: { llm: "MIRROR_TS_WEEK_LLM_REPLAY" },
  liveReason: "DS8.US3 week plan live",
};

/**
 * `descriptor generate` (CV22.DS8.US3). One call per persona AND per journey
 * when no `--layer/--key` narrows it, so the front-door log records `calls=N`.
 */
export const DESCRIPTOR_TRANSPORT: ProviderTransportSpec = {
  replay: { llm: "MIRROR_TS_DESCRIPTOR_LLM_REPLAY" },
  liveReason: "DS8.US3 descriptor generate live",
};

/**
 * `build load` (CV22.DS7.US8) -- the one leaf of the 27 that crosses the
 * provider seam, and the only family here that owns no seam of its own.
 *
 * Two fixtures, because `load` reaches the model twice over: the embedding for
 * its two searches (scoped and global, the same query), and the LLM plus
 * embedding of the previous conversation's close tail, which `switchConversation`
 * runs on the way in. Every seam inside the command is built from THESE
 * variables, which is why an incomplete set here refuses even when another
 * family's fixtures are present.
 */
export const BUILD_LOAD_TRANSPORT: ProviderTransportSpec = {
  replay: {
    llm: "MIRROR_TS_BUILD_LLM_REPLAY",
    embedding: "MIRROR_TS_BUILD_EMBEDDING_REPLAY",
  },
  liveReason: "DS7.US8 build load live",
};

/**
 * The three specs `build load` resolves BEFORE it prints a byte (item 18b).
 *
 * Four surfaces -- transition card, entry surface, identity context, and the
 * banner on stderr -- print ahead of the first provider call, so a refusal
 * decided later would come after all of them in the Navigator's terminal.
 *
 * The composed pair is what makes a half-configured harness refuse: replay
 * intent on the search or conversation-tail family requires this command's
 * own fixtures, rather than reaching the live provider through ones nobody set.
 */
export const BUILD_LOAD_COMPOSITION: ComposedProviderTransportSpec = {
  label: "build load",
  owner: BUILD_LOAD_TRANSPORT,
  composes: [SEARCH_TRANSPORT, CONVERSATION_TAIL_TRANSPORT],
};
