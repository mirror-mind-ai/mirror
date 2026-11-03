// CV21.DS11.TS1 — the five runtime docs agree with the parity matrix.
//
// The drift this catches is the drift DS11 found: for two Delivery Stories the
// architecture counted four harnesses and had no Grok Build row while README named
// five, and nothing failed. The runtime interface contract's `## Parity Matrix` is
// the single authority for runtime parity (decisions.md, CV21.DS11.TS1); this guard
// holds the other docs to it. It reads names, levels, and links, not prose: a doc
// may say more than the matrix, never name fewer runtimes or another level.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const RUNTIMES = ["Pi", "Claude Code", "Codex", "Antigravity", "Grok Build"] as const;
const DOCS = {
  contract: "docs/product/specs/runtime-interface/index.md",
  readme: "README.md",
  gettingStarted: "docs/getting-started.md",
  reference: "REFERENCE.md",
  architecture: "docs/product/architecture.md",
} as const;
const MATRIX_LINK = "runtime-interface/index.md#parity-matrix";

const read = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");

/** A cell as a reader sees it: a link reduced to its label, emphasis and code marks gone. */
function plain(cell: string): string {
  return cell
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*`]/g, "")
    .trim();
}

/** One Markdown table row, split on the pipes GFM reads as separators (not `\|`). */
function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

/**
 * The first table below the exact heading line `heading`, before the next heading,
 * as one record per body row keyed by the header's plain, lower-cased cells.
 */
function tableUnder(markdown: string, heading: string): Record<string, string>[] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  assert.notEqual(start, -1, `no heading "${heading}"`);
  const table: string[][] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6} /.test(line)) break;
    if (!line.trimStart().startsWith("|")) {
      if (table.length > 0) break;
      continue;
    }
    table.push(cells(line));
  }
  assert.ok(table.length > 2, `no table under "${heading}"`);
  const [header = [], , ...body] = table;
  const keys = header.map((cell) => plain(cell).toLowerCase());
  return body.map((row) => Object.fromEntries(keys.map((key, i) => [key, row[i] ?? ""])));
}

function levelsOf(rows: Record<string, string>[], nameKey: string, levelKey: string) {
  return Object.fromEntries(
    rows.map((row) => {
      const level = /\bL[0-4]\b/.exec(plain(row[levelKey] ?? ""))?.[0] ?? "";
      return [plain(row[nameKey] ?? ""), level];
    }),
  );
}

const matrix = () => tableUnder(read(DOCS.contract), "## Parity Matrix");

test("each of the five runtime docs names all five runtimes", () => {
  for (const [doc, path] of Object.entries(DOCS)) {
    const text = read(path);
    for (const runtime of RUNTIMES) {
      // assert.ok, not assert.match: a failure names the doc, not its whole text.
      assert.ok(
        new RegExp(`\\b${runtime}\\b`).test(text),
        `${doc} (${path}) never names ${runtime}`,
      );
    }
  }
});

test("the contract's parity matrix holds one row per runtime, each with its level and provenance", () => {
  const rows = matrix();
  assert.deepEqual(rows.map((row) => plain(row.runtime ?? "")).sort(), [...RUNTIMES].sort());
  for (const row of rows) {
    const name = plain(row.runtime ?? "");
    assert.match(plain(row.level ?? ""), /^L[0-4]\b/, `${name}: a level`);
    for (const key of ["version", "binary", "record"]) {
      assert.notEqual(plain(row[key] ?? ""), "", `${name}: the ${key} it was measured on`);
    }
    assert.match(plain(row.measured ?? ""), /^\d{4}-\d{2}-\d{2}$/, `${name}: the date measured`);
  }
});

test("the architecture's runtime model gives each runtime the matrix's level", () => {
  const architecture = tableUnder(read(DOCS.architecture), "## 6. Runtime Model");
  assert.deepEqual(
    levelsOf(architecture, "harness", "parity"),
    levelsOf(matrix(), "runtime", "level"),
  );
});

test("README, Getting Started, and REFERENCE point to the matrix rather than keep their own levels", () => {
  for (const doc of ["readme", "gettingStarted", "reference"] as const) {
    assert.ok(read(DOCS[doc]).includes(MATRIX_LINK), `${DOCS[doc]} links ${MATRIX_LINK}`);
  }
});
