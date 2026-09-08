// Read side of the extension SQL migration runner (CV22.DS7.TS3 plateau 3a).
// Port of the read half of `src/memory/extensions/migrations.py`.
//
// `runtime status` and `runtime diagnose` need to answer one question per
// installed command-skill: are this extension's migration files pending,
// drifted, or clean? That is `inspect_migration_files`, the read-only
// companion to `run_migrations`. Only the read half is ported here.
//
// The WRITE half (`run_migrations`, `_split_statements`,
// `_extract_table_targets`, `_validate_prefix`) is deliberately absent. It
// belongs to the extension catalog, which the plan assigns to CV22.DS7.TS4;
// this module is placed where TS4 extends it rather than moves it.
//
// The checksum contract (docs/product/extensions/migrations.md): two files
// differing only in comments or whitespace hash the same; any structural
// difference, string literals included, does not. Both cores must agree
// exactly, or one of them cries drift on a file the other calls clean.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "#db/database.ts";
import { PYTHON_WHITESPACE_CLASS, pyStrip, sortByCodePoint } from "#util/pythonText.ts";
import { ExtensionMigrationError } from "./errors.ts";

/**
 * Port of `_FILENAME_RE`. Python's `\d` matches the whole Unicode `Nd`
 * category, not `[0-9]`, so `\p{Nd}` is the faithful class -- a filename
 * numbered with Arabic-Indic digits is accepted by both cores or by neither.
 */
const FILENAME_RE = /^\p{Nd}{3,}_[a-z0-9_]+\.sql$/u;

const STRIP_COMMENTS_RE = /--[^\n]*|\/\*[\s\S]*?\*\//g;
const COLLAPSE_WHITESPACE_RE = new RegExp(`[${PYTHON_WHITESPACE_CLASS}]+`, "gu");
const TRIM_AROUND_PUNCT_RE = new RegExp(
  `[${PYTHON_WHITESPACE_CLASS}]*([(),;])[${PYTHON_WHITESPACE_CLASS}]*`,
  "gu",
);

/** Port of `table_prefix_for`: the `ext_<id>_` namespace an extension owns. */
export function tablePrefixFor(extensionId: string): string {
  return `ext_${extensionId.replaceAll("-", "_")}_`;
}

/**
 * Port of `_normalise_for_checksum`: drop comments, collapse whitespace runs,
 * and close the gaps around `(),;` so the same statement reformatted across
 * indented lines hashes identically. String literals survive -- an `INSERT`
 * value is real SQL content, and editing one must trip the drift guard.
 */
export function normaliseForChecksum(sql: string): string {
  const withoutComments = sql.replace(STRIP_COMMENTS_RE, "");
  const collapsed = withoutComments.replace(COLLAPSE_WHITESPACE_RE, " ");
  return pyStrip(collapsed.replace(TRIM_AROUND_PUNCT_RE, "$1"));
}

/** Port of `_checksum`: SHA-256 over the normalised SQL. */
export function checksum(content: string): string {
  return createHash("sha256").update(normaliseForChecksum(content), "utf8").digest("hex");
}

/**
 * Port of `_raw_checksum`: SHA-256 over the bytes as written. Backwards
 * compatibility only -- rows recorded before CV14.E2.S3 carry this hash, and
 * matching it keeps existing installs from reporting drift on a file nobody
 * touched.
 */
export function rawChecksum(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Port of `_list_migration_files`. Non-`.sql` entries are skipped in silence;
 * a `.sql` file that breaks the naming contract raises, because a migration
 * the runner cannot order is a defect, not a file to ignore.
 */
export function listMigrationFiles(migrationsDir: string, extensionId: string): string[] {
  if (!existsSync(migrationsDir)) return [];
  const names = sortByCodePoint(readdirSync(migrationsDir));
  const files: string[] = [];
  for (const name of names) {
    const full = join(migrationsDir, name);
    if (!statSync(full).isFile()) continue;
    // `Path.suffix` is empty for a dotfile with no other dot, so `.sql`
    // itself is not a `.sql` file to either core.
    const dot = name.lastIndexOf(".");
    if (dot <= 0 || name.slice(dot) !== ".sql") continue;
    if (!FILENAME_RE.test(name)) {
      throw new ExtensionMigrationError(
        `invalid migration filename: ${name} (expected ^[0-9]{3,}_[a-z0-9_]+\\.sql$)`,
        extensionId,
      );
    }
    files.push(name);
  }
  return files;
}

/** What `inspect_migration_files` returns: two ordered filename lists. */
export interface MigrationInspection {
  pending: string[];
  drifted: string[];
}

/**
 * Port of `inspect_migration_files`: which files have never been applied, and
 * which were applied and have since changed. Never writes bookkeeping and
 * never runs a statement out of a migration file.
 */
export function inspectMigrationFiles(
  db: Database,
  extensionId: string,
  migrationsDir: string,
): MigrationInspection {
  const files = listMigrationFiles(migrationsDir, extensionId);
  const applied = db.prepare(
    "SELECT checksum FROM _ext_migrations WHERE extension_id = ? AND filename = ?",
  );
  const pending: string[] = [];
  const drifted: string[] = [];
  for (const name of files) {
    const content = readFileSync(join(migrationsDir, name), "utf8");
    const row = applied.get(extensionId, name);
    if (row === undefined) {
      pending.push(name);
      continue;
    }
    const recorded = row.checksum as string;
    if (recorded === checksum(content) || recorded === rawChecksum(content)) continue;
    drifted.push(name);
  }
  return { pending, drifted };
}
