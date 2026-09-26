// CR079: the rule that no Ariad command replaces content it did not write is
// structural, not per artifact.
//
// It was patched three times, once per artifact, as each loss was met (Plan's
// `index.md`, Plan approval's `plan.md`, Validation's `validation.md`), while the
// same overwrite waited in every closure writer. Now every file the Builder
// writes goes through `artifacts/artifactWriter.ts`, under a declared policy.
// This test fails when any other module under `ts/src/builder` can write a file,
// so the next artifact cannot arrive without choosing one.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const BUILDER = fileURLToPath(new URL("../../src/builder", import.meta.url));
const THE_WRITER = join("artifacts", "artifactWriter.ts");

/** The `node:fs` names that put bytes into a file. Directories (`mkdirSync`) are not files. */
const WRITES = new Set([
  "writeFileSync",
  "appendFileSync",
  "renameSync",
  "copyFileSync",
  "cpSync",
  "createWriteStream",
  "writeFile",
  "appendFile",
  "rename",
  "copyFile",
  "cp",
]);

function writesFiles(source: string): boolean {
  const imports = /import\s*\{([^}]*)\}\s*from\s*["']node:fs(?:\/promises)?["']/gu;
  for (const match of source.matchAll(imports)) {
    const names = (match[1] ?? "").split(",").map((name) => name.trim().split(/\s+as\s+/u)[0]);
    if (names.some((name) => WRITES.has(name ?? ""))) return true;
  }
  const namespaceCall = /\bfs\.(\w+)\s*\(/gu;
  for (const match of source.matchAll(namespaceCall)) if (WRITES.has(match[1] ?? "")) return true;
  return false;
}

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

test("the detector finds a file write however it is imported, and nothing else", () => {
  const writes = [
    'import { existsSync, writeFileSync } from "node:fs";',
    'import { writeFile } from "node:fs/promises";',
    'import {\n  mkdirSync,\n  renameSync as promote,\n} from "node:fs";',
    'import * as fs from "node:fs";\nfs.appendFileSync(path, text);',
  ];
  const doesNot = [
    'import { existsSync, mkdirSync, readFileSync } from "node:fs";',
    "// writeFileSync is the writer's business, not this module's.",
    'import { dirname, join } from "node:path";',
    'import * as fs from "node:fs";\nfs.readFileSync(path, "utf8");',
  ];
  for (const source of writes) assert.ok(writesFiles(source), `must detect: ${source}`);
  for (const source of doesNot) assert.ok(!writesFiles(source), `must not flag: ${source}`);
});

test("CR079: only the artifact writer writes files under ts/src/builder", () => {
  const files = sources(BUILDER);
  assert.ok(files.length > 30, `the scan must see the Builder tree, saw ${files.length} files`);
  assert.ok(
    files.some((file) => relative(BUILDER, file) === THE_WRITER),
    "the writer itself is in the tree",
  );
  const offenders = files
    .filter((file) => relative(BUILDER, file) !== THE_WRITER)
    .filter((file) => writesFiles(readFileSync(file, "utf8")))
    .map((file) => relative(BUILDER, file));
  assert.deepEqual(
    offenders,
    [],
    `These Builder modules write files directly: ${offenders.join(", ")}. Route the write ` +
      "through writeBuilderArtifact with a policy: create-only for a scaffold the Driver " +
      "then owns, sealed-record for a record the runtime may rewrite while it is unchanged.",
  );
});
