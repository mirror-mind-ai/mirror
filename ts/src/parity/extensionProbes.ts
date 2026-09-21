// Extension binding + migration probe, TypeScript half (CV22.DS7.TS4 plateau 3).
//
// Counterpart of `ts/parity/write_parity_extensions.py`. Both halves run the
// same binding sequence and apply the SAME committed migration scripts to their
// own copy of a real database, and every intermediate `_ext_bindings` /
// `_ext_migrations` state is compared as an ordered sequence — a port that
// reaches the same end state through different intermediate rows fails here
// rather than passing on the last row alone.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { WritableDatabase } from "#db/database.ts";
import { runBind, runUnbind } from "#extensions/bindings.ts";
import { installExtension } from "#extensions/catalogWrites.ts";
import { runMigrations } from "#extensions/migrations.ts";
import type { MutatedRow } from "./writeParity.ts";
import type { WriteProbe } from "./writeProbe.ts";

export interface ExtBindingsProbeParams {
  readonly extension_id: string;
  readonly migrations_dir: string;
  readonly sequence: ReadonlyArray<{
    readonly label: string;
    readonly action: "bind" | "unbind";
    readonly capability_id: string;
    readonly target_kind: string;
    readonly target_id: string | null;
  }>;
}

function state(db: WritableDatabase): Record<string, string | number> {
  const bindings = db
    .prepare(
      "SELECT extension_id, capability_id, target_kind, target_id, created_at " +
        "FROM _ext_bindings ORDER BY capability_id, target_kind, COALESCE(target_id, ''), created_at",
    )
    .all();
  const migrations = db
    .prepare(
      "SELECT extension_id, filename, checksum, applied_at FROM _ext_migrations ORDER BY filename",
    )
    .all();
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ext_beta_%' ORDER BY name",
    )
    .all();
  return {
    bindings: bindings
      .map(
        (row) =>
          `${String(row.capability_id)}/${String(row.target_kind)}/${
            row.target_id === null ? "" : String(row.target_id)
          }@${String(row.created_at)}`,
      )
      .join("|"),
    binding_count: bindings.length,
    migrations: migrations
      .map((row) => `${String(row.filename)}:${String(row.checksum)}@${String(row.applied_at)}`)
      .join("|"),
    tables: tables.map((row) => String(row.name)).join(","),
  };
}

export function extBindingsProbe(
  label: string,
  params: ExtBindingsProbeParams,
  nowIso: string,
): WriteProbe {
  return {
    label,
    // Every graded cell is produced by `apply`, as the artifacts probe does:
    // the state here is an aggregate of two tables plus `sqlite_master`, which
    // no single-table snapshot spec can express.
    snapshots: [],
    apply(db: WritableDatabase): MutatedRow[] {
      // Production spells both timestamps with Python's `isoformat()` (`+00:00`);
      // the harness hands the frozen instant over in the `Z` form its other
      // probes use. Convert once, so the probe grades production's spelling.
      const frozen = nowIso.replace(/Z$/, "+00:00");
      // A DISTINCT stamp per step, derived identically in the Python half. One
      // frozen instant for every step hid a real difference: with identical
      // values `INSERT OR REPLACE` and `INSERT OR IGNORE` leave the same row,
      // and a mutant swapping them survived until the stamps differed.
      const stampFor = (index: number): string =>
        frozen.replace("12:00:00", `12:00:${String(index).padStart(2, "0")}`);
      const steps: MutatedRow[] = [];
      params.sequence.forEach((step, index) => {
        // PRODUCTION functions, not a copy of their SQL. A probe that reimplements
        // the write grades the probe: this one survived a mutant that broke
        // `runUnbind`'s NULL matching until it called the real function.
        const target = {
          kind: step.target_kind as "persona" | "journey" | "global",
          id: step.target_id,
        };
        if (step.action === "bind") {
          runBind(db, params.extension_id, step.capability_id, target, {
            nowIso: () => stampFor(index),
          });
        } else {
          runUnbind(db, params.extension_id, step.capability_id, target);
        }
        steps.push({ id: `${String(index).padStart(2, "0")}:${step.label}`, cells: state(db) });
      });

      const deps = { nowIso: () => frozen };
      const applied = runMigrations(db, params.extension_id, params.migrations_dir, deps);
      steps.push({
        id: `${String(params.sequence.length).padStart(2, "0")}:migrate_applied_${applied}`,
        cells: state(db),
      });
      const again = runMigrations(db, params.extension_id, params.migrations_dir, deps);
      steps.push({
        id: `${String(params.sequence.length + 1).padStart(2, "0")}:migrate_again_applied_${again}`,
        cells: state(db),
      });
      steps.push({ id: "final", cells: state(db) });
      return steps;
    },
  };
}

