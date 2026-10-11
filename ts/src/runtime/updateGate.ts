// The pre-update status gate (CV22.DS10.US2).
//
// Port of `_status_allows_update_preflight`, kept as a pure function of the
// status report because it is the single most consequential decision the
// updater makes: whether to touch the tree at all.
//
// The relaxed lane is narrow ON PURPOSE, and the oracle's docstring says why:
// the updater must not let old code block the very update that would teach it
// about a newer migration. So core-migration ledger drift -- and ONLY that --
// may pass a non-ready status, because the update still backs up before it
// migrates and still requires a ready status afterwards. Everything else
// (dirty tree, missing database, unready extension, unresolvable home) fails.

import type { RuntimeStatusReport } from "#runtime/status.ts";

export interface GateVerdict {
  allowed: boolean;
  detail: string;
}

export function statusAllowsUpdatePreflight(report: RuntimeStatusReport): GateVerdict {
  if (report.mirror_home_error) return { allowed: false, detail: report.mirror_home_error };
  if (report.git.error) return { allowed: false, detail: report.git.error };
  if (report.git.dirty) return { allowed: false, detail: "git tree is dirty" };
  if (report.db_exists !== true) return { allowed: false, detail: "database missing" };
  if (report.extension_health.some((item) => !item.ready)) {
    return { allowed: false, detail: "extension health is not ready" };
  }

  const core = report.core_migrations;
  if (core.ready) return { allowed: true, detail: "runtime status is ready" };
  if (core.note) return { allowed: false, detail: core.note };

  const parts: string[] = [];
  if (core.missing.length > 0) parts.push(`pending core migrations: ${core.missing.join(", ")}`);
  if (core.unknown.length > 0) parts.push(`unknown core migrations: ${core.unknown.join(", ")}`);
  if (parts.length > 0) return { allowed: true, detail: parts.join("; ") };

  return { allowed: false, detail: "core migration status is not ready" };
}
