import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  detectPersona,
  normalizeRoutingText,
  type PersonaRoutingRow,
} from "../../src/persona/detectPersona.ts";

interface PersonaGolden {
  meta: { threshold: number };
  personas: PersonaRoutingRow[];
  probes: {
    label: string;
    query: string;
    expected: { key: string; score: number; match_type: string }[];
  }[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, "..", "goldens", "detect-persona.golden.json");
const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as PersonaGolden;

test("persona golden is well-formed", () => {
  assert.ok(golden.personas.length > 0, "corpus has personas");
  assert.ok(golden.probes.length > 0, "corpus has probes");
  const keys = new Set(golden.personas.map((p) => p.key));
  assert.equal(keys.size, golden.personas.length, "persona keys are unique");
});

test("TS detectPersona reproduces the Python oracle for every probe", () => {
  for (const probe of golden.probes) {
    const actual = detectPersona(probe.query, golden.personas, golden.meta.threshold);
    const expected = probe.expected.map((m) => ({
      key: m.key,
      score: m.score,
      matchType: m.match_type,
    }));
    assert.deepEqual(actual, expected, `probe ${probe.label}: ${probe.query}`);
  }
});

test("normalizeRoutingText mirrors the Python normalizer", () => {
  assert.equal(normalizeRoutingText("Pull-Request"), "pull request");
  assert.equal(normalizeRoutingText("savings_plan"), "savings plan");
  assert.equal(normalizeRoutingText("CODE!! (Pull-Request) time"), "code pull request time");
  assert.equal(normalizeRoutingText("  extra   spaces  "), "extra spaces");
  assert.equal(normalizeRoutingText("!!! ??? ..."), "");
});

const personas: PersonaRoutingRow[] = [
  { key: "code-reviewer", routing_keywords: ["code", "pull request", "refactor", "bug"] },
  { key: "finance-coach", routing_keywords: ["budget", "savings-plan", "investment", "cash flow"] },
  { key: "garden-planner", routing_keywords: ["garden", "soil", "compost bin", "seedling"] },
];

test("single-word keywords match whole query tokens, not substrings", () => {
  // "codebase" must NOT hit the single-word keyword "code" (token membership).
  assert.deepEqual(detectPersona("my codebase is large", personas), []);
  assert.deepEqual(detectPersona("read the code", personas), [
    { key: "code-reviewer", score: 1, matchType: "keyword" },
  ]);
});

test("multi-word keywords match as raw substrings", () => {
  assert.deepEqual(detectPersona("open a pull request now", personas), [
    { key: "code-reviewer", score: 1, matchType: "keyword" },
  ]);
});

test("hyphenated keywords normalize to multi-word and match by substring", () => {
  // "savings-plan" -> "savings plan"; present as a substring here.
  assert.deepEqual(detectPersona("draft a savings plan today", personas), [
    { key: "finance-coach", score: 1, matchType: "keyword" },
  ]);
});

test("ties are broken by ascending persona key", () => {
  assert.deepEqual(detectPersona("garden and code", personas), [
    { key: "code-reviewer", score: 1, matchType: "keyword" },
    { key: "garden-planner", score: 1, matchType: "keyword" },
  ]);
});

test("higher hit counts sort ahead of ties", () => {
  const result = detectPersona("code and pull request and garden", personas);
  assert.deepEqual(result, [
    { key: "code-reviewer", score: 2, matchType: "keyword" },
    { key: "garden-planner", score: 1, matchType: "keyword" },
  ]);
});

test("threshold above 1 excludes single-hit personas", () => {
  assert.deepEqual(detectPersona("read the code", personas, 2), []);
});

test("empty or all-punctuation queries return no matches", () => {
  assert.deepEqual(detectPersona("", personas), []);
  assert.deepEqual(detectPersona("!!! ???", personas), []);
});

test("non-string keywords are ignored without throwing", () => {
  const messy = [{ key: "loose", routing_keywords: ["code", 42, null] as unknown as string[] }];
  assert.deepEqual(detectPersona("read the code", messy), [
    { key: "loose", score: 1, matchType: "keyword" },
  ]);
});
