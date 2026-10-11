// Reversible UTF-8/Windows mojibake repair for Mirror user text.
//
// Port of `src/memory/cli/repair_encoding.py` (CV22.DS7.TS1). Older
// Windows/local-runtime combinations stored UTF-8 text after decoding it as a
// legacy code page, producing "Ã©" where "é" was meant. The repair only touches
// two-code-point sequences that round-trip cleanly: re-encode through Latin-1
// (first pass) or Windows-1252 (second pass), then decode strictly as UTF-8;
// anything that fails either step is left exactly as it was. Legitimate text
// such as "Âncora" therefore survives, which is the whole safety argument.
//
// Parity notes, each pinned by the golden:
//   - `.` matches one CODE POINT (`u` + `s` flags), never a UTF-16 unit.
//   - Python's `bytes.decode("utf-8")` is strict; so is a fatal TextDecoder.
//   - Windows-1252 has five undefined bytes and a repertoire outside Latin-1;
//     a code point it cannot encode makes the pass leave the chunk unchanged,
//     exactly like Python's UnicodeEncodeError branch.
//   - The preview collapses whitespace with Python's `str.split()` set, which
//     is not JavaScript's `\s`, and caps by code point, not `.length`.

import { type Database, type WritableDatabase, withTransaction } from "#db/database.ts";
import { pythonWhitespaceRegex } from "#util/pythonText.ts";

/** One repairable cell: where it is, what it holds, what it becomes. */
export interface RepairHit {
  table: string;
  column: string;
  row_id: number;
  before: string;
  after: string;
}

// UTF-8 bytes decoded as Latin-1: "Ã©", "Ã§", "Ã£", "Âº", ...
const LATIN1_UTF8_PAIR = /[\u00c2-\u00c3][\u0080-\u00bf]/gu;
// UTF-8 bytes decoded as Windows-1252: "Ã“", "Ã‰", ... (any following code point).
const CP1252_UTF8_PAIR = /[\u00c2-\u00c3]./gsu;

/**
 * User-text columns that can be scanned without touching arbitrary extension
 * tables. Missing tables/columns are ignored for older database versions.
 * Order matters: it is the oracle's scan order, hence the hit order.
 */
const TEXT_TARGETS: readonly (readonly [string, readonly string[]])[] = [
  ["identity", ["content"]],
  ["attachments", ["content"]],
  ["memories", ["content", "summary", "source", "journey", "layer"]],
  ["messages", ["content"]],
  ["conversations", ["title", "summary", "journey", "persona"]],
  ["memory_access_log", ["access_context"]],
  ["tasks", ["title", "description", "journey", "status", "notes"]],
];

/**
 * Windows-1252 code points for bytes 0x80–0x9F. `undefined` marks the five
 * bytes (0x81, 0x8D, 0x8F, 0x90, 0x9D) the code page leaves unassigned;
 * every other byte maps to itself (0x00–0x7F, 0xA0–0xFF), as in Latin-1.
 */
const CP1252_HIGH_BLOCK: readonly (number | undefined)[] = [
  0x20ac,
  undefined,
  0x201a,
  0x0192,
  0x201e,
  0x2026,
  0x2020,
  0x2021,
  0x02c6,
  0x2030,
  0x0160,
  0x2039,
  0x0152,
  undefined,
  0x017d,
  undefined,
  undefined,
  0x2018,
  0x2019,
  0x201c,
  0x201d,
  0x2022,
  0x2013,
  0x2014,
  0x02dc,
  0x2122,
  0x0161,
  0x203a,
  0x0153,
  undefined,
  0x017e,
  0x0178,
];

const CP1252_BYTE_FOR_CODE_POINT: ReadonlyMap<number, number> = new Map(
  CP1252_HIGH_BLOCK.flatMap((codePoint, offset) =>
    codePoint === undefined ? [] : [[codePoint, 0x80 + offset] as const],
  ),
);

const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Encode one code point as Latin-1, or `null` when it does not fit. */
function latin1Byte(codePoint: number): number | null {
  return codePoint <= 0xff ? codePoint : null;
}

/** Encode one code point as Windows-1252, or `null` when the code page lacks it. */
function cp1252Byte(codePoint: number): number | null {
  if (codePoint < 0x80 || (codePoint >= 0xa0 && codePoint <= 0xff)) return codePoint;
  return CP1252_BYTE_FOR_CODE_POINT.get(codePoint) ?? null;
}

/**
 * Re-encode `chunk` byte-per-code-point through `encodeByte` and decode the
 * result strictly as UTF-8. Returns the chunk unchanged when either step
 * fails — the same "leave it alone" contract as Python's `_decode_pair`.
 */
