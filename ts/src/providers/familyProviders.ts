/**
 * The one place a provider-backed family turns its transport decision into
 * actual providers (CV22.DS8.US3).
 *
 * Before this, every route did it inline: `searchRoute` read `replayPath` and
 * built a replay or live embedding provider, `loggerRuntime` did the same for
 * two fixtures plus the pair rule, and `cli.ts` repeated the shape four more
 * times with a hand-written `throw` per family. Six copies of one decision is
 * how the router and the runtime came to disagree (CR077).
 *
 * The spec's declared fixtures double as the family's provider MANIFEST, and
 * that is a real invariant rather than a coincidence: a family must have a
 * replay fixture for every provider kind it touches, or CI would have to reach
 * the network to exercise it. So `replay: { llm, embedding }` says both "these
 * are required to replay" and "these are the providers this family uses".
 */

import {
  type CreditProvider,
  LiveCreditProvider,
  loadReplayCreditProvider,
} from "#providers/credits.ts";
import {
  type EmbeddingProvider,
  LiveEmbeddingProvider,
  loadReplayEmbeddingProvider,
} from "#providers/embedding.ts";
import { LiveLlmProvider, type LlmProvider, loadReplayLlmProvider } from "#providers/llm.ts";
import {
  type ComposedProviderTransportSpec,
  type ProviderTransportDecision,
  type ProviderTransportEnv,
  type ProviderTransportSpec,
  ReplayFixtureIncompleteError,
  resolveComposedProviderTransport,
  resolveProviderTransport,
} from "#providers/transport.ts";

/**
 * What a family can be: one spec, or a command that composes several
 * (CV22.DS7.US8 item 18b).
 *
 * The factory accepts both because the ROUTE and the RUNTIME must reach the
 * same decision for the same invocation. Leaving the composition to the router
 * and handing this function the owning spec alone would reintroduce CR077 one
 * level up: `MIRROR_TS_SEARCH=0` would route `build load` to Python while this
 * factory cheerfully constructed a live embedding provider for it.
 */
export type FamilyTransport = ProviderTransportSpec | ComposedProviderTransportSpec;

/** A composition names its owner; a plain spec names its revert variable. */
function isComposed(spec: FamilyTransport): spec is ComposedProviderTransportSpec {
  return "owner" in spec;
}

export interface FamilyProviders {
  /** Which transport answered. `python` never reaches here -- it returns null. */
  readonly mode: "replay" | "live";
  /** The transport decision's reason, for the front-door log. */
  readonly reason: string;
  /** Present when the family declares an LLM fixture. */
  readonly llm?: LlmProvider;
  /** Present when the family declares an embedding fixture. */
  readonly embedding?: EmbeddingProvider;
  /** Present when the family declares a credits fixture (`consult`). */
  readonly credits?: CreditProvider;
}

/**
 * Test seams. The replay loaders and the live constructors are separately
 * injectable because they are separately interesting: replay tests need a
 * fixture that never touches disk, and live tests need a provider that fails
 * on demand without reaching the network.
 */
export interface FamilyProviderOverrides {
  loadReplayLlm?: (path: string) => Promise<LlmProvider>;
  loadReplayEmbedding?: (path: string) => Promise<EmbeddingProvider>;
  loadReplayCredits?: (path: string) => Promise<CreditProvider>;
  liveLlm?: (env: ProviderTransportEnv) => LlmProvider;
  liveEmbedding?: (env: ProviderTransportEnv) => EmbeddingProvider;
  liveCredits?: (env: ProviderTransportEnv) => CreditProvider;
}

/**
 * Build the providers for one family, or `null` when the family is reverted to
 * Python (the route then falls back, as `loggerCli` does).
 *
 * Throws `ReplayFixtureIncompleteError` when part of a multi-fixture family is
 * configured: half a fixture must never become a live call.
 *
 * Live providers resolve their config lazily, so a missing key surfaces at the
 * call site -- where each leaf's own failure contract applies -- rather than
 * at construction, where it would break commands that never reach the model.
 */
export async function resolveFamilyProviders(
  env: ProviderTransportEnv,
  spec: FamilyTransport,
  overrides: FamilyProviderOverrides = {},
): Promise<FamilyProviders | null> {
  // A composed command's PROVIDERS come from its owning family: the fixtures
  // the other families declare answer for their own commands, never for this
  // one. The composition changes which transport is chosen, not whose
  // manifest is built.
  const owner = isComposed(spec) ? spec.owner : spec;
  const decision = isComposed(spec)
    ? resolveComposedProviderTransport(env, spec)
    : resolveProviderTransport(env, spec);
  if (decision.mode === "python") return null;
  if (decision.mode === "incomplete_replay") throw new ReplayFixtureIncompleteError(decision);
  return decision.mode === "replay"
    ? replayProviders(decision, overrides)
    : liveProviders(env, owner, decision, overrides);
}

async function replayProviders(
  decision: ProviderTransportDecision,
  overrides: FamilyProviderOverrides,
): Promise<FamilyProviders> {
  const paths = decision.replayPaths ?? {};
  const loadLlm = overrides.loadReplayLlm ?? loadReplayLlmProvider;
  const loadEmbedding = overrides.loadReplayEmbedding ?? loadReplayEmbeddingProvider;
  const loadCredits = overrides.loadReplayCredits ?? loadReplayCreditProvider;
  const [llm, embedding, credits] = await Promise.all([
    paths.llm ? loadLlm(paths.llm) : undefined,
    paths.embedding ? loadEmbedding(paths.embedding) : undefined,
    paths.credits ? loadCredits(paths.credits) : undefined,
  ]);
  return { mode: "replay", reason: decision.reason, llm, embedding, credits };
}

function liveProviders(
  env: ProviderTransportEnv,
  spec: ProviderTransportSpec,
  decision: ProviderTransportDecision,
  overrides: FamilyProviderOverrides,
): FamilyProviders {
  const buildLlm = overrides.liveLlm ?? ((live) => new LiveLlmProvider({ env: { ...live } }));
  const buildEmbedding =
    overrides.liveEmbedding ?? ((live) => new LiveEmbeddingProvider({ env: { ...live } }));
  const buildCredits =
    overrides.liveCredits ?? ((live) => new LiveCreditProvider({ env: { ...live } }));
  return {
    mode: "live",
    reason: decision.reason,
    llm: spec.replay?.llm ? buildLlm(env) : undefined,
    embedding: spec.replay?.embedding ? buildEmbedding(env) : undefined,
    credits: spec.replay?.credits ? buildCredits(env) : undefined,
  };
}
