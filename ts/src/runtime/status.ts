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

import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { type Database, openDatabaseReadOnly } from "#db/database.ts";
import { KNOWN_MIGRATION_IDS } from "#db/schemaState.ts";
import { ExtensionError } from "#extensions/errors.ts";
import { readExtensionPlugin } from "#extensions/extensionPlugin.ts";
import { loadExtensionManifest } from "#extensions/manifest.ts";
import { inspectMigrationFiles } from "#extensions/migrations.ts";
import { type DbPathEnv, dbNameForEnv, resolveMirrorHome } from "#frontDoor/dbPath.ts";
import {
  DEFAULT_EMBEDDING_MODEL,
  hasOpenRouterKey,
  resolveExtractionReasoning,
} from "#providers/config.ts";
import { sortByCodePoint } from "#util/pythonText.ts";
import { channelForReport } from "./channel.ts";
import type { MarkerValue } from "./git.ts";
import {
  cloneRoleFor,
  type GitStatus,
  inspectGitFor,
  renderCloneRoleLines,
  renderRepositoryLines,
} from "./git.ts";
import {
  detectInstallKind,
  type InstallKind,
  inspectionRootFor,
  renderInstallLines,
  thisFrontDoorPath,
} from "./installKind.ts";

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

export interface ExtensionPluginSummary {
  name: string;
  version: string;
  skills: number;
}

