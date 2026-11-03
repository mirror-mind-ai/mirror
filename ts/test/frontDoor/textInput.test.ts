// CR194: human text on stdin or in a file, decoded by its mark. PowerShell 5.1
// writes a UTF-8 mark at the head of what it pipes and UTF-16LE from `>`; an
// editor writes UTF-8 with or without a mark. One decoder reads all of them,
// and the mark is never content.

import assert from "node:assert/strict";
import test from "node:test";
import { decodeTextInput } from "#frontDoor/textInput.ts";

const TEXT = "# Perfil\n\nNão há transição sem ação.\n";

test("UTF-8 without a mark is returned as it is", () => {
  assert.equal(decodeTextInput(Buffer.from(TEXT, "utf8")), TEXT);
});

test("UTF-8 with a mark: the mark is dropped, nothing else is touched", () => {
  assert.equal(
    decodeTextInput(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(TEXT, "utf8")])),
    TEXT,
  );
});

test("UTF-16LE with a mark, as PowerShell 5.1's `>` writes it", () => {
  const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(TEXT, "utf16le")]);
  assert.equal(decodeTextInput(bytes), TEXT);
});

test("UTF-16BE with a mark", () => {
  const le = Buffer.from(TEXT, "utf16le");
  const be = Buffer.from(le).swap16();
  assert.equal(decodeTextInput(Buffer.concat([Buffer.from([0xfe, 0xff]), be])), TEXT);
});

test("empty input is empty, and a mark alone is empty", () => {
  assert.equal(decodeTextInput(Buffer.alloc(0)), "");
  assert.equal(decodeTextInput(Buffer.from([0xef, 0xbb, 0xbf])), "");
  assert.equal(decodeTextInput(Buffer.from([0xff, 0xfe])), "");
  assert.equal(decodeTextInput(Buffer.from([0xfe, 0xff])), "");
});

test("a mark after the first byte is content, not a signature", () => {
  const inner = `a\uFEFFb`;
  assert.equal(decodeTextInput(Buffer.from(inner, "utf8")), inner);
});
