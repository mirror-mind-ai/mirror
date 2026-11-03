// Human text that reaches the front door as bytes: stdin behind `identity set`
// and `journey update -`, and the file behind `--file` (CR194).
//
// The bytes carry no encoding but what their first bytes say. PowerShell 5.1
// writes a UTF-8 mark at the head of what it pipes (PR #49) and UTF-16LE from
// `>`; an editor writes UTF-8 with or without a mark. The mark is an encoding's
// signature, not content: it chooses the decoding and is dropped. UTF-16
// without a mark is not detectable and is not attempted: a guess about bytes
// would be wrong about some file, silently.
//
// What the ASCII pipe does to a text (`$OutputEncoding` in PowerShell 5.1
// turns every accented letter into `?`) is not detectable either: a `?` is a
// character. `--file` is the route that never meets the pipe.

import { readFileSync } from "node:fs";

/** The text the bytes carry, by their mark; the mark itself is never returned. */
export function decodeTextInput(bytes: Buffer): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.subarray(2).toString("utf16le");
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const payload = Buffer.from(bytes.subarray(2));
    // An odd trailing byte is not a code unit; `swap16` refuses it.
    return (payload.length % 2 === 0 ? payload : payload.subarray(0, payload.length - 1))
      .swap16()
      .toString("utf16le");
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3).toString("utf8");
  }
  return bytes.toString("utf8");
}

/** Stdin to its end, decoded; "" when there is none. */
export function readStdinText(): string {
  try {
    return decodeTextInput(readFileSync(0));
  } catch {
    return "";
  }
}

/**
 * The file behind `--file`, decoded; or the one-line refusal. The line names
 * the path and nothing from the error: a directory, a missing file, and a
 * permission refused all read the same to the person, and `errno` is noise.
 */
export function readTextFile(path: string): { text: string } | { error: string } {
  try {
    return { text: decodeTextInput(readFileSync(path)) };
  } catch {
    return { error: `cannot read ${path}` };
  }
}
