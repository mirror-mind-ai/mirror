// `descriptor list` rendering — the port of memory.cli.descriptor._cmd_list's
// print loop. `descriptor generate` is LLM-backed and stays on Python.

import type { DescriptorRow } from "../../descriptor/descriptorRead.ts";

/**
 * Render `descriptor list`. Each row is three Python `print()` calls
 * (`[layer/key]`, the indented descriptor, and a bare blank-line `print()`) —
 * modeled as three array elements, each getting exactly one trailing newline.
 */
export function renderDescriptorList(rows: DescriptorRow[]): string {
  if (rows.length === 0) return "No descriptors stored.\n";
  const prints: string[] = [];
  for (const row of rows) {
    prints.push(`[${row.layer}/${row.key}]`);
    prints.push(`  ${row.descriptor}`);
    prints.push("");
  }
  return prints.map((line) => `${line}\n`).join("");
}
