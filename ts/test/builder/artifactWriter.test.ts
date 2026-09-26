// CR079: no Ariad command replaces content it did not write.
//
// The writer's two policies, its seal, and its confinement, graded without any
// lifecycle command in the way. The lifecycle behavior built on them is graded
// in commands.test.ts; the rule that nothing else under ts/src/builder writes a
// file is builderWriteGuard.test.ts.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import {
  ArtifactOutsideProjectError,
  isSealedByAriad,
  sealArtifact,
  writeBuilderArtifact,
} from "#builder/artifacts/artifactWriter.ts";

const roots: string[] = [];
test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function project(): string {
  const root = mkdtempSync("/tmp/artifact-writer-");
  roots.push(root);
  return root;
}

const RECORD = "# Validation — CV1.US1\n\n## Status\n\nPassed\n";
const SEAL_LINE =
  /^<!-- ariad-seal sha256:[0-9a-f]{64} — Ariad wrote this file and rewrites it only while this line matches the text above it\. Edit the file and Ariad will leave it as it is\. -->$/u;

/** The seal, computed from the specification rather than from the code under test. */
function expectedSeal(body: string): string {
  const hash = createHash("sha256").update(body, "utf8").digest("hex");
  return `${body}<!-- ariad-seal sha256:${hash} — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->\n`;
}

test("a sealed record is its content plus one line: the SHA-256 of that content", () => {
  const sealed = sealArtifact(RECORD);
  assert.equal(sealed, expectedSeal(RECORD));
  const lines = sealed.trimEnd().split("\n");
  assert.match(lines.at(-1) ?? "", SEAL_LINE);
  assert.ok(isSealedByAriad(sealed));
});

test("create-only: written when absent, and never again", () => {
  const root = project();
  const path = join(root, "docs/project/roadmap/cv1/cv1-us1/index.md");
  assert.equal(
    writeBuilderArtifact({
      path,
      content: "# scaffold\n",
      policy: "create-only",
      projectRoot: root,
    }),
    "created",
  );
  assert.equal(readFileSync(path, "utf8"), "# scaffold\n", "a scaffold carries no seal");
  writeFileSync(path, "# Authored by the Driver\n", "utf8");
  assert.equal(
    writeBuilderArtifact({
      path,
      content: "# scaffold\n",
      policy: "create-only",
      projectRoot: root,
    }),
    "existing",
  );
  assert.equal(readFileSync(path, "utf8"), "# Authored by the Driver\n");
});

test("sealed-record: created sealed, then rewritten while the seal still matches", () => {
  const root = project();
  const path = join(root, "docs/project/roadmap/cv1/cv1-us1/validation.md");
  const write = (content: string) =>
    writeBuilderArtifact({ path, content, policy: "sealed-record", projectRoot: root });
  assert.equal(write(RECORD), "created");
  assert.equal(readFileSync(path, "utf8"), expectedSeal(RECORD));
  // Recorded pending, then accepted: the command runs again and the file follows.
  const accepted = RECORD.replace("Passed", "Passed; the Navigator accepted");
  assert.equal(write(accepted), "updated");
  assert.equal(readFileSync(path, "utf8"), expectedSeal(accepted));
});

test("sealed-record: anything Ariad cannot prove it wrote is preserved byte for byte", () => {
  const cases: Record<string, (sealed: string) => string> = {
    "an authored file": () => "# Validation, as the Driver wrote it\n\nEvidence.\n",
    "a sealed file edited above the seal": (sealed) =>
      sealed.replace("Passed", "Passed, see below"),
    "a sealed file whose seal was removed": (sealed) => sealed.split("<!-- ariad-seal")[0] ?? "",
    "a sealed file with text after the seal": (sealed) => `${sealed}\nA note added below.\n`,
    "a seal whose hash was edited": (sealed) =>
      sealed.replace(/sha256:[0-9a-f]{4}/u, "sha256:0000"),
  };
  for (const [name, make] of Object.entries(cases)) {
    const root = project();
    const path = join(root, "docs/project/roadmap/cv1/cv1-us1/validation.md");
    const before = make(sealArtifact(RECORD));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, before, "utf8");
    assert.equal(
      writeBuilderArtifact({ path, content: RECORD, policy: "sealed-record", projectRoot: root }),
      "preserved",
      name,
    );
    assert.equal(readFileSync(path, "utf8"), before, `${name}: every byte kept`);
  }
});

test("sealed-record: a CRLF checkout of a sealed file still reads as unchanged", () => {
  const root = project();
  const path = join(root, "docs/project/roadmap/cv1/cv1-us1/review.md");
  writeBuilderArtifact({ path, content: RECORD, policy: "sealed-record", projectRoot: root });
  writeFileSync(path, readFileSync(path, "utf8").replaceAll("\n", "\r\n"), "utf8");
  assert.ok(isSealedByAriad(readFileSync(path, "utf8")));
  assert.equal(
    writeBuilderArtifact({ path, content: RECORD, policy: "sealed-record", projectRoot: root }),
    "updated",
  );
});

test("sealed-record: blank lines after the seal are not an edit", () => {
  const root = project();
  const path = join(root, "docs/project/roadmap/cv1/cv1-us1/done.md");
  writeBuilderArtifact({ path, content: RECORD, policy: "sealed-record", projectRoot: root });
  writeFileSync(path, `${readFileSync(path, "utf8")}\n\n`, "utf8");
  assert.equal(
    writeBuilderArtifact({ path, content: RECORD, policy: "sealed-record", projectRoot: root }),
    "updated",
  );
});

test("a relative project and path resolve against the working directory, as writeFileSync would", () => {
  // Under the working directory and without `..`, the way the lifecycle corpus
  // names its projects (`tmp/parity/...`), so a doubled path would be a real one.
  mkdirSync("tmp", { recursive: true });
  const relativeRoot = relative(process.cwd(), mkdtempSync(join("tmp", "artifact-writer-")));
  const root = join(process.cwd(), relativeRoot);
  roots.push(root);
  const relativePath = join(relativeRoot, "docs/project/roadmap/cv1/cv1-us1/validation.md");
  assert.equal(
    writeBuilderArtifact({
      path: relativePath,
      content: RECORD,
      policy: "sealed-record",
      projectRoot: relativeRoot,
    }),
    "created",
  );
  assert.ok(existsSync(join(root, "docs/project/roadmap/cv1/cv1-us1/validation.md")));
  assert.ok(!existsSync(join(root, relativeRoot)), "the project path is not doubled");
});

test("either policy refuses a path outside the project, and writes nothing", () => {
  const root = project();
  const outside = project();
  for (const policy of ["create-only", "sealed-record"] as const) {
    for (const path of [
      join(outside, "validation.md"),
      join(root, "../escape-validation.md"),
      join(root, "docs/../../escape-validation.md"),
    ]) {
      assert.throws(
        () => writeBuilderArtifact({ path, content: RECORD, policy, projectRoot: root }),
        ArtifactOutsideProjectError,
        `${policy}: ${path}`,
      );
      assert.ok(!existsSync(path), `${policy}: nothing written at ${path}`);
    }
  }
});
