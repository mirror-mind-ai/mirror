// TS ⊇ Python schema divergence — CV22.DS6.US2.
//
// Through DS6.TS1 the TS-created schema had to be structurally IDENTICAL to the
// committed Python snapshot. US2 is the first story where TS owns schema custody
// enough to author schema Python lacks: the `identity.parent_journey` column and
// its partial index. This module is the single, enumerated source of truth for
// exactly what TS adds beyond Python, so every guard (schema.test.ts,
// migrations.test.ts regression, the Navigator parity script) compares a
// TS-created inventory to the Python snapshot THROUGH it — an unexpected drift
// (anything not listed here) still fails loudly, in either direction.

import { isDeepStrictEqual } from "node:util";
import type { ColumnInventory, SchemaInventory } from "./schemaInventory.ts";

/** Columns TS adds to a Python-snapshot table, appended after its columns. */
const TS_ONLY_COLUMNS: Record<string, ColumnInventory[]> = {
  identity: [{ name: "parent_journey", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 }],
};

/** Indexes TS creates that the Python snapshot does not have. */
const TS_ONLY_INDEXES: Record<string, { table: string; unique: number; columns: string[] }> = {
  idx_identity_parent_journey: { table: "identity", unique: 0, columns: ["parent_journey"] },
};

function sortedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).sort();
}

/**
 * Return the list of structural problems in `actual` (a TS-created inventory)
 * measured against the Python `snapshot` PLUS exactly the enumerated TS-only
 * additions. Empty list == pass. Pure, so tests and the Navigator script share
 * one definition of the intended divergence.
 */
export function diffTsInventoryAgainstSnapshot(
  actual: SchemaInventory,
  snapshot: SchemaInventory,
): string[] {
  const problems: string[] = [];

  // Tables: no new/removed tables; a listed table may gain listed columns.
  if (!isDeepStrictEqual(sortedKeys(actual.tables), sortedKeys(snapshot.tables))) {
    problems.push("tables: name set differs from the Python snapshot");
  }
  for (const name of Object.keys(snapshot.tables)) {
    const actualTable = actual.tables[name];
    if (!actualTable) continue;
    const additions = TS_ONLY_COLUMNS[name] ?? [];
    const expectedColumns = [...snapshot.tables[name].columns, ...additions];
    if (!isDeepStrictEqual(actualTable.columns, expectedColumns)) {
      problems.push(`tables[${name}].columns differ from snapshot + enumerated TS-only additions`);
    }
    if (!isDeepStrictEqual(actualTable.foreign_keys, snapshot.tables[name].foreign_keys)) {
      problems.push(`tables[${name}].foreign_keys differ from snapshot`);
    }
    if (additions.length > 0) {
      // The raw CREATE TABLE text diverges by exactly these columns; assert each
      // added column name is present rather than reproduce SQLite's stored text.
      for (const column of additions) {
        if (!(actualTable.sql ?? "").includes(column.name)) {
          problems.push(`tables[${name}].sql is missing TS-only column ${column.name}`);
        }
      }
    } else if (!isDeepStrictEqual(actualTable.sql, snapshot.tables[name].sql)) {
      problems.push(`tables[${name}].sql differs from snapshot`);
    }
  }

  // Indexes: snapshot indexes exact; plus the enumerated TS-only ones whose
  // owning table is present (a TS-only index on `identity` only exists when the
  // schema/fixture actually has an `identity` table for migration 017 to alter).
  const applicableTsIndexes = Object.entries(TS_ONLY_INDEXES).filter(
    ([, spec]) => spec.table in snapshot.tables,
  );
  const expectedIndexNames = [
    ...Object.keys(snapshot.indexes),
    ...applicableTsIndexes.map(([name]) => name),
  ].sort();
  if (!isDeepStrictEqual(sortedKeys(actual.indexes), expectedIndexNames)) {
    problems.push("indexes: name set differs from snapshot + enumerated TS-only indexes");
  }
  for (const name of Object.keys(snapshot.indexes)) {
    if (actual.indexes[name] && !isDeepStrictEqual(actual.indexes[name], snapshot.indexes[name])) {
      problems.push(`indexes[${name}] differs from snapshot`);
    }
  }
  for (const [name, spec] of applicableTsIndexes) {
    const index = actual.indexes[name];
    if (!index) {
      problems.push(`missing enumerated TS-only index ${name}`);
    } else if (
      index.table !== spec.table ||
      index.unique !== spec.unique ||
      !isDeepStrictEqual(index.columns, spec.columns)
    ) {
      problems.push(`TS-only index ${name} has an unexpected shape`);
    }
  }

  // Triggers: exact, both directions.
  if (!isDeepStrictEqual(sortedKeys(actual.triggers), sortedKeys(snapshot.triggers))) {
    problems.push("triggers: name set differs from the Python snapshot");
  }
  for (const name of Object.keys(snapshot.triggers)) {
    if (
      actual.triggers[name] &&
      !isDeepStrictEqual(actual.triggers[name], snapshot.triggers[name])
    ) {
      problems.push(`triggers[${name}] differs from snapshot`);
    }
  }

  return problems;
}
