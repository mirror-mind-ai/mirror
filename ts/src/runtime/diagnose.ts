// `runtime diagnose` (CV22.DS7.TS3 plateau 3b). Port of the drift-diagnosis
// half of `src/memory/cli/runtime.py`.
//
// Diagnose is the read-only "what is wrong with this install?" pass: filesystem
// posture, recent front-door errors, FTS index health, and everything the
// status readers already found, flattened into ordered findings. It must never
// repair, migrate, or write -- a diagnosis that changes the thing it is
// diagnosing reports a state it created.
//
// ONE RECORDED DIVERGENCE (D3), the same class the Navigator settled for the
// manifest notes in plateau 3a: `fts_corrupt` embeds the DRIVER's error text,
// and the two drivers describe the same corruption differently --
//
//   Python:  database disk image is malformed
//   Node:    fts5: corruption found reading blob 10 from table "memories_fts"
//
// -- because they link different SQLite builds. Mirror's own words around it
// are byte-identical, and the golden pins those and records both tails. TS is
// not normalized to Python's string: the message is driver-dependent rather
// than a fixed mapping, so translating it would invent an answer, and Node's
// is the more actionable of the two.
//
// NOT ported: a live model catalog call. `probeModelPins` runs against the DS5
// replay substrate or reports inconclusive, exactly as the oracle reports
// inconclusive without a key; the live fetch belongs to DS8.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { openDatabaseReadOnly } from "#db/database.ts";
import { sortByCodePoint } from "#util/pythonText.ts";
import type { GitWorktreeEntry } from "./git.ts";
import type { RuntimeStatusReport } from "./status.ts";

export interface DriftFinding {
  code: string;
  severity: string;
  subject: string;
  detail: string;
  recommendation: string;
  repair_route: string;
}

/**
 * CV9.E2.S6 — the homes root (`~/.mirror-minds`) holds user-home directories
 * and nothing else. A known runtime directory sitting directly in the root is
 * a legacy artifact of the pre-containment resolution rule.
 */
const ROOT_RUNTIME_DIR_NAMES = new Set(["backups"]);

const FRONT_DOOR_WINDOW_MS = 24 * 60 * 60 * 1000;
const FRONT_DOOR_TAIL_LINES = 1000;
const FTS_PROBE_TERM = "mirror_fts_integrity_probe";

/** Port of `_git_dirty_finding`. */
export function gitDirtyFinding(entry: GitWorktreeEntry): DriftFinding {
  const isSessionHtml = entry.path.startsWith("pi-session-") && entry.path.endsWith(".html");
  let recommendation: string;
  let repairRoute: string;
  if (entry.status === "??" && isSessionHtml) {
    recommendation = "archive or ignore generated session HTML before update planning";
    repairRoute = "manual review";
  } else if (entry.status === "??") {
    recommendation = "review untracked file before update planning";
    repairRoute = "manual review";
  } else {
    recommendation = "commit, stash, or discard intentional work before update planning";
    repairRoute = "commit or manual review";
  }
  return {
    code: "git_dirty",
    severity: "attention",
    subject: "repository",
    detail: `${entry.status} ${entry.path}`,
    recommendation,
    repair_route: repairRoute,
  };
}

/**
 * Port of `scan_homes_root_state`: files and known runtime directories sitting
 * directly in the homes root. User homes and hidden entries (`.DS_Store`) are
 * not offenders.
 */
export function scanHomesRootState(homesRoot: string): string[] {
  let names: string[];
  try {
    names = sortByCodePoint(readdirSync(homesRoot));
  } catch {
    return [];
  }
  const offenders: string[] = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const full = join(homesRoot, name);
    let isFile: boolean;
    try {
      isFile = statSync(full).isFile();
    } catch {
      continue;
    }
    if (isFile || ROOT_RUNTIME_DIR_NAMES.has(name)) offenders.push(full);
  }
  return offenders;
}

