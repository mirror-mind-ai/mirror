// Canonical, cross-language schema inventory for the TS custody-transfer
// contract (CV22.DS6.TS1).
//
// Independent TypeScript implementation of `src/memory/db/schema_inventory.py`
// — see that module's docstring for the full contract: why parity is proven
// structurally (not by comparing raw `sqlite_master.sql` text, since CV0
// rewrites DDL comments to English while the frozen Python DDL keeps its
// historical mixed-language comments), and why FTS5-internal shadow tables
// (`<virtual-table>_data`/`_idx`/`_docsize`/`_config`/`_content`) are excluded
// (their internal shape is a SQLite-library-version implementation detail,
// not part of our DDL contract).
//
// The two implementations must produce byte-identical canonical output for
// equivalent schemas: `schemaInventorySnapshot.ts` is a snapshot committed
// from the Python side, and `schema.test.ts` asserts a TS-created database's
// inventory (via this module) equals it.

import type { Database } from "./database.ts";

export interface ColumnInventory {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export interface ForeignKeyInventory {
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
  match: string;
}

export interface TableInventory {
  columns: ColumnInventory[];
  foreign_keys: ForeignKeyInventory[];
  sql: string | null;
}

export interface IndexInventory {
  table: string;
  unique: number;
  columns: string[];
  sql: string | null;
}

export interface TriggerInventory {
  table: string;
  sql: string | null;
}

export interface SchemaInventory {
  tables: Record<string, TableInventory>;
  indexes: Record<string, IndexInventory>;
  triggers: Record<string, TriggerInventory>;
}

// Tables that are custody-transfer scope boundaries, not part of the TS1 DDL
// contract:
//   - `_migrations`: bookkeeping for the migration engine (CV22.DS6.TS2). A
//     fresh Python database has it (via `run_migrations`); a TS1
//     `createSchema()` fresh database intentionally does not yet.
//   - `sqlite_sequence`: SQLite's own AUTOINCREMENT bookkeeping table.
const EXCLUDED_TABLES = new Set(["_migrations", "sqlite_sequence"]);

const FTS_SHADOW_SUFFIXES = ["_data", "_idx", "_docsize", "_config", "_content"];

/**
 * Strip SQL comments and collapse whitespace, preserving string literals.
 * Also strips whitespace immediately before `,`/`)` — the shape SQLite's own
 * `ALTER TABLE ADD COLUMN` produces when it textually splices a new column
 * definition into a table's stored `CREATE TABLE` text. Must stay
 * behaviorally identical to `memory.db.schema_inventory.normalize_sql`
 * (Python) — keep the two in lockstep.
 */
export function normalizeSql(sql: string | null): string | null {
  if (sql === null) return null;
  const out: string[] = [];
  let inString = false;
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    if (inString) {
      out.push(ch);
      if (ch === "'") {
        if (i + 1 < n && sql[i + 1] === "'") {
          out.push(sql[i + 1] as string);
          i += 2;
          continue;
        }
        inString = false;
      }
      i += 1;
      continue;
    }
    if (ch === "'") {
      inString = true;
      out.push(ch);
      i += 1;
      continue;
    }
    if (ch === "-" && i + 1 < n && sql[i + 1] === "-") {
      const newline = sql.indexOf("\n", i);
      i = newline === -1 ? n : newline;
      continue;
    }
    if (ch === "/" && i + 1 < n && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    out.push(ch as string);
    i += 1;
  }
  const collapsed = out.join("").replace(/\s+/g, " ").trim();
  return collapsed.replace(/\s+([,)])/g, "$1");
}

interface SqliteMasterRow {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
}

function virtualTableNames(objects: readonly SqliteMasterRow[]): Set<string> {
  return new Set(
    objects
      .filter((row) => row.type === "table" && (row.sql ?? "").startsWith("CREATE VIRTUAL TABLE"))
      .map((row) => row.name),
  );
}

function isFtsShadowTable(name: string, virtualTables: ReadonlySet<string>): boolean {
  for (const vt of virtualTables) {
    for (const suffix of FTS_SHADOW_SUFFIXES) {
      if (name === `${vt}${suffix}`) return true;
    }
  }
  return false;
}

function tableInventory(db: Database, name: string, sql: string | null): TableInventory {
  const columns = (
    db.prepare(`PRAGMA table_info("${name}")`).all() as Record<string, unknown>[]
  ).map((row) => ({
    name: row.name as string,
    type: row.type as string,
    notnull: row.notnull as number,
    dflt_value: (row.dflt_value as string | null) ?? null,
    pk: row.pk as number,
  }));
  const foreignKeys = (
    db.prepare(`PRAGMA foreign_key_list("${name}")`).all() as Record<string, unknown>[]
  )
    .map(
      (row): ForeignKeyInventory => ({
        table: row.table as string,
        from: row.from as string,
        to: row.to as string,
        on_update: row.on_update as string,
        on_delete: row.on_delete as string,
        match: row.match as string,
      }),
    )
    .sort((a, b) =>
      a.table === b.table ? a.from.localeCompare(b.from) : a.table.localeCompare(b.table),
    );
  return { columns, foreign_keys: foreignKeys, sql: normalizeSql(sql) };
}

function indexInventory(
  db: Database,
  name: string,
  table: string,
  sql: string | null,
): IndexInventory {
  const columns = (
    db.prepare(`PRAGMA index_info("${name}")`).all() as Record<string, unknown>[]
  ).map((row) => row.name as string);
  const listRows = db.prepare(`PRAGMA index_list("${table}")`).all() as Record<string, unknown>[];
  const listRow = listRows.find((row) => row.name === name);
  const unique = listRow ? Number(listRow.unique) : 0;
  return { table, unique, columns, sql: normalizeSql(sql) };
}

/**
 * Build the canonical, cross-language schema inventory for `db`. See the
 * module comment (and the Python counterpart) for what is included/excluded
 * and why.
 */
export function buildSchemaInventory(db: Database): SchemaInventory {
  const objects = db
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table', 'index', 'trigger')",
    )
    .all() as unknown as SqliteMasterRow[];
  const virtualTables = virtualTableNames(objects);

  const tables: Record<string, TableInventory> = {};
  const indexes: Record<string, IndexInventory> = {};
  const triggers: Record<string, TriggerInventory> = {};

  for (const row of objects) {
    // An index or trigger belonging to an excluded table (e.g. the autoindex
    // SQLite creates for `_migrations`' non-INTEGER PRIMARY KEY) must not
    // dangle in the inventory once its owning table is excluded.
    if (EXCLUDED_TABLES.has(row.tbl_name)) continue;
    if (row.type === "table") {
      if (EXCLUDED_TABLES.has(row.name) || row.name.startsWith("sqlite_")) continue;
      if (isFtsShadowTable(row.name, virtualTables)) continue;
      tables[row.name] = tableInventory(db, row.name, row.sql);
    } else if (row.type === "index") {
      indexes[row.name] = indexInventory(db, row.name, row.tbl_name, row.sql);
    } else if (row.type === "trigger") {
      triggers[row.name] = { table: row.tbl_name, sql: normalizeSql(row.sql) };
    }
  }

  return { tables, indexes, triggers };
}
