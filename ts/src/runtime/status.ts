// `runtime status` (CV22.DS7.TS3 plateau 3a). Port of the status half of
// `src/memory/cli/runtime.py`.
//
// The story's reason lives in `inspectCoreMigrations`. Python grades the
// database's `_migrations` ledger against ITS OWN migration list, so since
// CV22.DS6.US2 -- when TypeScript authored `017_journey_parent_column`, the
// first migration with no Python counterpart -- Python's `runtime diagnose`
// has flagged `core_migration_unknown` on every install that ever ran the TS
// engine. The schema authority moved to TypeScript in DS6; the grader follows
// it here, and the false alarm goes away.
//
// The grading rule is `assertSchemaState`'s, not a second one invented for
// diagnostics (see `inspectCoreMigrations`).
//
// NOT ported: `_runtime_status_blockers`. Its only caller is
// `render_runtime_update_dry_run`, which belongs to the git-based updater that
// the 2026-09-07 decision assigned to CV22.DS10.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Database, openDatabaseReadOnly } from "#db/database.ts";
import { KNOWN_MIGRATION_IDS, TS_AUTHORED_MIGRATION_IDS } from "#db/schemaState.ts";
import { ExtensionError } from "#extensions/errors.ts";
import { loadExtensionManifest } from "#extensions/manifest.ts";
import { inspectMigrationFiles } from "#extensions/migrations.ts";
import { type DbPathEnv, dbNameForEnv, resolveMirrorHome } from "#frontDoor/dbPath.ts";
import { DEFAULT_EMBEDDING_MODEL, DEFAULT_EXTRACTION_MODEL } from "#providers/config.ts";
import { sortByCodePoint } from "#util/pythonText.ts";
import type { MarkerValue } from "./git.ts";
import { type GitStatus, inspectCloneRole, inspectGit, inspectUpdateChannel } from "./git.ts";

const PYTHON_PROBE_TIMEOUT_MS = 30_000;

export interface CoreMigrationHealth {
  ready: boolean;
  applied_count: number | null;
  known_count: number;
  missing: string[];
  unknown: string[];
  note: string | null;
}

export interface ExtensionHealth {
  extension_id: string;
  ready: boolean;
  note: string | null;
  pending_migrations: string[];
  drifted_migrations: string[];
  unknown_migrations: string[];
}

export interface RuntimeStatusReport {
  version: string;
  git: GitStatus;
  mirror_home: string | null;
  mirror_home_error: string | null;
  db_path: string | null;
  db_exists: boolean | null;
  core_migrations: CoreMigrationHealth;
  extensions: string[];
  extension_health: ExtensionHealth[];
  clone_role: MarkerValue;
  python_version: string;
  memory_env: string;
  update_channel: MarkerValue;
  node_version: string | null;
}

function health(fields: Partial<CoreMigrationHealth>): CoreMigrationHealth {
  return {
    ready: false,
    applied_count: null,
    known_count: 0,
    missing: [],
    unknown: [],
    note: null,
    ...fields,
  };
}

/**
 * Open the database for inspection without touching it. Read-only is not a
 * preference here: a `diagnose` that migrates the database it is diagnosing
 * would report a state it created, so this path must never bootstrap, migrate,
 * or write.
 */
