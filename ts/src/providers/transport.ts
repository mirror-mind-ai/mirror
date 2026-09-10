/**
 * The one transport-selection precedence for provider-backed command families
 * (CV22.DS8.US1).
 *
 * Sixteen leaves reach a provider. Each one needs the same three-way decision:
 * an operational revert to Python, a deterministic replay fixture for CI and
 * the parity harness, or the live provider. Deriving that per leaf is how the
 * US11 defect happened -- `LLM_ROLES` had a type and a hand-maintained guard
 * that drifted apart, and the unit tests still passed. One list, no drift.
 *
 * US2 and US3 reuse this for their families instead of re-deriving it.
 */

export type ProviderTransportMode = "python" | "replay" | "live";

/**
 * Read-only env view. Indexed access is deliberate: families name their
 * variables as data (`revertVar`), so a typed per-variable interface would
 * have to be extended for every family US2/US3 flips.
 */
export type ProviderTransportEnv = Readonly<Record<string, string | undefined>>;

export interface ProviderTransportSpec {
  /** Family revert control. `=0` sends the family back to Python. */
  revertVar: string;
  /** Optional replay-fixture path variable, when the family has one. */
  replayVar?: string;
  /** Reason recorded when the live provider is selected. */
  liveReason?: string;
}

export interface ProviderTransportDecision {
  mode: ProviderTransportMode;
  /** Route-decision reason, surfaced in the front-door log. Never a payload. */
  reason: string;
  /** Set only in `replay` mode. */
  replayPath?: string;
}

/**
 * Resolve which transport answers a provider-backed command.
 *
 * Precedence, highest first:
 *
 * 1. **revert** -- `<revertVar>=0`. An operational escape hatch must not be
 *    outvoted by leftover replay configuration in the same shell.
 * 2. **replay** -- a non-empty `<replayVar>`. Deterministic, no network, no
 *    spend. This is what CI and `real_db_copy_parity.py` use. It deliberately
 *    no longer requires `MIRROR_TS_EXTERNAL_ROUTES`: that gate was DS5's
 *    safety catch while replay was the PRODUCTION route, and after the live
 *    cutover replay is a test transport.
 * 3. **live** -- the DS8 default. An unconfigured install now reaches the
 *    provider through TypeScript.
 *
 * Only an exact `"0"` reverts, so an unrelated value cannot silently disable
 * the TS route; an exported-but-empty replay variable is treated as absent,
 * because that shell accident should not become a file-not-found later.
 */
export function resolveProviderTransport(
  env: ProviderTransportEnv,
  spec: ProviderTransportSpec,
): ProviderTransportDecision {
  if (env[spec.revertVar] === "0") {
    return { mode: "python", reason: `${spec.revertVar}=0 revert to Python` };
  }

  const replayPath = spec.replayVar ? env[spec.replayVar] : undefined;
  if (replayPath) {
    return {
      mode: "replay",
      reason: `${spec.replayVar} replay transport`,
      replayPath,
    };
  }

  return { mode: "live", reason: spec.liveReason ?? "live provider" };
}
