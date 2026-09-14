// CV22.DS7.US8 plateau 7 — the pure half of `build load`.
//
// The transition card and the query extractor, graded against Python before the
// provider-crossing half exists. They carry most of the leaf's divergence risk and
// none of its cost, which is why they are a separate corpus and a separate commit.

import assert from "node:assert/strict";
import test from "node:test";
import {
  extractQuery,
  extractSection,
  extractStage,
  renderBuilderModeTransition,
  truncateWords,
} from "#builder/transition.ts";
import golden from "#goldens/builder-load.golden.json" with { type: "json" };

interface TransitionCase {
  name: string;
  journey: string;
  journey_content: string;
  project_path: string | null;
  surface: string;
}

interface QueryCase {
  name: string;
  journey_content: string;
  slug: string;
  query: string;
  query_code_points: number;
  fell_back_to_slug: boolean;
}

const corpus = golden as unknown as {
  transitions: TransitionCase[];
  queries: QueryCase[];
};

test("every transition card matches Python byte for byte", () => {
  assert.ok(corpus.transitions.length >= 17, "expected the full transition matrix");
  for (const entry of corpus.transitions) {
    assert.equal(
      renderBuilderModeTransition({
        journey: entry.journey,
        journeyContent: entry.journey_content,
        projectPath: entry.project_path,
      }),
      entry.surface,
      entry.name,
    );
  }
});

test("every extracted query matches Python, code point for code point", () => {
  assert.ok(corpus.queries.length >= 9, "expected the full query matrix");
  for (const entry of corpus.queries) {
    const actual = extractQuery(entry.journey_content, entry.slug);
    assert.equal(actual, entry.query, entry.name);
    assert.equal(
      [...actual].length,
      entry.query_code_points,
      `${entry.name}: length in CODE POINTS`,
    );
    assert.equal(actual === entry.slug, entry.fell_back_to_slug, `${entry.name}: slug fallback`);
  }
});

test("the 500 cut is code points, not UTF-16 units", () => {
  // The failure this pins is silent: a naive `slice(0, 500)` over astral text
  // keeps 250 characters, which is a different embedding and therefore a
  // differently ordered memories block, with nothing to show a Navigator.
  const entry = corpus.queries.find((candidate) => candidate.name === "query_astral");
  assert.ok(entry, "the corpus must carry an astral query");
  const actual = extractQuery(entry.journey_content, entry.slug);
  assert.equal([...actual].length, 500);
  assert.ok(actual.length > 500, "the same string is longer than 500 UTF-16 units");
  assert.ok(!actual.includes("\uFFFD"), "no surrogate pair was split");
});

test("a body line mentioning a section name is dropped from the query", () => {
  // Reproduced, not repaired. The match runs against every LINE and `continue`s,
  // so the mentioning line vanishes while its neighbours survive.
  const entry = corpus.queries.find((candidate) => candidate.name === "query_body_mention");
  assert.ok(entry);
  const actual = extractQuery(entry.journey_content, entry.slug);
  assert.ok(actual.includes("This first sentence is kept."));
  assert.ok(actual.includes("This line is kept too"));
  assert.ok(
    !actual.includes("explains the context in which"),
    "the mentioning line itself must disappear",
  );

  // Where it actually bites: one body line, mentioning a section name, so nothing
  // is captured and the query silently becomes the slug — a slug search instead of
  // a briefing search, with no error anywhere. This is how the defect was found.
  const single = corpus.queries.find((candidate) => candidate.name === "query_single_body_mention");
  assert.ok(single);
  assert.equal(single.fell_back_to_slug, true);
  assert.equal(extractQuery(single.journey_content, single.slug), single.slug);
});

test("Portuguese section names are matched WITHOUT normalization", () => {
  // NFC matches the literal list; NFD does not, and the query silently becomes the
  // slug. Both forms are graded because a port that normalizes fixes the defect and
  // breaks parity — the fix belongs to the product, after the flip.
  const nfc = corpus.queries.find((candidate) => candidate.name === "query_portuguese_nfc");
  const nfd = corpus.queries.find((candidate) => candidate.name === "query_portuguese_nfd");
  assert.ok(nfc && nfd);
  assert.equal(nfc.fell_back_to_slug, false);
  assert.equal(nfd.fell_back_to_slug, true);
  assert.equal(extractQuery(nfc.journey_content, nfc.slug), nfc.query);
  assert.equal(extractQuery(nfd.journey_content, nfd.slug), nfd.slug);
});

test("the briefing row falls back to the document when no section matches", () => {
  // `_extract_section`'s fallback, which `_extract_query` does NOT share: one
  // returns a 240-character digest of the document, the other returns the slug.
  const section = extractSection("# Title\n\nA line of prose.\nAnd another.\n", ["briefing"]);
  assert.equal(section, "A line of prose. And another.");
  assert.equal(extractQuery("# Title\n\nA line of prose.\n", "slug"), "slug");
});

test("the stage line stops at its own line end", () => {
  assert.equal(extractStage("**Stage:**   DS7 — burn-down  \nnext line\n"), "DS7 — burn-down");
  assert.equal(extractStage("no stage here"), null);
});

test("truncateWords strips a trailing punctuation SET, not a suffix", () => {
  // Python's `rstrip(".,;")` removes every trailing character in the set, so
  // `done.,;` loses all three. A `endsWith` port loses one.
  assert.equal(truncateWords("one two three", 2), "one two…");
  assert.equal(truncateWords("one two done.,;", 2), "one two…");
  assert.equal(truncateWords("short enough", 32), "short enough");
});