function decodePair(chunk: string, encodeByte: (codePoint: number) => number | null): string {
  const bytes: number[] = [];
  for (const char of chunk) {
    const byte = encodeByte(char.codePointAt(0) as number);
    if (byte === null) return chunk;
    bytes.push(byte);
  }
  try {
    return STRICT_UTF8.decode(Uint8Array.from(bytes));
  } catch {
    return chunk;
  }
}

/**
 * Return `text` with reversible mojibake repaired. Only two-code-point
 * sequences that decode as UTF-8 after re-encoding through Latin-1 or
 * Windows-1252 change; everything else — including legitimate Portuguese like
 * "Âncora" — stays as it is.
 */
export function repairText(text: string): string {
  const latin1Pass = text.replace(LATIN1_UTF8_PAIR, (chunk) => decodePair(chunk, latin1Byte));
  return latin1Pass.replace(CP1252_UTF8_PAIR, (chunk) => decodePair(chunk, cp1252Byte));
}

export function hasRepairableMojibake(text: string): boolean {
  return repairText(text) !== text;
}

/**
 * Python's `str.isspace()` set — what `str.split()` with no separator splits
 * on. Differs from JavaScript `\s`: it includes U+001C–U+001F and excludes
 * U+FEFF. Shared with the extension migration checksum, which depends on the
 * same distinction (CV22.DS7.TS3).
 */
const PYTHON_WHITESPACE = pythonWhitespaceRegex();

/**
 * Port of `_preview`: collapse whitespace runs to single spaces, trim, and cap
 * at `limit` code points with a trailing ellipsis.
 */
export function previewText(text: string, limit = 80): string {
  const compact = text
    .split(PYTHON_WHITESPACE)
    .filter((part) => part !== "")
    .join(" ");
  const codePoints = Array.from(compact);
  if (codePoints.length > limit) {
    return `${codePoints.slice(0, limit - 1).join("")}…`;
  }
  return compact;
}

function existingColumns(db: Database, table: string): Set<string> {
  try {
    return new Set(
      db
        .prepare(`PRAGMA table_info("${table}")`)
        .all()
        .map((row) => String(row.name)),
    );
  } catch {
    return new Set();
  }
}

function scanTable(db: Database, table: string, columns: readonly string[]): RepairHit[] {
  const existing = existingColumns(db, table);
  const selected = columns.filter((column) => existing.has(column));
  if (selected.length === 0) return [];

  const quoted = selected.map((column) => `"${column}"`).join(", ");
  let rows: Record<string, unknown>[];
  try {
    // Same statement as the oracle, deliberately without ORDER BY: same
    // engine, same plan, same rowid order. The golden pins it.
    rows = db.prepare(`SELECT _rowid_ AS __rowid__, ${quoted} FROM "${table}"`).all();
  } catch {
    return [];
  }

  const hits: RepairHit[] = [];
  for (const row of rows) {
    const rowId = Number(row.__rowid__);
    for (const column of selected) {
      const value = row[column];
      if (typeof value !== "string") continue;
      const fixed = repairText(value);
      if (fixed !== value) {
        hits.push({ table, column, row_id: rowId, before: value, after: fixed });
      }
    }
  }
  return hits;
}

/** Scan every target table/column and return the ordered list of repairable cells. */
export function scanDatabase(db: Database): RepairHit[] {
  return TEXT_TARGETS.flatMap(([table, columns]) => scanTable(db, table, columns));
}

/** Apply every hit by `_rowid_` in one transaction; returns the count applied. */
export function applyRepairs(db: WritableDatabase, hits: readonly RepairHit[]): number {
  return withTransaction(db, () => {
    for (const hit of hits) {
      db.prepare(`UPDATE "${hit.table}" SET "${hit.column}" = ? WHERE _rowid_ = ?`).run(
        hit.after,
        hit.row_id,
      );
    }
    return hits.length;
  });
}

export interface ScanReportOptions {
  dbPath: string;
  hits: readonly RepairHit[];
  /** Maximum preview rows; negative values behave as zero, like `max(limit, 0)`. */
  limit: number;
}

/** Render the scan section of the report exactly as the oracle prints it. */
export function renderScanReport({ dbPath, hits, limit }: ScanReportOptions): string {
  const shown = Math.max(limit, 0);
  const lines = [`Database: ${dbPath}`, `Repairable mojibake hits: ${hits.length}`];
  for (const hit of hits.slice(0, shown)) {
    lines.push(
      `- ${hit.table}.${hit.column} row=${hit.row_id}: ${previewText(hit.before)} -> ${previewText(hit.after)}`,
    );
  }
  if (hits.length > shown) lines.push(`… ${hits.length - shown} more`);
  return `${lines.join("\n")}\n`;
}

/** Render the trailing line of a successful `--apply`. */
export function renderApplyReport(applied: number): string {
  return `Applied repairs: ${applied}\n`;
}