// --- `extensions install` as a FILE probe (plateau 5) ------------------------

export interface ExtensionInstallProbeParams {
  readonly extension_id: string;
  readonly source_root: string;
  readonly database_name: string;
}

/**
 * Install a command-skill for real, into a home whose database is a copy of a
 * REAL one.
 *
 * The golden grades these writes on a home this repository built from nothing.
 * This probe grades them where the migration half meets a real schema, and it
 * runs the PRODUCTION `installExtension` rather than reimplementing the copy —
 * plateau 3 recorded what happens when a probe reimplements the write it
 * grades: it survives a mutant that breaks production and proves only itself.
 */
export function extensionInstallProbe(
  label: string,
  params: ExtensionInstallProbeParams,
  nowIso: string,
  home: string,
  homeDatabase: WritableDatabase,
): WriteProbe {
  return {
    label,
    snapshots: [],
    // The harness copy is not the database written here: `install` resolves its
    // database from the HOME, so each half installs against its own copy placed
    // at exactly that resolved name, and reports the rows from it. Every graded
    // cell is returned below, so nothing depends on the harness's own snapshot.
    apply(): MutatedRow[] {
      const db = homeDatabase;
      const frozen = nowIso.replace("Z", "+00:00");
      installExtension({
        extensionId: params.extension_id,
        sourceRoot: params.source_root,
        mirrorHome: home,
        runtime: null,
        db,
        deps: { nowIso: () => frozen },
      });
      const migrations = db
        .prepare(
          "SELECT extension_id, filename, checksum, applied_at FROM _ext_migrations " +
            "WHERE extension_id = ? ORDER BY filename",
        )
        .all(params.extension_id)
        .map(
          (row) =>
            `${String(row.extension_id)}/${String(row.filename)}:${String(row.checksum)}@${String(row.applied_at)}`,
        );
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ext_notes_%' " +
            "ORDER BY name",
        )
        .all()
        .map((row) => String(row.name));
      return [
        ...installedFiles(home, params.source_root),
        { id: "rows", cells: { migrations: migrations.join("|"), tables: tables.join(",") } },
      ];
    },
  };
}

/** The Python half's `_install_files`, normalisations included. */
function installedFiles(home: string, sourceRoot: string): MutatedRow[] {
  const rows: MutatedRow[] = [];
  const caches = new Set<string>();
  for (const path of walkFiles(home)) {
    const parts = relative(home, path).split(sep);
    const cacheIndex = parts.indexOf("__pycache__");
    if (cacheIndex >= 0) {
      caches.add([...parts.slice(0, cacheIndex), "__pycache__"].join("/"));
      continue;
    }
    const name = parts[parts.length - 1] as string;
    if (name.endsWith(".db") || name.endsWith("-wal") || name.endsWith("-shm")) continue;
    rows.push({
      id: `file:${parts.join("/")}`,
      // The home and the source root are tokenised: the two halves install
      // into separate trees on purpose, and those absolute paths are embedded
      // in the catalog documents. Every other byte is compared as written.
      cells: {
        content: readFileSync(path, "utf8")
          .split(home)
          .join("<HOME>")
          .split(sourceRoot)
          .join("<SRC>"),
      },
    });
  }
  for (const cache of [...caches].sort()) {
    rows.push({ id: `cache:${cache}`, cells: { content: "<bytecode>" } });
  }
  return rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function walkFiles(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...walkFiles(path));
    else if (entry.isFile()) found.push(path);
  }
  return found.sort();
}
