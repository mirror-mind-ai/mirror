import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { encodeJsonLine, PyFloat, pyFloat, pythonJson } from "#mcp/payload.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const NUMBERS = JSON.parse(
  readFileSync(join(HERE, "..", "goldens", "python-number-rendering.golden.json"), "utf-8"),
) as { name: string; float: boolean; value: number; python: string }[];

test("number rendering matches Python, float by float", () => {
  // The trap this exists for: Python renders a whole float as `2.0`, JS as `2`,
  // and JS cannot tell the two apart (2.0 === 2). detect_persona returns whole
  // float scores on real queries, so this is traffic, not an edge case.
  for (const testCase of NUMBERS) {
    const encoded = pythonJson(testCase.float ? pyFloat(testCase.value) : testCase.value);
    assert.equal(encoded, testCase.python, `${testCase.name} should render as Python does`);
  }
});

test("PyFloat survives to runtime, which a branded type would not", () => {
  const wrapped = pyFloat(2);
  assert.ok(wrapped instanceof PyFloat);
  assert.equal(pythonJson({ score: wrapped }), '{"score": 2.0}');
  assert.equal(pythonJson({ score: 2 }), '{"score": 2}');
});

test("compact form uses Python's separators", () => {
  assert.equal(encodeJsonLine({ a: 1, b: [1, 2] }), '{"a": 1, "b": [1, 2]}');
  assert.equal(encodeJsonLine({}), "{}");
  assert.equal(encodeJsonLine([]), "[]");
  assert.equal(encodeJsonLine(null), "null");
});

test("indent=2 matches json.dumps(indent=2) layout", () => {
  assert.equal(
    pythonJson({ a: 1, b: [1, 2], c: { d: null } }, { indent: 2 }),
    [
      "{",
      '  "a": 1,',
      '  "b": [',
      "    1,",
      "    2",
      "  ],",
      '  "c": {',
      '    "d": null',
      "  }",
      "}",
    ].join("\n"),
  );
  // Empty containers stay on one line, as Python writes them.
  assert.equal(
    pythonJson({ empty: {}, list: [] }, { indent: 2 }),
    '{\n  "empty": {},\n  "list": []\n}',
  );
});

test("non-ASCII travels unescaped, as ensure_ascii=False does", () => {
  assert.equal(pythonJson({ t: "decisão ✳" }, { indent: 2 }), '{\n  "t": "decisão ✳"\n}');
});

test("a value Python would have rendered with default=str throws instead", () => {
  // String(obj) is "[object Object]", never Python's repr, so there is no
  // honest port. After the D1 fix no payload contains such a value; the loud
  // failure belongs in a test, not in a client's context window.
  assert.throws(() => pythonJson({ when: new Date() }, { indent: 2 }), /cannot encode/);
  assert.throws(() => pythonJson({ n: Number.NaN }), /non-finite/);
});
