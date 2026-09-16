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
import type { Database, WritableDatabase } from "#db/database.ts";
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

// --- the WRITE half (CV22.DS7.TS4 plateau 3) ----------------------------------
//
// TS3 ported the read half and said: "The WRITE half (`run_migrations`,
// `_split_statements`, `_extract_table_targets`, `_validate_prefix`) is
// deliberately absent. It belongs to the extension catalog, which the plan
// assigns to CV22.DS7.TS4; this module is placed where TS4 extends it rather
// than moves it." This is that extension.

const DDL_TABLE_RE = new RegExp(
  "\\b(?:" +
    "CREATE\\s+(?:VIRTUAL\\s+)?TABLE|" +
    "ALTER\\s+TABLE|" +
    "DROP\\s+TABLE|" +
    "INSERT\\s+(?:OR\\s+\\w+\\s+)?INTO|" +
    "UPDATE|" +
    "DELETE\\s+FROM" +
    ")" +
    '\\s+(?:IF\\s+(?:NOT\\s+)?EXISTS\\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?',
  "gi",
);

const INDEX_TABLE_RE = new RegExp(
  "\\bCREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+" +
    "(?:IF\\s+NOT\\s+EXISTS\\s+)?" +
    '(?:"?[A-Za-z_][A-Za-z0-9_]*"?\\s+)?' +
    'ON\\s+"?([A-Za-z_][A-Za-z0-9_]*)"?',
  "gi",
);

const STRIP_STRINGS_RE = /'(?:[^']|'')*'/g;

/** Port of `_strip_noise`: comments out, string literals flattened to `''`. */
function stripNoise(sql: string): string {
  return sql.replace(STRIP_COMMENTS_RE, "").replace(STRIP_STRINGS_RE, "''");
}

/**
 * Port of `_split_statements`.
 *
 * Written as a character walk, exactly as Python's is, because the shape of
 * the bug it prevents is structural: `executescript` commits any open
 * transaction, so the runner splits the script itself and feeds statements
 * through one explicit savepoint. A regex split on `;` would cut inside a
 * string literal -- the database-architect's plan-stage dissent, and the
 * reason the corpus stages `INSERT ... VALUES ('a;b')` and `'it''s'`.
 *
 * Compound statements (`BEGIN ... END`) are NOT supported, in either core.
 */
