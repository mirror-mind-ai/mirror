import assert from "node:assert/strict";
import test from "node:test";
import {
  codePointLength,
  compareByCodePoint,
  comparePathComponents,
  pyFormat,
  pyRepr,
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

// --- pyRepr: Python's repr, including what it will not print ---------------------
//
// Expectations recorded from CPython 3.14.3's `repr()` on 2026-09-27 (CR104's
// handoff review). Python escapes every character it does not consider printable,
// meaning Unicode's Other and Separator categories except the ASCII space. The
// port escaped only C0 controls and DEL, so a C1 control, a bidi override, or a
// zero-width space reached a terminal raw, through the identity-key refusal and
// `runtime diagnose` among others.

test("pyRepr quotes and escapes ASCII as Python does", () => {
  const cases: Array<[string, string]> = [
    ["it's", `"it's"`],
    ["both ' and \"", `'both \\' and "'`],
    ["tab\there", "'tab\\there'"],
    ["a\u001bb", "'a\\x1bb'"],
    ["a\u007fb", "'a\\x7fb'"],
  ];
  for (const [value, expected] of cases)
    assert.equal(pyRepr(value), expected, JSON.stringify(value));
});

test("pyRepr escapes every non-printable non-ASCII character as Python does", () => {
  const cases: Array<[string, string]> = [
    ["a\u009b31mb", "'a\\x9b31mb'"], // C1: the 8-bit CSI
    ["a\u0085b", "'a\\x85b'"], // C1: NEL, a line break
    ["a\u00a0b", "'a\\xa0b'"], // a space separator
    ["a\u00adb", "'a\\xadb'"], // a format character: the soft hyphen
    ["a\u202eb", "'a\\u202eb'"], // a bidi override
    ["a\u200bb", "'a\\u200bb'"], // a zero-width space
    ["a\u2028b", "'a\\u2028b'"], // the line separator
    ["a\u3000b", "'a\\u3000b'"], // the ideographic space
    ["a\ufeffb", "'a\\ufeffb'"], // the byte order mark
    ["a\ue000b", "'a\\ue000b'"], // private use
    ["a\u{e0001}b", "'a\\U000e0001b'"], // an astral format character
    ["\u0378", "'\\u0378'"], // unassigned
    ["\u{1f468}\u200d\u{1f469}", "'\u{1f468}\\u200d\u{1f469}'"], // a joiner between printables
  ];
  for (const [value, expected] of cases)
    assert.equal(pyRepr(value), expected, JSON.stringify(value));
});

test("pyRepr leaves printable non-ASCII alone, as Python does", () => {
  assert.equal(pyRepr("descrição"), "'descrição'");
  assert.equal(pyRepr("\u{1f600}"), "'\u{1f600}'");
});
