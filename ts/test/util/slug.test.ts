import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { kebabSlug, stripAccents } from "../../src/util/slug.ts";

interface GoldenCase {
  input: string;
  stripped: string;
  slug: string;
}
interface Golden {
  cases: GoldenCase[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, "..", "goldens", "slug.golden.json");
const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as Golden;

test("slug golden is well-formed", () => {
  assert.ok(golden.cases.length >= 15, "corpus covers a broad case set");
  assert.ok(
    golden.cases.some((c) => c.slug === ""),
    "golden includes an empty-result case",
  );
  assert.ok(
    golden.cases.some((c) => c.slug.length === 80),
    "golden includes a cap-length case",
  );
});

test("TS stripAccents/kebabSlug reproduce the Python oracle for every golden case", () => {
  for (const c of golden.cases) {
    assert.equal(
      stripAccents(c.input),
      c.stripped,
      `stripAccents mismatch for ${JSON.stringify(c.input)}`,
    );
    assert.equal(kebabSlug(c.input), c.slug, `kebabSlug mismatch for ${JSON.stringify(c.input)}`);
  }
});

// Focused unit assertions documenting each rule independently of the golden.

test("stripAccents removes combining marks across scripts, leaving ASCII untouched", () => {
  assert.equal(stripAccents("episódio"), "episodio");
  assert.equal(stripAccents("café"), "cafe");
  assert.equal(stripAccents("plain ascii"), "plain ascii");
});

test("kebabSlug lowercases and collapses non-alphanumeric runs to single hyphens", () => {
  assert.equal(kebabSlug("Café com Açúcar & Ação"), "cafe-com-acucar-acao");
  assert.equal(kebabSlug("Mixed_Case-With.Dots"), "mixed-case-with-dots");
});

test("kebabSlug trims edge hyphens", () => {
  assert.equal(kebabSlug("  leading and trailing spaces  "), "leading-and-trailing-spaces");
  assert.equal(kebabSlug("___only___underscores___"), "only-underscores");
});

test("kebabSlug returns '' when no alphanumeric content remains, without substituting a default", () => {
  assert.equal(kebabSlug(""), "");
  assert.equal(kebabSlug("!!!"), "");
  assert.equal(kebabSlug("日本語テキスト"), "");
});

test("kebabSlug hard-caps at 80 chars by default and re-trims a hyphen the cut exposes", () => {
  assert.equal(kebabSlug("a".repeat(81)).length, 80);
  assert.equal(kebabSlug("a".repeat(80)).length, 80);
  assert.equal(kebabSlug(`${"a".repeat(79)}-b`).length, 79); // the cut lands on the hyphen at 80, trimmed
  assert.equal(kebabSlug(`${"a".repeat(79)}-b`), "a".repeat(79));
});

test("kebabSlug accepts a custom maxLength", () => {
  assert.equal(kebabSlug("abcdefghij", 5), "abcde");
});
