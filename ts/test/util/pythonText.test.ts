import assert from "node:assert/strict";
import test from "node:test";
import {
  codePointLength,
  compareByCodePoint,
  comparePathComponents,
  pyFormat,
  pyRStrip,
  pySplitLines,
  pySplitWhitespace,
  sliceCodePoints,
  sortByCodePoint,
} from "#util/pythonText.ts";

test("pySplitWhitespace uses Python's separator set, not JavaScript's \\s", () => {
  // U+001F is whitespace to Python and not to JS; U+FEFF is the reverse.
  assert.deepEqual(pySplitWhitespace("one\u001ftwo"), ["one", "two"]);
  assert.deepEqual(pySplitWhitespace("one\ufefftwo"), ["one\ufefftwo"]);
  assert.deepEqual(pySplitWhitespace("one\u00a0two\u3000three"), ["one", "two", "three"]);
  // Runs collapse and the edges produce no empty fields, unlike split(/\s+/).
  assert.deepEqual(pySplitWhitespace("  a   b  "), ["a", "b"]);
  assert.deepEqual(pySplitWhitespace("   "), []);
  assert.deepEqual(pySplitWhitespace(""), []);
});

test("pySplitLines knows the eleven Python line boundaries", () => {
  for (const boundary of [
    "\n",
    "\r",
    "\v",
    "\f",
    "\u001c",
    "\u001d",
    "\u001e",
    "\u0085",
    "\u2028",
    "\u2029",
  ]) {
    assert.deepEqual(pySplitLines(`a${boundary}b`), ["a", "b"], `boundary ${escape(boundary)}`);
  }
  assert.deepEqual(pySplitLines("a\r\nb"), ["a", "b"], "CRLF is one boundary, not two");
  assert.deepEqual(pySplitLines("a\n"), ["a"], "a trailing boundary adds no empty field");
  assert.deepEqual(pySplitLines("a\n\nb"), ["a", "", "b"], "an interior blank line survives");
  assert.deepEqual(pySplitLines(""), []);
});

test("pyRStrip removes Python's trailing whitespace only", () => {
  assert.equal(pyRStrip("  a  "), "  a");
  assert.equal(pyRStrip("a\u001f"), "a");
  assert.equal(pyRStrip("a\ufeff"), "a\ufeff");
});

test("compareByCodePoint orders astral characters after the BMP, as Python does", () => {
  // JS `<` compares the lead surrogate (0xD83C) against 0xFFFF and says the
  // emoji sorts first; Python compares code points (0x1F3AF > 0xFFFF).
  assert.ok("🎯" < "\uFFFF", "precondition: UTF-16 unit order disagrees");
  assert.ok(compareByCodePoint("🎯", "\uFFFF") > 0);
  assert.equal(compareByCodePoint("abc", "abd"), -1);
  assert.equal(compareByCodePoint("ab", "abc"), -1);
  assert.equal(compareByCodePoint("same", "same"), 0);
});

test("sortByCodePoint returns a new array in Python's sorted() order", () => {
  const input = ["b", "🎯", "\uFFFF", "a"];
  const sorted = sortByCodePoint(input);
  assert.deepEqual(sorted, ["a", "b", "\uFFFF", "🎯"]);
  assert.deepEqual(input, ["b", "🎯", "\uFFFF", "a"], "input must not be mutated");
});

test("codePointLength and sliceCodePoints count emoji once, like Python len() and [:n]", () => {
  const text = "🎯 🎯 x";
  assert.equal(text.length, 7, "precondition: UTF-16 length differs");
  assert.equal(codePointLength(text), 5);
  assert.equal(sliceCodePoints(text, 1), "🎯");
  assert.equal(sliceCodePoints(text, 3), "🎯 🎯");
  assert.equal(sliceCodePoints(text, 99), text);
});

test("comparePathComponents puts a/b before a-x/c, unlike a joined-string sort", () => {
  const joined = ["a/b.jsonl", "a-x/c.jsonl"].sort();
  assert.deepEqual(joined, ["a-x/c.jsonl", "a/b.jsonl"], "precondition: '-' < '/' in ASCII");

  const byComponents = [
    ["a-x", "c.jsonl"],
    ["a", "b.jsonl"],
    ["nested", "deeper", "d.jsonl"],
    ["emoji-title.jsonl"],
    ["a"],
  ].sort(comparePathComponents);
  assert.deepEqual(byComponents, [
    ["a"],
    ["a", "b.jsonl"],
    ["a-x", "c.jsonl"],
    ["emoji-title.jsonl"],
    ["nested", "deeper", "d.jsonl"],
  ]);
});

// --- pyFormat (CV22.DS7.US11) ----------------------------------------------
//
// Added when the prompt-assembly golden caught a `replaceAll`-based
// substitution leaving `{{` doubled in WEEK_PLAN_PROMPT's JSON example. The
// escaping rule is the whole reason this helper exists, so it is tested
// directly rather than only through the prompts that use it.

test("pyFormat substitutes named fields", () => {
  assert.equal(
    pyFormat("Today is {today} ({weekday}).", { today: "2026-09-09", weekday: "Wednesday" }),
    "Today is 2026-09-09 (Wednesday).",
  );
});

test("pyFormat collapses doubled braces to literals, as str.format does", () => {
  assert.equal(pyFormat('[{{\n  "k": "{v}"\n}}]', { v: "x" }), '[{\n  "k": "x"\n}]');
  assert.equal(pyFormat("{{}}", {}), "{}");
  assert.equal(pyFormat("{{{v}}}", { v: "mid" }), "{mid}");
});

test("pyFormat raises on an unknown field instead of emitting the placeholder", () => {
  // Python raises KeyError; silently leaving `{oops}` in a prompt would ship a
  // literal brace-name to a model and pass a digest check only by accident.
  assert.throws(() => pyFormat("a {oops} b", { other: "x" }), /no value for field "oops"/);
});

test("pyFormat rejects malformed braces", () => {
  assert.throws(() => pyFormat("a {unclosed", { unclosed: "x" }), /unmatched/);
  assert.throws(() => pyFormat("a } b", {}), /single '}'/);
});

test("pyFormat leaves non-field text untouched, including non-BMP characters", () => {
  assert.equal(pyFormat("\u{1F30D} {a} \u2615", { a: "b" }), "\u{1F30D} b \u2615");
});