/** Port of `root_state_findings`. */
export function rootStateFindings(homesRoot: string): DriftFinding[] {
  return scanHomesRootState(homesRoot).map((path) => ({
    code: "legacy_root_runtime_state",
    severity: "attention",
    subject: `homes root ${homesRoot}`,
    detail: path,
    recommendation:
      "relocate into the owning mirror home " +
      "(see REFERENCE.md \u2014 Relocating legacy root runtime state)",
    repair_route: "manual relocation",
  }));
}

/**
 * Port of `_loose_permission_findings`. The mirror home holds a person's
 * identity, memories, and conversations; the expected posture is owner-only.
 * Creation points enforce it -- this only reports drift on installs that
 * predate the rule. POSIX only, as in the oracle: Windows ACLs are out of scope.
 */
export function loosePermissionFindings(report: RuntimeStatusReport): DriftFinding[] {
  if (process.platform === "win32") return [];
  const targets: [string, string][] = [];
  if (report.mirror_home !== null && report.mirror_home_error === null) {
    targets.push(["mirror home", report.mirror_home]);
  }
  if (report.db_path !== null && report.db_exists) targets.push(["database", report.db_path]);

  const findings: DriftFinding[] = [];
  for (const [area, path] of targets) {
    let stats: ReturnType<typeof statSync>;
    try {
      stats = statSync(path);
    } catch {
      continue;
    }
    const mode = stats.mode & 0o777;
    if ((mode & 0o077) === 0) continue;
    const wanted = stats.isDirectory() ? "700" : "600";
    findings.push({
      code: "loose_permissions",
      severity: "attention",
      subject: area,
      detail: `${path} is group/other-accessible (mode ${mode.toString(8)})`,
      recommendation:
        "mirror data should be owner-only; restrict directories to 700 and files to 600",
      repair_route: `chmod ${wanted} ${path}`,
    });
  }
  return findings;
}

/**
 * Python `datetime.fromisoformat(value.replace("Z", "+00:00"))`, narrowed to
 * what the front door actually writes (`Date.toISOString()`).
 *
 * Returns null for anything unparseable AND for a timestamp with no offset.
 * The oracle parses a naive timestamp successfully and then raises TypeError
 * comparing it to an aware cutoff -- an uncaught crash in a read-only
 * diagnostic. Unreachable with the current writer, which always emits `Z`, so
 * this is not a behavioral divergence on any log the front door produces; it
 * is a crash not worth porting. Captured for Debt Review.
 */