export function splitStatements(sql: string): string[] {
  const characters = Array.from(sql);
  const statements: string[] = [];
  let buffer = "";
  let index = 0;
  while (index < characters.length) {
    const character = characters[index] as string;
    if (character === "-" && characters[index + 1] === "-") {
      const end = characters.indexOf("\n", index);
      index = end === -1 ? characters.length : end;
      continue;
    }
    if (character === "/" && characters[index + 1] === "*") {
      const end = sqlIndexOf(characters, "*/", index + 2);
      index = end === -1 ? characters.length : end + 2;
      continue;
    }
    if (character === "'") {
      buffer += character;
      index += 1;
      while (index < characters.length) {
        const inner = characters[index] as string;
        buffer += inner;
        if (inner === "'") {
          if (characters[index + 1] === "'") {
            buffer += characters[index + 1];
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    if (character === ";") {
      const statement = pyStrip(buffer);
      if (statement) statements.push(statement);
      buffer = "";
      index += 1;
      continue;
    }
    buffer += character;
    index += 1;
  }
  const tail = pyStrip(buffer);
  if (tail) statements.push(tail);
  return statements;
}

/** `str.find(needle, start)` over a code-point array. */
function sqlIndexOf(characters: readonly string[], needle: string, start: number): number {
  const parts = Array.from(needle);
  for (let index = start; index + parts.length <= characters.length; index += 1) {
    if (parts.every((part, offset) => characters[index + offset] === part)) return index;
  }
  return -1;
}

/** Port of `_extract_table_targets`: every table a statement reads or writes. */
export function extractTableTargets(sql: string): string[] {
  const cleaned = stripNoise(sql);
  const tables: string[] = [];
  for (const match of cleaned.matchAll(DDL_TABLE_RE))
    tables.push((match[1] as string).toLowerCase());
  for (const match of cleaned.matchAll(INDEX_TABLE_RE)) {
    tables.push((match[1] as string).toLowerCase());
  }
  return tables;
}

/** Port of `_validate_prefix`: an extension may only touch its own namespace. */
export function validatePrefix(content: string, extensionId: string, filename: string): void {
  const prefix = tablePrefixFor(extensionId);
  for (const table of extractTableTargets(content)) {
    if (!table.startsWith(prefix)) {
      throw new ExtensionMigrationError(
        `${filename} targets table '${table}' outside the required prefix '${prefix}*'`,
        extensionId,
      );
    }
  }
}

export interface RunMigrationsDeps {
  /** Python's `_now()`: `datetime.now(timezone.utc).isoformat()`. */
  readonly nowIso: () => string;
}

/**
 * Port of `run_migrations`. Returns the number of newly applied files.
 *
 * Atomicity is a SAVEPOINT, not a transaction, and that is deliberate in both
 * cores: SQLite implicitly commits an open deferred transaction before DDL, so
 * `BEGIN`/`ROLLBACK` would not undo a half-applied `CREATE TABLE`. A savepoint
 * does, bookkeeping row included.
 */
export function runMigrations(
  db: WritableDatabase,
  extensionId: string,
  migrationsDir: string,
  deps: RunMigrationsDeps,
): number {
  const files = listMigrationFiles(migrationsDir, extensionId);
  let applied = 0;
  for (const name of files) {
    const content = readFileSync(join(migrationsDir, name), "utf8");
    const current = checksum(content);
    const row = db
      .prepare("SELECT checksum FROM _ext_migrations WHERE extension_id = ? AND filename = ?")
      .get(extensionId, name);

    if (row !== undefined) {
      const recorded = row.checksum as string;
      if (recorded === current) continue;
      if (recorded === rawChecksum(content)) {
        // A pre-CV14.E2.S3 row that still matches the file as written: upgrade
        // the stored hash so the next run takes the fast path.
        db.prepare(
          "UPDATE _ext_migrations SET checksum = ? WHERE extension_id = ? AND filename = ?",
        ).run(current, extensionId, name);
        continue;
      }
      throw new ExtensionMigrationError(
        `${name} has been edited since it was applied ` +
          `(recorded checksum ${recorded.slice(0, 8)}..., ` +
          `current checksum ${current.slice(0, 8)}...); never edit an ` +
          "applied migration in ways that change its SQL semantics " +
          "— comment and whitespace edits are tolerated, but a " +
          "structural change requires a new migration file",
        extensionId,
      );
    }

    validatePrefix(content, extensionId, name);

    const savepoint = `ext_migration_${extensionId.replaceAll("-", "_")}`;
    db.exec(`SAVEPOINT ${savepoint}`);
    try {
      for (const statement of splitStatements(content)) db.exec(statement);
      db.prepare(
        "INSERT INTO _ext_migrations (extension_id, filename, checksum, applied_at) " +
          "VALUES (?, ?, ?, ?)",
      ).run(extensionId, name, current, deps.nowIso());
    } catch (error) {
      db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      db.exec(`RELEASE SAVEPOINT ${savepoint}`);
      throw new ExtensionMigrationError(
        `${name} failed to apply: ${sqliteMessage(error)}`,
        extensionId,
      );
    }
    db.exec(`RELEASE SAVEPOINT ${savepoint}`);
    applied += 1;
  }
  return applied;
}

/**
 * Python renders `sqlite3.Error` as its message alone. `node:sqlite` prefixes
 * its own errors differently, so the text after `failed to apply:` is a
 * RECORDED DIVERGENCE: the golden pins the stable prefix and the exit code,
 * never the driver's sentence.
 */
function sqliteMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
