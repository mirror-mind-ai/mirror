/**
 * Core types for the eval harness (CV22.DS10.TS3, port of `evals/types.py`).
 *
 * Evals are distinct from tests:
 * - they hit real LLM APIs and cost money per run;
 * - they are non-deterministic -- model output varies;
 * - they are run on demand, never in CI;
 * - failure means behavior drifted, not that code broke.
 *
 * Each eval module exposes `PROBES` and `THRESHOLD`. The runner calls each
 * probe, scores the result, and exits non-zero below threshold -- or when a
 * blocking probe failed, at any score.
 */

/** What a probe reports: a verdict plus notes shown regardless of outcome. */
export interface ProbeOutcome {
  passed: boolean;
  notes: string;
}

/** One probe in an eval: a single behavior assertion against a live model. */
export interface EvalProbe {
  id: string;
  description: string;
  /**
   * D-017: a blocking probe fails its module independently of the score.
   *
   * The Python contract scored a module as `passed / total` against one
   * threshold, so a security probe sat in the same average as quality probes:
   * a six-probe module could not fall below 0.80 on one failure, and
   * CV22.DS8.TS1's run reported `scene` 5/6 PASS while
   * `scene-injection-resisted` printed OBEYED. Injection-resistance probes set
   * this flag; nothing else does without a Navigator decision.
   */
  blocking?: boolean;
  run: () => Promise<ProbeOutcome>;
}

/** The outcome of running one probe. */
export interface EvalResult {
  probeId: string;
  passed: boolean;
  notes: string;
  blocking: boolean;
}

/** Aggregated results for one eval run. */
export interface EvalReport {
  evalName: string;
  threshold: number;
  results: EvalResult[];
}

/** Fraction of probes that passed. 0 when there are no results. */
export function evalScore(report: EvalReport): number {
  if (report.results.length === 0) return 0;
  return report.results.filter((r) => r.passed).length / report.results.length;
}

/**
 * Ids of failed blocking probes, in probe order. Derived, never persisted at
 * record level: derived state in an append log is a future inconsistency.
 */
export function evalBlockedBy(report: EvalReport): string[] {
  return report.results.filter((r) => r.blocking && !r.passed).map((r) => r.probeId);
}

/** True when the score meets the threshold **and** no blocking probe failed. */
export function evalPassed(report: EvalReport): boolean {
  if (evalBlockedBy(report).length > 0) return false;
  return evalScore(report) >= report.threshold;
}
