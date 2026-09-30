// CR090 — Ariad's output reads in one language.
//
// Ariad surfaces are transported verbatim: the agent may not reword them, so a
// Portuguese phrase in an English sentence reaches the Navigator exactly as written.
// The rule is that output is English and input may be anything: a project document
// may name its sections in Portuguese, and the runtime must still read them.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { invokeBuilderArgv, invokeReadOnlyBuilderArgv } from "#builder/argv.ts";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { authorPlan } from "#helpers/authorScaffold.ts";
import { createJourney } from "#journey/journeyWrite.ts";

const NOW = "2026-09-28T12:00:00.000000Z";

test("the Debt Review surface records no action needed, in English", () => {
  const root = mkdtempSync(join(tmpdir(), "one-language-"));
  const project = join(root, "p");
  mkdirSync(join(project, "docs", "project", "roadmap"), { recursive: true });
  writeFileSync(join(project, "docs", "project", "roadmap", "index.md"), "# Roadmap\n");
  const db = bootstrapDatabase(join(root, "memory.db"));
  try {
    createJourney(db, { id: "j-1", slug: "j", content: "# J", projectPath: project }, NOW);
    const run = (...argv: string[]) => {
      const result = invokeBuilderArgv(db, [...argv, "--journey", "j", "--method", "ariad"], {
        nowIso: () => NOW,
      });
      assert.equal(result.exitCode, 0, `${argv[0]}: ${result.stderr}`);
      return result.stdout;
    };
    run("adopt");
    run("sync-cursor");
    run(
      "pull-item",
      ...["--item-code", "CV1.DS1.US1", "--item-level", "user_story"],
      ...["--item-title", "Enter an address", "--why-now", "now"],
    );
    const planned = run("plan-item");
    // CR112: approval reads the plan, so the Driver writes it first.
    authorPlan(/plan_artifact_path=(.+)/u.exec(planned)?.[1] ?? "");
    run("approve-plan");
    const validated = run(
      "validate-item",
      ...["--implementation-complete", "--check", "npm test", "--checks-status", "passed"],
      ...["--e2e-decision", "not_required", "--e2e-evidence", "unit covered"],
      ...["--navigator-route", "run it", "--navigator-accepted"],
      ...["--expected-observation", "it works", "--pass-condition", "it works"],
      ...["--fail-condition", "it breaks"],
    );
    const surface = validated.slice(validated.indexOf("<<<ARIAD:DEBT_REVIEW_STARTED>>>"));
    const prose = surface
      .split("\n")
      .map((line) => line.replaceAll("│", "").trim())
      .join(" ");
    assert.match(prose, /I can record this as no action needed and continue toward closure\./u);
    assert.doesNotMatch(prose, /sem ação|necessária/u);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("inspect-method names Ariad's lifecycle in English", () => {
  const db = bootstrapDatabase(join(mkdtempSync(join(tmpdir(), "one-language-")), "memory.db"));
  try {
    const inspected = invokeReadOnlyBuilderArgv(db, ["inspect-method", "ariad"]);
    assert.equal(inspected.exitCode, 0, inspected.stderr);
    const lines = inspected.stdout.split("\n");
    const start = lines.indexOf("lifecycle") + 1;
    assert.deepEqual(lines.slice(start, start + 9), [
      "- Pull chooses the focus",
      "- Prepare reads the terrain",
      "- Expand unfolds the granularity",
      "- Plan firms the contract",
      "- Implement changes the system",
      "- Validation proves behavior",
      "- Review faces the debt",
      "- Coherence integrates the traces",
      "- Done records and closes",
    ]);
  } finally {
    db.close();
  }
});

// --- The guard --------------------------------------------------------------------
//
// A Portuguese letter in a line of Builder source is output unless it is one of the
// inputs listed here, each with the reason it may hold one.

const BUILDER_SOURCE = fileURLToPath(new URL("../../src/builder/", import.meta.url));
const PORTUGUESE_LETTER = /[ãõçáéíóúâêôàÃÕÇÁÉÍÓÚÂÊÔÀ]/u;
const INPUTS: ReadonlyMap<string, string> = new Map([
  ["QUERY_SECTIONS", "section names read from project documents, which may be Portuguese"],
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

test("no Builder output carries a Portuguese letter; only listed inputs may", () => {
  const offenders: string[] = [];
  let inputs = 0;
  for (const file of sourceFiles(BUILDER_SOURCE)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        const code = line.trim();
        if (code.startsWith("//") || code.startsWith("*") || !PORTUGUESE_LETTER.test(line)) return;
        if ([...INPUTS.keys()].some((name) => line.includes(name))) {
          inputs += 1;
          return;
        }
        offenders.push(`${relative(BUILDER_SOURCE, file)}:${index + 1}: ${code}`);
      });
  }
  assert.deepEqual(offenders, [], "output is English (CR090); list an input with its reason");
  assert.equal(inputs, 1, "the guard reads the input it lists");
});
