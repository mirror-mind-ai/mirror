// Timing normalization for the `session-maintenance` report (CV22.DS7.US10,
// Navigator decision 2). Elapsed seconds are wall-clock and cannot be
// byte-stable across runs or cores, so cross-core comparison replaces each
// timing token with a placeholder -- but only AFTER the token matches
// Python's exact grammar (` (N.Ns)`: one decimal, parentheses, trailing `s`).
// Stripping unconditionally would let report drift ride through the one
// check that exists to catch it. Shared by the goldens, the write-parity
// probes, and the E2E smoke so the three cannot normalize differently.

/** Python renders `f"{label}: {count} ({elapsed:.1f}s)"`. */
const TIMING_LINE = /^(?<label>[^:]+): (?<count>\d+) \((?<seconds>\d+\.\d)s\)$/;

export const ELAPSED_PLACEHOLDER = "<elapsed>";

export function normalizeMaintenanceReport(report: string): string {
  return report
    .split("\n")
    .map((line) => {
      if (!line.includes("(") || !line.endsWith("s)")) return line;
      const match = TIMING_LINE.exec(line);
      if (!match?.groups) {
        throw new Error(`timing line does not match Python's grammar: ${JSON.stringify(line)}`);
      }
      return `${match.groups.label}: ${match.groups.count} (${ELAPSED_PLACEHOLDER}s)`;
    })
    .join("\n");
}
