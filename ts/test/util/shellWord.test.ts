// CR104 — `shellWord`, and the guard that keeps every printed command using it.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { shellWord } from "#util/shellWord.ts";

test("a plain token prints as itself, so an ordinary slug is unchanged", () => {
  for (const word of ["mirror-ts-core", "demo", "j", "CV1.DS1", "a_b-1.c"]) {
    assert.equal(shellWord(word), word);
  }
});

test("anything else is single-quoted, and its own single quotes are escaped", () => {
  assert.equal(shellWord("x;touch PWNED"), "'x;touch PWNED'");
  assert.equal(shellWord("it's"), "'it'\\''s'");
  assert.equal(shellWord(""), "''");
  assert.equal(shellWord("ação"), "'ação'");
});

test("under sh, each value arrives as one argument, byte for byte, and runs nothing", () => {
  const cwd = mkdtempSync(join(tmpdir(), "shell-word-"));
  try {
    const values = [
      "x;touch PWNED",
      "$(touch PWNED)",
      "`touch PWNED`",
      "it's; touch PWNED",
      "a b|touch PWNED",
      "a\nb; touch PWNED",
      "'",
      "\\",
      "",
      "*",
      "~",
      "$HOME",
      "!",
      "-x",
      "ação",
    ];
    for (const value of values) {
      const script = `set -- ${shellWord(value)}; printf '%s|%s' "$#" "$1"`;
      const result = spawnSync("sh", ["-c", script], { cwd, encoding: "utf8" });
      assert.equal(result.status, 0, `${JSON.stringify(value)}: ${result.stderr}`);
      assert.equal(result.stdout, `1|${value}`, JSON.stringify(value));
    }
    assert.equal(existsSync(join(cwd, "PWNED")), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

// --- The guard --------------------------------------------------------------------
//
// Every command Mirror prints for its reader to run names the program through
// `PROGRAM`, so a line that holds `${PROGRAM}` is a printed command. Each value it
// interpolates must go through `shellWord`, unless it is listed below with the
// reason it cannot carry shell syntax. The guard reads one line at a time: a command
// split across lines is outside what it can see, which is why the four Builder hints
// and seed's skip hints are also proven by pasting them into `sh`.

const SOURCE_ROOT = fileURLToPath(new URL("../../src/", import.meta.url));

/** Interpolations a printed command may carry raw, and why. */
const UNQUOTED_BY_DESIGN = new Map([
  ["PROGRAM", "the program's own name"],
  ["action", "`bind` or `unbind`, a literal union type"],
  ["usage", "a constant usage fragment whose placeholders are meant to be read"],
  ["description", "prose printed after the usage line, not part of the command"],
  ["extensionId", "the extension id the user just typed, echoed in a usage line"],
  ["basename(targetDir)", "an installed extension's directory, named by its id"],
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

// Source text, not interpolations: escaped template literals keep `${` literal.
const PRINTED_COMMAND = `\${PROGRAM}`;
const QUOTED_VALUE = `\${shellWord(`;

/** The raw interpolations on one line of source that prints a `${PROGRAM}` command. */
function unquotedInterpolations(line: string): string[] {
  if (!line.includes(PRINTED_COMMAND)) return [];
  return [...line.matchAll(/\$\{([^}]*)\}/gu)]
    .map((match) => match[1] as string)
    .filter((expression) => !expression.startsWith("shellWord("))
    .filter((expression) => !UNQUOTED_BY_DESIGN.has(expression));
}

test("the guard catches a printed command that interpolates a value raw", () => {
  // The shape every CR104 hint had before the change.
  const before = `      \`Run: \${PROGRAM} build adopt --journey \${journey} --method ariad\`,`;
  assert.deepEqual(unquotedInterpolations(before), ["journey"]);
  const after = `      \`Run: \${PROGRAM} build adopt --journey \${shellWord(journey)} --method ariad\`,`;
  assert.deepEqual(unquotedInterpolations(after), []);
  assert.deepEqual(unquotedInterpolations(`const text = \`journey \${journey}\`;`), []);
});

test("every printed command in ts/src quotes each value it interpolates", () => {
  const offenders: string[] = [];
  let quoted = 0;
  for (const file of sourceFiles(SOURCE_ROOT)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (line.includes(PRINTED_COMMAND) && line.includes(QUOTED_VALUE)) quoted += 1;
        for (const expression of unquotedInterpolations(line)) {
          offenders.push(`${relative(SOURCE_ROOT, file)}:${index + 1}: \${${expression}}`);
        }
      });
  }
  assert.deepEqual(offenders, [], "quote these through shellWord (#util/shellWord.ts)");
  // The four Builder hints, the Pull and show commands, and seed's edit command:
  // proof the guard read the lines it exists for.
  assert.ok(quoted >= 7, `expected at least 7 quoted command lines, found ${quoted}`);
});