export interface RuntimeStatusReport {
  version: string;
  /** How the running front door is installed (CV22.DS10.US3 plateau 4; US2 D3). */
  install: InstallKind;
  git: GitStatus;
  mirror_home: string | null;
  mirror_home_error: string | null;
  db_path: string | null;
  db_exists: boolean | null;
  core_migrations: CoreMigrationHealth;
  extensions: string[];
  extension_health: ExtensionHealth[];
  /** The home's generated extensions plugin (CV21.DS5.US2), or null when none. */
  extension_plugin: ExtensionPluginSummary | null;
  clone_role: MarkerValue;
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
 * One rule, `assertSchemaState`'s, so the codebase keeps ONE definition of a
 * healthy ledger: every id in `KNOWN_MIGRATION_IDS` is required, and an id
 * outside it is unknown. A current database renders `current (18/18)` (CV9.DS8.US5's
 * 018 is the eighteenth; the history below is TS5's).
 *
 * Until CV22.DS10.TS5 this grader kept a second rule for one migration.
 * `017_journey_parent_column` is the first one TypeScript authored, and the
 * Python oracle graded ledgers against its own sixteen, so a database carrying
 * 017 was "unknown" to Python (the false alarm DS6 removed here) and a database
 * without it was "current (16/16)". To keep matching that recorded answer,
 * `known_count` counted only what a given database required, and a missing
 * 017 was forgiven. With the oracle deleted there was nothing left to match:
 * the forgiveness hid a pending migration behind "ready" on exactly the
 * databases `runtime migrate` exists to bring forward. TS5 finding F19 (a
 * removal the comment here promised for plateau 3 and nobody performed) made
 * the denominator honest: every known migration, everywhere.
 */
export function inspectCoreMigrations(
  dbPath: string | null,
  dbExists: boolean | null,
): CoreMigrationHealth {
  const requiredIds = KNOWN_MIGRATION_IDS;
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
  const missing = requiredIds.filter((id) => !applied.has(id));
  const knownSet = new Set(requiredIds);
  const unknown = sortByCodePoint(rows.filter((id) => !knownSet.has(id)));
  const appliedKnown = requiredIds.filter((id) => applied.has(id)).length;

  return {
    ready: missing.length === 0 && unknown.length === 0,
    applied_count: appliedKnown,
    known_count: requiredIds.length,
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

export interface BuildStatusOptions {
  /**
   * An explicit repository to inspect. Absent, the install's own: a clone's
   * checkout, and for anything else none (CR138). It used to default to the
   * cwd, which for a skill is the person's project.
   */
  start?: string;
  mirrorHome?: string | null;
  channel?: string | null;
  env?: DbPathEnv & NodeJS.ProcessEnv;
  /** Test/golden seam: the oracle pins `package_version()` the same way. */
  version?: string;
  nodeVersion?: string | null;
  /**
   * The running front door's install, detected by the caller; the golden
   * tests pin it like `version`. Absent, it is read from this tree's own
   * front door with no npm probe (see `installKind.ts`).
   */
  install?: InstallKind;
  /**
   * The OS user's home, where the homes root and the config file are found when
   * no home is configured; `composeWelcome` takes the same seam. The golden tests
   * pin it, since the not-configured sentence names what is found there.
   */
  osHome?: string;
}

/**
 * Python's `resolve_mirror_home` raises `ValueError`, and
 * `build_runtime_status` prints `str(exc)` as `Mirror home note:`. Until CR185
 * the not-configured sentence was restated here in the oracle's shorter words;
 * it is now the front door's own, the same on every surface, saying what to
 * run and which file that writes.
 */
function mirrorHomeForStatus(
  env: DbPathEnv,
  osHome: string | undefined,
): { home: string | null; error: string | null } {
  try {
    const io = osHome === undefined ? {} : { home: osHome };
    return { home: resolveMirrorHome(env, io), error: null };
  } catch (error) {
    return { home: null, error: errorMessage(error) };
  }
}

/** Port of `build_runtime_status`. */
export function buildRuntimeStatus(options: BuildStatusOptions = {}): RuntimeStatusReport {
  const env = options.env ?? process.env;
  const install = options.install ?? detectInstallKind({ frontDoorPath: thisFrontDoorPath() });
  // The repository rows are the install's own, or the one `start` names; never
  // the cwd's (CR138). The git facts are a clone's: a package has no
  // repository, and grading the cwd as one read "not a git repository" as a git
  // error, said `attention needed`, and so refused every package update at the
  // gate (CV22.DS10.US3 plateau 4, found by the package lane of the update smoke).
  const root = inspectionRootFor(install, options.start);
  const git = inspectGitFor(install, root);

  let mirrorHome: string | null;
  let mirrorHomeError: string | null;
  if (options.mirrorHome !== undefined && options.mirrorHome !== null) {
    const expanded = resolve(options.mirrorHome);
    mirrorHome = existsSync(expanded) ? realpathSync(expanded) : expanded;
    mirrorHomeError = null;
  } else {
    ({ home: mirrorHome, error: mirrorHomeError } = mirrorHomeForStatus(env, options.osHome));
  }

  const memoryEnv = env.MEMORY_ENV || "production";
  const dbPath = mirrorHome === null ? null : join(mirrorHome, dbNameForEnv(memoryEnv));
  const dbExists = dbPath === null ? null : existsSync(dbPath);

  return {
    version: options.version ?? "unknown",
    install,
    git,
    mirror_home: mirrorHome,
    mirror_home_error: mirrorHomeError,
    db_path: dbPath,
    db_exists: dbExists,
    core_migrations: inspectCoreMigrations(dbPath, dbExists),
    extensions: listInstalledExtensions(mirrorHome),
    extension_health: inspectExtensionHealth(mirrorHome, dbPath, dbExists),
    extension_plugin: inspectExtensionPlugin(mirrorHome),
    clone_role: cloneRoleFor(install, root),
    memory_env: memoryEnv,
    update_channel: channelForReport(install, root, env, undefined, options.channel ?? null),
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

/** The generated extensions plugin, read from its manifest; absent is null, not an error. */
export function inspectExtensionPlugin(mirrorHome: string | null): ExtensionPluginSummary | null {
  if (mirrorHome === null) return null;
  const previous = readExtensionPlugin(mirrorHome);
  if (previous === null) return null;
  return {
    name: `mirror-ext-${basename(mirrorHome)}`,
    version: `0.1.${previous.generation}`,
    skills: Object.keys(previous.files).filter((path) => path.endsWith("/SKILL.md")).length,
  };
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

/**
 * The models line's reasoning clause (CV9.DS9.TS1, US3): the effort the calls
 * send, marked `(model default)` when it is the model's rather than the setting's;
 * empty when no field is sent, so a rolled-back pin's line stays byte for byte
 * what the frozen status scenarios before US3 recorded; and an invalid setting
 * shown, never thrown, beside the model default it falls back to.
 */
function reasoningClause(env: NodeJS.ProcessEnv): string {
  const { effort, source, invalid } = resolveExtractionReasoning({ env });
  if (effort !== null && source === "setting") return `reasoning=${effort}, `;
  if (effort !== null) {
    const note = invalid === null ? "model default" : `model default, invalid setting: ${invalid}`;
    return `reasoning=${effort} (${note}), `;
  }
  if (invalid !== null) return `reasoning=invalid (${invalid}), `;
  return "";
}

/** Port of `render_runtime_status`. */
export function renderRuntimeStatus(
  report: RuntimeStatusReport,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const lines: string[] = ["Mirror runtime status", ""];
  lines.push(`Version: ${report.version}`);
  lines.push(...renderInstallLines(report.install));
  lines.push(...renderRepositoryLines(report.install, report.git, true));
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
  // Printed only when the home has one, so a report without extensions reads as before.
  if (report.extension_plugin) {
    const { name, version, skills } = report.extension_plugin;
    lines.push(`Extensions plugin: ${name} ${version} (${skills} skill${skills === 1 ? "" : "s"})`);
  }
  lines.push(...renderCloneRoleLines(report.install, report.clone_role));
  lines.push(`Update channel: ${report.update_channel.value}`);
  if (report.update_channel.note) lines.push(`Update channel note: ${report.update_channel.note}`);
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
    `Models: extraction=${resolveExtractionReasoning({ env }).model}, ` +
      reasoningClause(env) +
      `embedding=${env.MEMORY_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL}`,
  );
  // CR187: whether those models can be called at all. Presence only, by the
  // predicate every refusal uses; never the value, and never the verdict -- the
  // update gate reads the verdict, and a keyless install must still update.
  lines.push(`OpenRouter key: ${hasOpenRouterKey(env) ? "configured" : "not configured"}`);
  lines.push("");
  lines.push(`Status: ${statusVerdict(report)}`);
  return `${lines.join("\n")}\n`;
}
