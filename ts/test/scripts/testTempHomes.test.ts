// CR163 — the repository guard that keeps a literal /tmp out of ts/test.
//
// The run-level check (scripts/test_leaves_nothing.sh) sees every temp home
// only because they are all made under os.tmpdir(); a home under a literal
// /tmp would escape it. This guard is what keeps them there. Each form the
// tree has used is a case here (A8), and so is each look-alike that is not a
// temp home: a /tmp in an assertion, a golden-style literal, a comment.

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { findLiteralTmpHomes } from "#guards/testTempHomes.ts";
import { tempDir } from "#helpers/tempDir.ts";

/** A repository holding `files` under its root, by relative path. */
function repo(files: Record<string, string>): string {
  const root = tempDir("temp-homes-guard-");
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

test("each form that makes a temp home under a literal /tmp is found, by file and line", () => {
  const root = repo({
    "ts/test/a.test.ts": [
      'import { mkdtempSync } from "node:fs";',
      'const a = mkdtempSync("/tmp/a-");',
      "const b = mkdtempSync(`/tmp/b-${name}-`);",
      'const c = mkdtempSync(join("/tmp", "c-"));',
      'const d = mkdtempSync(join(realpathSync("/tmp"), "d-"));',
      'const e = await mkdtemp("/tmp/e-");',
      "const f = mkdtempSync(",
      '  "/tmp/f-",',
      ");",
    ].join("\n"),
    "ts/test/helpers/world.ts": 'export const root = realpathSync(mkdtempSync("/tmp/w-"));',
  });
  const { findings, staleExceptions } = findLiteralTmpHomes(root, {});
  assert.deepEqual(
    findings.map((f) => `${f.file}:${f.line}`),
    [
      "ts/test/a.test.ts:2",
      "ts/test/a.test.ts:3",
      "ts/test/a.test.ts:4",
      "ts/test/a.test.ts:5",
      "ts/test/a.test.ts:6",
      "ts/test/a.test.ts:7",
      "ts/test/helpers/world.ts:1",
    ],
  );
  assert.equal(findings[0].text, 'const a = mkdtempSync("/tmp/a-");');
  assert.deepEqual(staleExceptions, []);
});

test("a /tmp that is not a temp home is not a finding", () => {
  const root = repo({
    "ts/test/b.test.ts": [
      'assert.equal(sessionFolder("/tmp/scratch/pi/x.jsonl"), "pi");',
      'return "/tmp/memory_20260907_140305.zip";',
      'const dir = tempDir("logger-cli-");',
      'const ok = mkdtempSync(join(tmpdir(), "ok-"));',
      '// Before CR163 this was mkdtempSync("/tmp/x-").',
      ' * mkdtempSync("/tmp/in-a-block-comment-")',
    ].join("\n"),
    "ts/test/goldens/x.golden.json": '{ "artifact_dir": "/tmp/x", "mkdtempSync": "/tmp/y" }',
    "ts/src/product.ts": 'const dir = mkdtempSync("/tmp/not-a-test-");',
  });
  assert.deepEqual(findLiteralTmpHomes(root, {}).findings, []);
});

test("an exception names its reason; one that no longer matches is stale", () => {
  const root = repo({
    "ts/test/helpers/builderWorld.ts": 'const root = mkdtempSync("/tmp/builder-world-");',
  });
  const held = findLiteralTmpHomes(root, { "ts/test/helpers/builderWorld.ts": "CR164" });
  assert.deepEqual(held.findings, []);
  assert.deepEqual(held.staleExceptions, []);

  const gone = findLiteralTmpHomes(root, {
    "ts/test/helpers/builderWorld.ts": "CR164",
    "ts/test/helpers/storyWorld.ts": "moved to tempDir",
  });
  assert.deepEqual(gone.staleExceptions, ["ts/test/helpers/storyWorld.ts"]);
});