function parseLogTimestamp(value: string): number | null {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Port of `_front_door_error_findings` (CR026). The front door appends
 * redacted, metadata-only lines; a non-green summary when ERROR lines appear
 * in the last 24h keeps backup, guard, and routing failures from being
 * invisible.
 */
export function frontDoorErrorFindings(
  report: RuntimeStatusReport,
  now: Date = new Date(),
): DriftFinding[] {
  if (report.db_path === null) return [];
  const logPath = join(dirname(report.db_path), "front-door.log");
  if (!existsSync(logPath)) return [];
  const cutoff = now.getTime() - FRONT_DOOR_WINDOW_MS;

  let lines: string[];
  try {
    // `errors="replace"` in the oracle; Node's utf8 decode substitutes U+FFFD
    // for the same malformed bytes, so a corrupt line is skipped, not fatal.
    lines = readFileSync(logPath, "utf8").split("\n");
  } catch {
    return [];
  }
  // Python's `splitlines()` drops a trailing empty segment; `split` does not.
  if (lines.at(-1) === "") lines.pop();

  let recentErrors = 0;
  for (const line of lines.slice(-FRONT_DOOR_TAIL_LINES)) {
    const parts = line.split("\t");
    if (parts.length < 2 || parts[1] !== "ERROR") continue;
    const stamp = parseLogTimestamp(parts[0] as string);
    if (stamp === null) continue;
    if (stamp >= cutoff) recentErrors += 1;
  }
  if (recentErrors === 0) return [];
  return [
    {
      code: "front_door_errors",
      severity: "attention",
      subject: "front door",
      detail: `${recentErrors} front-door error(s) in the last 24h (${logPath})`,
      recommendation:
        "inspect the front-door log; rule out routing, schema-guard, and backup failures",
      repair_route: "review front-door.log",
    },
  ];
}

/**
 * Port of `_fts_consistency_findings` (CR021). `memories_fts` is an
 * external-content FTS5 index kept in sync by triggers, so a row-count
 * comparison cannot detect desync -- the count always mirrors the content
 * table. A corrupt index, however, raises on any MATCH, which makes a probe
 * query a genuine read-only detector. The authoritative FTS5
 * `integrity-check` needs a writable handle and lives in the write path.
 *
 * See D3 in the module header for the driver-text divergence this carries.
 */
export function ftsConsistencyFindings(report: RuntimeStatusReport): DriftFinding[] {
  if (report.db_path === null || !report.db_exists) return [];
  let db: ReturnType<typeof openDatabaseReadOnly>;
  try {
    db = openDatabaseReadOnly(report.db_path);
  } catch {
    return [];
  }
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[];
    if (!tables.some((row) => row.name === "memories_fts")) return [];
    db.prepare("SELECT rowid FROM memories_fts WHERE memories_fts MATCH ? LIMIT 1").get(
      FTS_PROBE_TERM,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return [
      {
        code: "fts_corrupt",
        severity: "attention",
        subject: "memories_fts",
        detail: `FTS query failed (${detail}); the index may be corrupt or desynced`,
        recommendation:
          "rebuild the FTS index: INSERT INTO memories_fts(memories_fts) VALUES('rebuild')",
        repair_route: "rebuild memories_fts",
      },
    ];
  } finally {
    db.close();
  }
  return [];
}

export interface DiagnoseOptions {
  /** Injected only so the 24h boundary is testable; production passes none. */
  now?: Date;
}

/**
 * Port of `diagnose_runtime`. Finding ORDER is part of the rendered output, so
 * the sequence below mirrors the oracle statement for statement.
 */
export function diagnoseRuntime(
  report: RuntimeStatusReport,
  worktreeEntries: readonly GitWorktreeEntry[] = [],
  options: DiagnoseOptions = {},
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  findings.push(...loosePermissionFindings(report));
  findings.push(...frontDoorErrorFindings(report, options.now));
  findings.push(...ftsConsistencyFindings(report));

  if (report.mirror_home_error) {
    findings.push({
      code: "mirror_home_missing",
      severity: "blocker",
      subject: "mirror home",
      detail: report.mirror_home_error,
      recommendation: "configure MIRROR_HOME or MIRROR_USER before update planning",
      repair_route: "configuration",
    });
  }
  if (report.db_exists === false) {
    findings.push({
      code: "database_missing",
      severity: "blocker",
      subject: "database",
      detail: report.db_path ?? "unknown",
      recommendation: "restore or initialize the memory database before update planning",
      repair_route: "restore or initialize",
    });
  }

  findings.push(...worktreeEntries.map(gitDirtyFinding));

  for (const migrationId of report.core_migrations.missing) {
    findings.push({
      code: "core_migration_pending",
      severity: "blocker",
      subject: "database _migrations",
      detail: migrationId,
      recommendation: "run pending core migrations only after backup",
      repair_route: "backup then migrate",
    });
  }
  for (const migrationId of report.core_migrations.unknown) {
    findings.push({
      code: "core_migration_unknown",
      severity: "attention",
      subject: "database _migrations",
      detail: migrationId,
      recommendation: "classify as legacy core row, extension-owned row, or experimental drift",
      repair_route: "manual review",
    });
  }
  if (report.core_migrations.note) {
    findings.push({
      code: "core_migration_unreadable",
      severity: "blocker",
      subject: "database _migrations",
      detail: report.core_migrations.note,
      recommendation: "restore readable migration tracking before update planning",
      repair_route: "database repair",
    });
  }

  for (const extension of report.extension_health) {
    // Only the missing-field shape is a blocker in the oracle: the other
    // manifest failures are reported by `status` but do not gate an update.
    if (extension.note?.includes("missing required field")) {
      findings.push({
        code: "extension_manifest_invalid",
        severity: "blocker",
        subject: `extension/${extension.extension_id}`,
        detail: extension.note,
        recommendation: "repair or reinstall the extension manifest before update planning",
        repair_route: "extension repair",
      });
    }
    for (const filename of extension.pending_migrations) {
      findings.push({
        code: "extension_migration_pending",
        severity: "blocker",
        subject: `extension/${extension.extension_id}`,
        detail: filename,
        recommendation: "run pending extension migrations only after backup",
        repair_route: "backup then extension migrate",
      });
    }
    for (const filename of extension.drifted_migrations) {
      findings.push({
        code: "extension_migration_checksum_drift",
        severity: "blocker",
        subject: `extension/${extension.extension_id}`,
        detail: filename,
        recommendation: "restore the original migration file or create a new migration",
        repair_route: "extension repair",
      });
    }
    for (const filename of extension.unknown_migrations) {
      findings.push({
        code: "extension_migration_unknown",
        severity: "attention",
        subject: `extension/${extension.extension_id}`,
        detail: filename,
        recommendation: "compare installed extension with canonical source and classify history",
        repair_route: "manual review or reinstall",
      });
    }
  }
  return findings;
}

/** The catalog read `probeModelPins` needs. DS5 replay only until DS8. */
export interface ModelCatalogProvider {
  listAvailableModels(): Promise<Set<string>>;
}

/** A DS5-substrate replay catalog: the fixture IS the answer. */
export class ReplayModelCatalogProvider implements ModelCatalogProvider {
  private readonly models: Set<string>;

  constructor(models: Iterable<string>) {
    this.models = new Set(models);
  }

  async listAvailableModels(): Promise<Set<string>> {
    return this.models;
  }
}

/**
 * Port of `probe_model_pins`. OpenRouter's `/models` lists completion models
 * only, so the extraction pin is catalog-verifiable while the embedding pin is
 * not -- checking the embedding pin against this catalog would be a false
 * positive, and an embedding failure surfaces through degraded search instead.
 *
 * Any inability to read the catalog is INCONCLUSIVE and yields no findings, so
 * diagnose stays green offline and only a confirmed-missing pin warns. With no
 * provider this is always the case: TS3 has no live catalog client, matching
 * the oracle's behavior without a key (DS8 adds the live fetch).
 */
export async function probeModelPins(
  provider: ModelCatalogProvider | null,
  extractionModel: string,
): Promise<DriftFinding[]> {
  if (provider === null) return [];
  let available: Set<string>;
  try {
    available = await provider.listAvailableModels();
  } catch {
    return [];
  }
  if (available.has(extractionModel)) return [];
  return [
    {
      code: "model_pin_unresolved",
      severity: "attention",
      subject: "model pin",
      detail: `${extractionModel} is not available on OpenRouter`,
      recommendation:
        "set MEMORY_EXTRACTION_MODEL to a current model id (see https://openrouter.ai/models)",
      repair_route: "repoint model pin",
    },
  ];
}

/** Port of `render_runtime_diagnosis`. */
export function renderRuntimeDiagnosis(findings: readonly DriftFinding[]): string {
  const lines: string[] = ["Mirror runtime drift diagnosis", ""];
  if (findings.length === 0) {
    lines.push("Findings: 0", "", "Status: ready");
    return `${lines.join("\n")}\n`;
  }
  lines.push(`Findings: ${findings.length} attention needed`);
  for (const finding of findings) {
    lines.push("");
    lines.push(`[${finding.severity}] ${finding.code}: ${finding.detail}`);
    lines.push(`Subject: ${finding.subject}`);
    lines.push(`Recommendation: ${finding.recommendation}`);
    lines.push(`Repair route: ${finding.repair_route}`);
  }
  lines.push("", "Status: attention needed");
  return `${lines.join("\n")}\n`;
}
