// CV22.DS7.US6 plateau 3 — Soul voice prompts graded against the Python oracle.
//
// Three contracts, in rising order of consequence:
//   1. the vendored templates are byte-identical to the Python originals, so
//      the copy inside the package cannot drift from the source of truth;
//   2. Wisdom and Beauty compose to those templates unchanged;
//   3. the Self injection is literal -- the case that matters, because the
//      injected value is the user's own identity document and JavaScript
//      interprets `$&`, "$`", `$'`, `$1`, and `$$` inside a replacement string.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import golden from "#goldens/soul-prompt.golden.json" with { type: "json" };
import { createIdentityTable } from "#helpers/identitySchema.ts";
import {
  composeSoulBeautyVoicePrompt,
  composeSoulSelfVoicePrompt,
  composeSoulWisdomVoicePrompt,
  injectSelfIdentity,
  loadSoulBeautyVoiceTemplate,
  loadSoulSelfVoiceTemplate,
  loadSoulWisdomVoiceTemplate,
  SELF_IDENTITY_PLACEHOLDER,
  SELF_IDENTITY_UNAVAILABLE,
} from "#soul/prompts.ts";
import { codePointLength } from "#util/pythonText.ts";

interface SelfCase {
  name: string;
  identity: string | null;
  expected_prompt_sha256: string;
  expected_injected_value: string;
  expected_length: number;
}

const fixture = golden as {
  placeholder: string;
  unavailable: string;
  template_sha256: Record<string, string>;
  wisdom_prompt_sha256: string;
  beauty_prompt_sha256: string;
  self_cases: SelfCase[];
};

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

const PYTHON_PROMPT_DIR = fileURLToPath(new URL("../../../src/memory/prompts/", import.meta.url));

function freshDb(name: string, identity: string | null): WritableDatabase {
  const dir = mkdtempSync(`/tmp/soul-prompt-${name}-`);
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createIdentityTable(db);
  if (identity !== null) {
    db.prepare(
      "INSERT INTO identity (id,layer,key,content,created_at,updated_at) VALUES (?,?,?,?,'t','t')",
    ).run("1", "self", "soul", identity);
  }
  return db;
}

// 1. The vendored copies cannot drift.
//
// This test reads the Python tree, which is legitimate here and nowhere in
// `ts/src`: it is a drift guard, not runtime behavior. When DS10 deletes
// `src/memory/`, this assertion retires with it and the vendored files become
// the sole source of truth -- deliberately, and only then.
for (const [name, filename] of [
  ["self", "soul_self_voice.md"],
  ["wisdom", "soul_wisdom_voice.md"],
  ["beauty", "soul_beauty_voice.md"],
] as const) {
  test(`the vendored ${name} template is byte-identical to the Python original`, () => {
    const vendored = readFileSync(
      fileURLToPath(new URL(`../../src/soul/prompts/${filename}`, import.meta.url)),
      "utf8",
    );
    const original = readFileSync(join(PYTHON_PROMPT_DIR, filename), "utf8");
    assert.equal(vendored, original, `${filename} drifted from src/memory/prompts/`);
  });
}

test("the loaded templates match the oracle's hashes", () => {
  assert.equal(sha256(loadSoulSelfVoiceTemplate()), fixture.template_sha256.self);
  assert.equal(sha256(loadSoulWisdomVoiceTemplate()), fixture.template_sha256.wisdom);
  assert.equal(sha256(loadSoulBeautyVoiceTemplate()), fixture.template_sha256.beauty);
});

test("wisdom and beauty compose to their templates unchanged", () => {
  assert.equal(sha256(composeSoulWisdomVoicePrompt()), fixture.wisdom_prompt_sha256);
  assert.equal(sha256(composeSoulBeautyVoicePrompt()), fixture.beauty_prompt_sha256);
});

test("the placeholder and unavailable sentence match Python's", () => {
  assert.equal(SELF_IDENTITY_PLACEHOLDER, fixture.placeholder);
  assert.equal(SELF_IDENTITY_UNAVAILABLE, fixture.unavailable);
});

for (const scenario of fixture.self_cases) {
  test(`self voice: ${scenario.name} composes exactly as Python does`, () => {
    const db = freshDb(scenario.name, scenario.identity);
    const composed = composeSoulSelfVoicePrompt(db);

    // The readable assertion first, so a failure names the difference.
    const template = loadSoulSelfVoiceTemplate();
    const [prefix, suffix] = template.split(SELF_IDENTITY_PLACEHOLDER) as [string, string];
    const injected = composed.slice(prefix.length, composed.length - suffix.length);
    assert.equal(injected, scenario.expected_injected_value, "injected value");

    // `expected_length` is Python's `len()`, which counts CODE POINTS; a JS
    // `.length` would report 8352 for the astral-emoji case where Python says
    // 8351. Asserting the wrong one here was the first thing this corpus caught.
    assert.equal(codePointLength(composed), scenario.expected_length, "composed length");
    assert.equal(sha256(composed), scenario.expected_prompt_sha256, "composed prompt bytes");
    db.close();
  });
}

test("injection is literal: replacement patterns in identity text are not interpreted", () => {
  // The regression this plateau's security review asked for, isolated from the
  // 219-line template so the failure is legible.
  const template = `before ${SELF_IDENTITY_PLACEHOLDER} after`;
  const hazard = "$& $` $' $1 $$";
  assert.equal(injectSelfIdentity(template, hazard), "before $& $` $' $1 $$ after");
  // The naive form this guards against, kept visible as the counter-example.
  assert.notEqual(
    template.replaceAll(SELF_IDENTITY_PLACEHOLDER, hazard),
    "before $& $` $' $1 $$ after",
  );
});

test("injection replaces every occurrence, as Python's str.replace does", () => {
  const template = `${SELF_IDENTITY_PLACEHOLDER}|${SELF_IDENTITY_PLACEHOLDER}`;
  assert.equal(injectSelfIdentity(template, "x"), "x|x");
});