function connectReadOnly(dbPath: string): Database {
  return openDatabaseReadOnly(dbPath);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Port of `inspect_core_migrations`, graded against the TypeScript manifest.
 *
 * Two rules, both borrowed from `assertSchemaState` so the codebase keeps ONE
 * definition of a healthy ledger:
 *
 * - UNKNOWN is judged against the full `KNOWN_MIGRATION_IDS`, which includes
 *   the TS-authored ids. This is the intended divergence: a database carrying
 *   `017_journey_parent_column` is clean to TypeScript and "unknown" to Python.
 * - MISSING tolerates a TS-authored migration that has not been applied yet,
 *   exactly as `assertSchemaState` does, and `known_count` counts only what is
 *   required of THIS database. Without that, every database not yet opened by
 *   the TS engine would render `16/17 applied; missing 017...` -- a brand new
 *   false alarm to replace the one this story removes.
 *
 * Net effect: a Python-only database renders identically to Python
 * (`current (16/16)`), and a TS-migrated one renders `current (17/17)` where
 * Python cries `unknown`.
 */
export function inspectCoreMigrations(
  dbPath: string | null,
  dbExists: boolean | null,
): CoreMigrationHealth {
  const knownIds = KNOWN_MIGRATION_IDS;
  // With no ledger to read, "required" cannot be computed from what the
  // database carries, so it falls back to the migrations every database must
  // have -- the Python set. Counting all 17 here would report `unknown/17` on
  // a missing database where the oracle says `unknown/16`, inventing a
  // difference in the one branch that has nothing to disagree about.
  const requiredIds = knownIds.filter((id) => !TS_AUTHORED_MIGRATION_IDS.has(id));
  if (dbPath === null) {
    return health({ known_count: requiredIds.length, note: "database path unknown" });
  }
  if (dbExists !== true) {
    return health({ known_count: requiredIds.length, note: "database missing" });
  }

  let rows: string[];
  let db: Database | null = null;
  try {
    db = connectReadOnly(dbPath);
    const present = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?");
    if (present.get("_migrations") === undefined) {
      return health({
        applied_count: 0,
        known_count: requiredIds.length,
        missing: [...requiredIds],
        note: "migration ledger missing",
      });
    }
    rows = (db.prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
      (row) => row.id,
    );
  } catch (error) {
    return health({
      known_count: requiredIds.length,
      missing: [...requiredIds],
      note: errorMessage(error),
    });
  } finally {
    db?.close();
  }

  const applied = new Set(rows);
  const missing = knownIds.filter((id) => !applied.has(id) && !TS_AUTHORED_MIGRATION_IDS.has(id));
  // Required = every Python migration, plus the TS-authored ones this database
  // already carries. See the rule note above.
  const requiredCount = knownIds.filter(
    (id) => !TS_AUTHORED_MIGRATION_IDS.has(id) || applied.has(id),
  ).length;
  const knownSet = new Set(knownIds);
  const unknown = sortByCodePoint(rows.filter((id) => !knownSet.has(id)));
  const appliedKnown = knownIds.filter((id) => applied.has(id)).length;

  return {
    ready: missing.length === 0 && unknown.length === 0,
    applied_count: appliedKnown,
    known_count: requiredCount,
    missing,
    unknown,
    note: null,
  };
}

/** Python `default_extensions_dir_for_home`. */
export function extensionsDirForHome(mirrorHome: string): string {
  return join(mirrorHome, "extensions");
}

function extensionDirectories(mirrorHome: string | null): string[] {
  if (mirrorHome === null) return [];
  const dir = extensionsDirForHome(mirrorHome);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return sortByCodePoint(readdirSync(dir)).filter((name) => {
    const child = join(dir, name);
    return statSync(child).isDirectory() && existsSync(join(child, "skill.yaml"));
  });
}

/** Port of `list_installed_extensions`: directory names, not manifest ids. */
export function listInstalledExtensions(mirrorHome: string | null): string[] {
  return extensionDirectories(mirrorHome);
}

/**
 * Port of `inspect_extension_health`. Only `command-skill` extensions own
 * tables, so only they are graded against `_ext_migrations`; a prompt-skill is
 * healthy once its manifest validates.
 */
export function inspectExtensionHealth(
  mirrorHome: string | null,
  dbPath: string | null,
  dbExists: boolean | null,
): ExtensionHealth[] {
  const names = extensionDirectories(mirrorHome);
  if (mirrorHome === null || names.length === 0) return [];
  const extensionsDir = extensionsDirForHome(mirrorHome);

  const results: ExtensionHealth[] = [];
  let db: Database | null = null;
  if (dbPath !== null && dbExists === true) {
    try {
      db = connectReadOnly(dbPath);
    } catch {
      db = null;
    }
  }

  const row = (extensionId: string, fields: Partial<ExtensionHealth>): ExtensionHealth => ({
    extension_id: extensionId,
    ready: false,
    note: null,
    pending_migrations: [],
    drifted_migrations: [],
    unknown_migrations: [],
    ...fields,
  });

  try {
    for (const name of names) {
      const child = join(extensionsDir, name);
      // The oracle attributes a manifest failure to the DIRECTORY name,
      // because the declared id is exactly what it could not read.
      let extensionId = name;
      let kind: string;
      try {
        const manifest = loadExtensionManifest(child);
        extensionId = manifest.id;
        kind = manifest.kind;
      } catch (error) {
        if (!(error instanceof ExtensionError)) throw error;
        results.push(row(extensionId, { note: error.message }));
        continue;
      }

      if (kind !== "command-skill") {
        results.push(row(extensionId, { ready: true }));
        continue;
      }
      if (db === null) {
        results.push(row(extensionId, { note: "database unavailable" }));
        continue;
      }

      const migrationsDir = join(child, "migrations");
      let hasLedger: boolean;
      try {
        hasLedger =
          db
            .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
            .get("_ext_migrations") !== undefined;
      } catch (error) {
        results.push(row(extensionId, { note: `database unavailable: ${errorMessage(error)}` }));
        continue;
      }
      if (!hasLedger) {
        const hasMigrations =
          existsSync(migrationsDir) &&
          readdirSync(migrationsDir).some((file) => file.endsWith(".sql"));
        results.push(
          row(extensionId, {
            ready: !hasMigrations,
            note: hasMigrations ? "extension migration ledger missing" : null,
          }),
        );
        continue;
      }

      let pending: string[];
      let drifted: string[];
      let unknown: string[];
      try {
        ({ pending, drifted } = inspectMigrationFiles(db, extensionId, migrationsDir));
        const known = new Set(
          existsSync(migrationsDir)
            ? readdirSync(migrationsDir).filter((file) =>
                statSync(join(migrationsDir, file)).isFile(),
              )
            : [],
        );
        const applied = db
          .prepare("SELECT filename FROM _ext_migrations WHERE extension_id = ?")
          .all(extensionId) as { filename: string }[];
        unknown = sortByCodePoint(
          applied.map((entry) => String(entry.filename)).filter((file) => !known.has(file)),
        );
      } catch (error) {
        if (!(error instanceof ExtensionError)) throw error;
        results.push(row(extensionId, { note: error.message }));
        continue;
      }

      // Note assembly is order-sensitive: the oracle appends in exactly this
      // sequence and joins with `; `.
      let note: string | null = null;
      if (pending.length > 0) note = "pending migrations";
      if (drifted.length > 0) {
        note = note === null ? "migration checksum drift" : `${note}; checksum drift`;
      }
      if (unknown.length > 0) {
        note = note === null ? "unknown applied migrations" : `${note}; unknown applied`;
      }
      results.push(
        row(extensionId, {
          ready: pending.length === 0 && drifted.length === 0 && unknown.length === 0,
          note,
          pending_migrations: pending,
          drifted_migrations: drifted,
          unknown_migrations: unknown,
        }),
      );
    }
  } finally {
    db?.close();
  }
  return results;
}

/**
 * The Node version, read from the running process rather than from `node` on
 * PATH (Navigator decision, 2026-09-08). The oracle spawns `node --version`
 * because it has no other way to ask; TypeScript IS the Node runtime the line
 * exists to diagnose -- the docstring says so -- and `process.version` is both
 * free and correct. The two disagree only when PATH's node is not the node
 * running the front door, and in that case the oracle is the one that is wrong.
 */
export function detectNodeVersion(): string | null {
  return process.version.replace(/^v/, "") || null;
}

/**
 * The Python version, by spawning the interpreter the front door itself falls
 * back to (Navigator decision, 2026-09-08, option 1a). Python reads
 * `sys.version` in-process; TypeScript has no such interpreter, and while
 * Python still answers routed commands this line carries real information
 * about the runtime that would serve them. Bounded, off the hot path (never
 * the per-turn status line), and deleted with Python in DS10.
 *
 * `unknown` is unreachable for the oracle, so it is not a parity break on any
 * scenario Python can produce -- only a truthful answer where it has none.
 */
export function detectPythonVersion(cwd: string): string {
  const result = spawnSync(
    "uv",
    ["run", "python", "-c", "import sys; print(sys.version.split()[0])"],
    { cwd, encoding: "utf8", timeout: PYTHON_PROBE_TIMEOUT_MS, shell: false },
  );
  if (result.error || result.status !== 0) return "unknown";
  return (result.stdout ?? "").trim() || "unknown";
}

export interface BuildStatusOptions {
  start?: string;
  mirrorHome?: string | null;
  channel?: string | null;
  env?: DbPathEnv & NodeJS.ProcessEnv;
  /** Test/golden seam: the oracle pins `package_version()` the same way. */
  version?: string;
  pythonVersion?: string;
  nodeVersion?: string | null;
}

/**
 * Python's `resolve_mirror_home` raises `ValueError`, and
 * `build_runtime_status` prints `str(exc)` as `Mirror home note:`. The front
 * door's own resolver adds a MEMORY_DIR/DB_PATH hint that is right for a
 * front-door failure and wrong for this report, which is graded against the
 * oracle -- so the not-configured sentence is restated in the oracle's words.
 * The conflict sentence already matches byte-for-byte.
 */
function mirrorHomeForStatus(env: DbPathEnv): { home: string | null; error: string | null } {
  try {
    return { home: resolveMirrorHome(env), error: null };
  } catch (error) {
    const message = errorMessage(error);
    if (message.startsWith("Mirror home is not configured")) {
      return {
        home: null,
        error: "Mirror home is not configured. Set MIRROR_HOME or MIRROR_USER.",
      };
    }
    return { home: null, error: message };
  }
}

/** Port of `build_runtime_status`. */
export function buildRuntimeStatus(options: BuildStatusOptions = {}): RuntimeStatusReport {
  const startPath = resolve(options.start ?? process.cwd());
  const env = options.env ?? process.env;
  const git = inspectGit(startPath);

  let mirrorHome: string | null;
  let mirrorHomeError: string | null;
  if (options.mirrorHome !== undefined && options.mirrorHome !== null) {
    const expanded = resolve(options.mirrorHome);
    mirrorHome = existsSync(expanded) ? realpathSync(expanded) : expanded;
    mirrorHomeError = null;
  } else {
    ({ home: mirrorHome, error: mirrorHomeError } = mirrorHomeForStatus(env));
  }

  const memoryEnv = env.MEMORY_ENV || "production";
  const dbPath = mirrorHome === null ? null : join(mirrorHome, dbNameForEnv(memoryEnv));
  const dbExists = dbPath === null ? null : existsSync(dbPath);

  return {
    version: options.version ?? "unknown",
    git,
    mirror_home: mirrorHome,
    mirror_home_error: mirrorHomeError,
    db_path: dbPath,
    db_exists: dbExists,
    core_migrations: inspectCoreMigrations(dbPath, dbExists),
    extensions: listInstalledExtensions(mirrorHome),
    extension_health: inspectExtensionHealth(mirrorHome, dbPath, dbExists),
    clone_role: inspectCloneRole(startPath),
    python_version: options.pythonVersion ?? detectPythonVersion(startPath),
    memory_env: memoryEnv,
    update_channel: inspectUpdateChannel(startPath, options.channel ?? null),
    node_version: options.nodeVersion === undefined ? detectNodeVersion() : options.nodeVersion,
  };
}

/** Port of the `status` property: any one blocker downgrades the whole report. */
export function statusVerdict(report: RuntimeStatusReport): string {
  if (report.mirror_home_error) return "attention needed";
  if (report.git.error) return "attention needed";
  if (report.git.dirty) return "attention needed";
  if (report.db_exists === false) return "attention needed";
  if (!report.core_migrations.ready) return "attention needed";
  if (report.extension_health.some((item) => !item.ready)) return "attention needed";
  return "ready";
}

function yesNo(value: boolean | null): string {
  if (value === null) return "unknown";
  return value ? "yes" : "no";
}

/** Port of `_render_core_migrations`. */
export function renderCoreMigrations(item: CoreMigrationHealth): string {
  if (item.ready) {
    return `Core migrations: current (${item.applied_count}/${item.known_count})`;
  }
  const count = item.applied_count === null ? "unknown" : String(item.applied_count);
  let detail = `${count}/${item.known_count} applied`;
  if (item.missing.length > 0) detail = `${detail}; missing ${item.missing.join(", ")}`;
  if (item.unknown.length > 0) detail = `${detail}; unknown ${item.unknown.join(", ")}`;
  if (item.note) detail = `${detail}; ${item.note}`;
  return `Core migrations: attention needed (${detail})`;
}

/** Port of `_render_extension_health`. */
export function renderExtensionHealth(items: readonly ExtensionHealth[]): string[] {
  if (items.length === 0) return ["Extension health: ready (0 checked)"];
  const issues = items.filter((item) => !item.ready);
  if (issues.length === 0) return [`Extension health: ready (${items.length} checked)`];

  const lines = [
    `Extension health: attention needed (${items.length} checked, ${issues.length} issue(s))`,
  ];
  for (const item of issues) {
    const details: string[] = [];
    if (item.note) details.push(item.note);
    if (item.pending_migrations.length > 0) {
      details.push(`pending ${item.pending_migrations.join(", ")}`);
    }
    if (item.drifted_migrations.length > 0) {
      details.push(`drifted ${item.drifted_migrations.join(", ")}`);
    }
    if (item.unknown_migrations.length > 0) {
      details.push(`unknown ${item.unknown_migrations.join(", ")}`);
    }
    lines.push(
      `  - ${item.extension_id}: ${details.length > 0 ? details.join("; ") : "attention needed"}`,
    );
  }
  return lines;
}

/** Python's `f"{value:g}"` for the LLM timeout floats: `10.0` renders as `10`. */
function formatG(value: number): string {
  return String(Number.parseFloat(value.toPrecision(6)));
}

function floatEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function intEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/** Port of `render_runtime_status`. */
export function renderRuntimeStatus(
  report: RuntimeStatusReport,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const lines: string[] = ["Mirror runtime status", ""];
  lines.push(`Version: ${report.version}`);
  lines.push(`Repository: ${report.git.repository ?? "unknown"}`);
  lines.push(`Git branch: ${report.git.branch || "unknown"}`);
  lines.push(`Git commit: ${report.git.commit || "unknown"}`);
  lines.push(`Git dirty: ${yesNo(report.git.dirty)}`);
  if (report.git.error) lines.push(`Git status note: ${report.git.error}`);
  lines.push(`Mirror home: ${report.mirror_home ? report.mirror_home : "not configured"}`);
  if (report.mirror_home_error) lines.push(`Mirror home note: ${report.mirror_home_error}`);
  lines.push(`Database: ${report.db_path ? report.db_path : "unknown"}`);
  lines.push(`Database exists: ${yesNo(report.db_exists)}`);
  lines.push(renderCoreMigrations(report.core_migrations));
  if (report.extensions.length > 0) {
    lines.push(
      `Installed extensions: ${report.extensions.length} (${report.extensions.join(", ")})`,
    );
  } else {
    lines.push("Installed extensions: 0");
  }
  lines.push(...renderExtensionHealth(report.extension_health));
  lines.push(`Clone role: ${report.clone_role.value}`);
  if (report.clone_role.note) lines.push(`Clone role note: ${report.clone_role.note}`);
  lines.push(`Update channel: ${report.update_channel.value}`);
  if (report.update_channel.note) lines.push(`Update channel note: ${report.update_channel.note}`);
  lines.push(`Python: ${report.python_version}`);
  lines.push(`Node: ${report.node_version || "not found (TS front door requires Node >= 24)"}`);
  lines.push(`MEMORY_ENV: ${report.memory_env}`);
  const reception = floatEnv(env.MEMORY_LLM_TIMEOUT_RECEPTION, 10);
  const embedding = floatEnv(env.MEMORY_LLM_TIMEOUT_EMBEDDING, 15);
  const extraction = floatEnv(env.MEMORY_LLM_TIMEOUT_EXTRACTION, 60);
  const retries = intEnv(env.MEMORY_LLM_MAX_RETRIES, 2);
  lines.push(
    `LLM timeouts (s): reception=${formatG(reception)}, ` +
      `embedding=${formatG(embedding)}, extraction=${formatG(extraction)}; retries=${retries}`,
  );
  lines.push(
    `Models: extraction=${env.MEMORY_EXTRACTION_MODEL ?? DEFAULT_EXTRACTION_MODEL}, ` +
      `embedding=${env.MEMORY_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL}`,
  );
  lines.push("");
  lines.push(`Status: ${statusVerdict(report)}`);
  return `${lines.join("\n")}\n`;
}
