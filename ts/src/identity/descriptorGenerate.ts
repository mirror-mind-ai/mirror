/**
 * `descriptor generate` — CV22.DS7.US11 plateau 5.
 *
 * Generates a routing descriptor per identity and upserts it. CR068 found this
 * leaf unowned: DS7.US1 kept it on Python "as the DS7↔DS8 live seam", but DS8
 * flips live mode and ports nothing, so its orchestration belongs here.
 *
 * Graded by `ts/test/goldens/descriptor.golden.json`. Two behaviours the
 * corpus pins:
 *
 *   - **No ledger row.** `_cmd_generate` calls `generate_descriptor` WITHOUT an
 *     `on_llm_call`, making this the only LLM role in the product that writes
 *     nothing to `llm_calls`. The corpus records zero rows so a port cannot
 *     "helpfully" start logging and diverge. Closing the gap is a DS8 input.
 *   - **The 80-character preview is CODE POINTS**, and the ellipsis appears
 *     only when the descriptor is strictly longer than 80.
 *
 * `generate_descriptor` itself returns `""` for empty content BEFORE calling
 * the model, and `""` on any provider exception — both land on the same
 * "skipped (empty response)" line, and the target still counts in the
 * denominator.
 */

import type { Database, WritableDatabase } from "#db/database.ts";
import { codePointLength, sliceCodePoints } from "#util/pythonText.ts";

export interface DescriptorTarget {
  layer: string;
  key: string;
  content: string;
}

export interface IdentityRow {
  key: string;
  content: string | null;
}

/** Python `store.get_identity_by_layer(layer)` ordering. */
export function identitiesInLayer(db: Database, layer: string): IdentityRow[] {
  return db
    .prepare("SELECT key, content FROM identity WHERE layer = ? ORDER BY key")
    .all(layer) as unknown as IdentityRow[];
}

export interface ResolveTargetsInput {
  layer?: string | null;
  key?: string | null;
}

export type ResolveTargetsResult =
  | { kind: "targets"; targets: DescriptorTarget[] }
  | { kind: "missing-identity"; layer: string; key: string };

/**
 * Python's target selection: a specific pair, a whole layer, or — with no
 * flags — every persona THEN every journey, in that order.
 */
export function resolveDescriptorTargets(
  db: Database,
  input: ResolveTargetsInput,
): ResolveTargetsResult {
  if (input.layer && input.key) {
    const row = db
      .prepare("SELECT key, content FROM identity WHERE layer = ? AND key = ?")
      .get(input.layer, input.key) as unknown as IdentityRow | undefined;
    if (!row) return { kind: "missing-identity", layer: input.layer, key: input.key };
    return {
      kind: "targets",
      targets: [{ layer: input.layer, key: input.key, content: row.content ?? "" }],
    };
  }
  if (input.layer) {
    return {
      kind: "targets",
      targets: identitiesInLayer(db, input.layer).map((row) => ({
        layer: input.layer as string,
        key: row.key,
        content: row.content ?? "",
      })),
    };
  }
  const targets: DescriptorTarget[] = [];
  for (const layer of ["persona", "journey"]) {
    for (const row of identitiesInLayer(db, layer)) {
      targets.push({ layer, key: row.key, content: row.content ?? "" });
    }
  }
  return { kind: "targets", targets };
}

/** Python `upsert_descriptor`. */
export function upsertDescriptor(
  db: WritableDatabase,
  layer: string,
  key: string,
  descriptor: string,
  generatedAt: string,
): void {
  db.prepare(
    "INSERT INTO identity_descriptors (layer, key, descriptor, generated_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(layer, key) DO UPDATE SET descriptor = excluded.descriptor, generated_at = excluded.generated_at",
  ).run(layer, key, descriptor, generatedAt);
}

/** Python: `f"done — {descriptor[:80]}{'...' if len(descriptor) > 80 else ''}"`. */
export function descriptorPreview(descriptor: string): string {
  const head = sliceCodePoints(descriptor, 80);
  return codePointLength(descriptor) > 80 ? `${head}...` : head;
}

export interface DescriptorGenerateDeps {
  /** Returns the descriptor text, already stripped; `""` means skip. */
  generate: (target: DescriptorTarget) => string;
  nowIso: string;
  print?: (line: string) => void;
  printError?: (line: string) => void;
}

export interface DescriptorGenerateResult {
  exitCode: number;
  generated: number;
  total: number;
}

export function runDescriptorGenerate(
  db: WritableDatabase,
  input: ResolveTargetsInput,
  deps: DescriptorGenerateDeps,
): DescriptorGenerateResult {
  const print = deps.print ?? ((line: string) => process.stdout.write(line));
  const printError = deps.printError ?? ((line: string) => process.stderr.write(line));

  const resolved = resolveDescriptorTargets(db, input);
  if (resolved.kind === "missing-identity") {
    // Python's `!r` renders Python string repr: single quotes.
    printError(`No identity found for layer='${resolved.layer}' key='${resolved.key}'\n`);
    return { exitCode: 1, generated: 0, total: 0 };
  }

  const { targets } = resolved;
  if (targets.length === 0) {
    print("No entities found to describe.\n");
    return { exitCode: 0, generated: 0, total: 0 };
  }

  let generated = 0;
  for (const target of targets) {
    // Python prints with `end=" "`, so the line stays open until the outcome.
    print(`  generating ${target.layer}/${target.key}... `);
    const descriptor = deps.generate(target);
    if (descriptor) {
      upsertDescriptor(db, target.layer, target.key, descriptor, deps.nowIso);
      print(`done — ${descriptorPreview(descriptor)}\n`);
      generated += 1;
    } else {
      print("skipped (empty response)\n");
    }
  }

  print(`\n${generated}/${targets.length} descriptors generated.\n`);
  return { exitCode: 0, generated, total: targets.length };
}
