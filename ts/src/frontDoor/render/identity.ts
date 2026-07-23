// `identity list` / `identity get` rendering — the port of
// memory.cli.identity_cmd.cmd_list / cmd_get (read-only subcommands; `set` is
// US4/identityWrite.ts and `edit` stays on Python — it spawns `$EDITOR`).

import type { Database } from "../../db/database.ts";
import {
  getIdentityContent,
  type IdentityListRow,
  listAllIdentity,
  listIdentityByLayer,
} from "../../identity/identityRead.ts";

/** Raised when `identity get` finds no row for (layer, key) — mirrors Python's exit 1. */
export class IdentityEntryNotFoundError extends Error {
  readonly layer: string;
  readonly key: string;
  constructor(layer: string, key: string) {
    super(`No identity entry found for ${layer}/${key}`);
    this.layer = layer;
    this.key = key;
  }
}

/** `entry.content[:70]`, newlines collapsed to spaces, "..." appended when truncated. */
function preview(content: string): string {
  const clipped = content.slice(0, 70).replaceAll("\n", " ");
  return content.length > 70 ? `${clipped}...` : clipped;
}

/**
 * Render `identity list`: one "print call" per array element (each gets exactly
 * one trailing newline appended, matching Python's `print()`), so a header's own
 * embedded leading `\n` reproduces the blank line before every layer group.
 */
export function renderIdentityList(rows: IdentityListRow[]): string {
  if (rows.length === 0) return "No identity entries found.\n";
  const prints: string[] = [];
  let currentLayer: string | null = null;
  for (const row of rows) {
    if (row.layer !== currentLayer) {
      currentLayer = row.layer;
      prints.push(`\n[${row.layer}]`);
    }
    prints.push(`  ${row.key.padEnd(22)}  ${preview(row.content)}`);
  }
  return prints.map((line) => `${line}\n`).join("");
}

/** Read identity rows for `identity list`, optionally filtered by `--layer`. */
export function identityListRows(db: Database, layer: string | null): IdentityListRow[] {
  return layer ? listIdentityByLayer(db, layer) : listAllIdentity(db);
}

/** Render `identity get <layer> <key>`: raw content + newline, or throw not-found. */
export function renderIdentityGet(db: Database, layer: string, key: string): string {
  const content = getIdentityContent(db, layer, key);
  if (content === null) throw new IdentityEntryNotFoundError(layer, key);
  return `${content}\n`;
}
