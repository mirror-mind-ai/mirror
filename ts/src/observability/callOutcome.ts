/**
 * What actually happened on one provider-backed call (CV22.DS8.US3).
 *
 * Three leaves in this story swallow every failure, faithfully: Python's
 * `propose_consolidation` returns `None`, `propose_shadow_observations`
 * returns `[]`, and `reception` returns an empty result — for a transport
 * error, for output the parser rejects, and for an honest "nothing to say"
 * alike. Reproducing that is correct parity, and it means a live run can
 * report "no proposals found", cost real money, and look identical to a
 * healthy run that genuinely found nothing.
 *
 * So the swallow stays, and the DIAGNOSIS travels beside it: one outcome per
 * call, category only, into the front-door log. That is what lets the live
 * smoke read outcomes instead of counting rows — a zero-proposal run that
 * passed a count-based check is exactly the shape of the US2 false start
 * ("zero live calls, clean report") arriving one story later
 * (CV22.DS8.US3 plan review, ai-engineer).
 *
 * One taxonomy for every surface rather than a per-surface vocabulary. The
 * plan sketched `proposed|no_action|…` for cultivation and `ok|empty|…` for
 * reception; two vocabularies is two maps to keep in step, which is the
 * `LLM_ROLES` shape. The log line already names the surface, so the outcome
 * only has to name the SHAPE of what happened.
 */

import { ProviderConfigError } from "#providers/config.ts";
import { LlmTransportError } from "#providers/openrouter.ts";

export type ProviderCallOutcome =
  /** The model answered, the parser accepted it, and it carried a result. */
  | "answered"
  /** The model answered and the parser accepted it, but there was no result. */
  | "empty"
  /** A response arrived that the parser could not use. A PROMPT-layer signal. */
  | "parse_failed"
  /** No usable response arrived. A TRANSPORT-layer signal; `kind` narrows it. */
  | "transport_failed";

export interface ProviderCallReport {
  outcome: ProviderCallOutcome;
  /** The AI-18 taxonomy class, only for `transport_failed`. Never a message. */
  kind?: string;
}

export type OnProviderCallOutcome = (report: ProviderCallReport) => void;

/**
 * Reduce a provider failure to its CLASS. Only the class travels: provider
 * messages can echo request content, and the front-door log forbids payloads.
 */
export function classifyProviderError(error: unknown): string {
  if (error instanceof ProviderConfigError) return "config";
  if (error instanceof LlmTransportError) return error.kind;
  return "unknown";
}

/** `outcome=… kind=…`, the content-free form the front-door log carries. */
export function formatCallOutcome(surface: string, report: ProviderCallReport): string {
  const kind = report.kind ? ` kind=${report.kind}` : "";
  return `${surface} outcome=${report.outcome}${kind}`;
}

/**
 * Collect per-call reports and render one summary line per invocation.
 *
 * `calls=N` is the fan-out number: `descriptor generate` without
 * `--layer/--key` makes one call per persona AND per journey, and
 * `consolidate scan` one per cluster. Neither is bounded by anything but an
 * argument, so a runaway should be visible after the fact without reading the
 * ledger (CV22.DS8.US3 plan review, security).
 */
export class CallOutcomeTally {
  private readonly reports: ProviderCallReport[] = [];

  record(report: ProviderCallReport): void {
    this.reports.push(report);
  }

  get calls(): number {
    return this.reports.length;
  }

  /** `calls=3 answered=2 parse_failed=1`, in a stable outcome order. */
  summary(): string {
    const order: ProviderCallOutcome[] = ["answered", "empty", "parse_failed", "transport_failed"];
    const counts = order
      .map(
        (outcome) => [outcome, this.reports.filter((r) => r.outcome === outcome).length] as const,
      )
      .filter(([, count]) => count > 0)
      .map(([outcome, count]) => `${outcome}=${count}`);
    return [`calls=${this.calls}`, ...counts].join(" ");
  }
}
