// Extension capability bindings and `ext <id> migrate` (CV22.DS7.TS4 plateau 3).
//
// Port of `_cmd_bind`, `_cmd_unbind`, `_cmd_bindings`, `_cmd_migrate`, and
// `_handle_binding` from `src/memory/cli/ext.py`. These are the family's first
// WRITES, and two measured facts shape them:
//
//   * **A `--global` bind is not idempotent, and a persona bind is.**
//     `_ext_bindings`'s primary key includes `target_id`, which is NULL for a
//     global binding, and SQLite does not consider two NULLs equal in a
//     (non-STRICT, rowid) primary key. So `INSERT OR IGNORE` ignores nothing:
//     binding the same capability globally three times leaves THREE rows,
//     where binding it to a persona three times leaves one. Measured on the
//     real schema, reproduced here, and recorded as debt -- the docstring
//     that says "No-op if already present (PK conflict)" is true only for the
//     targeted kinds.
//   * **`created_at` is Python's `isoformat()`**, with `+00:00` and
//     microseconds -- NOT the `Z` form `_now()` uses elsewhere in Mirror. The
//     write probe grades these bytes, so the clock seam yields that spelling.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Database, WritableDatabase } from "#db/database.ts";
import type { RenderedCommand } from "./catalog.ts";
import { extensionNotInstalled, installedExtensionDir } from "./dispatch.ts";
import { ExtensionError } from "./errors.ts";
import { runMigrations } from "./migrations.ts";

/** Python `datetime.now(timezone.utc).isoformat()`: `+00:00`, microseconds. */
export function pythonUtcIsoformat(date: Date = new Date()): string {
  return date.toISOString().replace(/\.(\d{3})Z$/, ".$1000+00:00");
}

export interface BindingDeps {
  /** Injected so the corpus and the probe can freeze it. */
  readonly nowIso: () => string;
}

export interface BindingTarget {
  kind: "persona" | "journey" | "global";
  id: string | null;
}

function out(stdout: string, exitCode = 0): RenderedCommand {
  return { stdout, stderr: "", exitCode };
}

function label(target: BindingTarget): string {
  return target.id ? `${target.kind}/${target.id}` : target.kind;
}

/** Port of `_cmd_bind`. */
export function runBind(
  db: WritableDatabase,
  extensionId: string,
  capabilityId: string,
  target: BindingTarget,
  deps: BindingDeps,
): RenderedCommand {
  db.prepare(
    "INSERT OR IGNORE INTO _ext_bindings " +
      "(extension_id, capability_id, target_kind, target_id, created_at) " +
      "VALUES (?, ?, ?, ?, ?)",
  ).run(extensionId, capabilityId, target.kind, target.id, deps.nowIso());
  return out(`bound ${extensionId}/${capabilityId} -> ${label(target)}\n`);
}

/** Port of `_cmd_unbind`. `target_id IS ?` is what makes a global unbind work. */
export function runUnbind(
  db: WritableDatabase,
  extensionId: string,
  capabilityId: string,
  target: BindingTarget,
): RenderedCommand {
  const result = db
    .prepare(
      "DELETE FROM _ext_bindings WHERE " +
        "extension_id = ? AND capability_id = ? AND " +
        "target_kind = ? AND (target_id IS ? OR target_id = ?)",
    )
    .run(extensionId, capabilityId, target.kind, target.id, target.id);
  if (Number(result.changes) === 0) return out("no matching binding\n");
  return out(`unbound ${extensionId}/${capabilityId} -> ${label(target)}\n`);
}

/** Port of `_cmd_bindings`. */
export function runBindings(db: Database, extensionId: string): RenderedCommand {
  const rows = db
    .prepare(
      "SELECT capability_id, target_kind, target_id, created_at " +
        "FROM _ext_bindings WHERE extension_id = ? " +
        "ORDER BY capability_id, target_kind, target_id",
    )
    .all(extensionId);
  if (rows.length === 0) return out(`no bindings for extension/${extensionId}\n`);
  const lines = [`=== bindings for extension/${extensionId} ===`];
  for (const row of rows) {
    const target = row.target_id ? String(row.target_id) : "(global)";
    lines.push(`  ${String(row.capability_id)} -> ${String(row.target_kind)}/${target}`);
  }
  return out(`${lines.join("\n")}\n`);
}

/** Port of `_cmd_migrate`. An extension error is a printed line and exit 1. */
export function runMigrate(
  db: WritableDatabase,
  mirrorHome: string,
  extensionId: string,
  deps: BindingDeps,
): RenderedCommand {
  // `installedExtensionDir`, not `join`: Python builds this path without
  // normalizing it and then PRINTS it, so `ext ../../etc migrate` must answer
  // with the traversal intact. Plateau 3 shipped `join` here and plateau 4's
  // measurement caught it -- the bindings golden only ever passed a plain id.
  const extensionDir = installedExtensionDir(mirrorHome, extensionId);
  if (!existsSync(extensionDir)) return extensionNotInstalled(mirrorHome, extensionId);
  try {
    const applied = runMigrations(db, extensionId, join(extensionDir, "migrations"), deps);
    return out(`applied ${applied} migration(s) for extension/${extensionId}\n`);
  } catch (error) {
    if (!(error instanceof ExtensionError)) throw error;
    return out(`${error.message}\n`, 1);
  }
}

/**
 * Port of `_handle_binding`'s parser.
 *
 * The LAST target flag wins, because Python overwrites `target_kind`/
 * `target_id` on every match rather than refusing a second one; an
 * unrecognised token refuses immediately with the token quoted.
 */
export function parseBindingTail(
  extensionId: string,
  action: "bind" | "unbind",
  tail: readonly string[],
): (BindingTarget & { capabilityId: string }) | RenderedCommand {
  if (tail.length === 0) {
    return out(
      `usage: python -m memory ext ${extensionId} ${action} <capability> ` +
        "(--persona <id> | --journey <id> | --global)\n",
      1,
    );
  }
  const capabilityId = tail[0] as string;
  let kind: BindingTarget["kind"] | null = null;
  let id: string | null = null;
  for (let index = 1; index < tail.length; index += 1) {
    const token = tail[index] as string;
    const value = tail[index + 1];
    if (token === "--persona" && value !== undefined) {
      kind = "persona";
      id = value;
      index += 1;
    } else if (token === "--journey" && value !== undefined) {
      kind = "journey";
      id = value;
      index += 1;
    } else if (token === "--global") {
      kind = "global";
      id = null;
    } else {
      return out(`unrecognised argument '${token}'\n`, 1);
    }
  }
  if (kind === null) {
    return out("missing target: pass --persona <id>, --journey <id>, or --global\n", 1);
  }
  return { capabilityId, kind, id };
}
