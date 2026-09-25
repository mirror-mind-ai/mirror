// CR008 decision C: no runtime names its session to Mirror until a named
// session's Builder stamp carries provenance (CR008 option B).
//
// Builder lifecycle commands bind a journey from `--journey`, or from the
// Builder Mode of a session the caller NAMES (`--session-id` or
// `MIRROR_SESSION_ID`). When no session is named, `build load` still stamps its
// mode onto a GUESSED session, which is what lets each Pi window's footer show
// its own mode. Nothing names a session today, so a guessed stamp never binds a
// journey.
//
// That stops being true the day a runtime names its session: an integration
// exports MIRROR_SESSION_ID into an agent shell, or a skill or hook passes
// `--session-id` to a `build` command. From then on, a stamp guessed onto one
// window's row by ANOTHER window's `build load` binds the first window's
// lifecycle commands to the other window's journey. Decision C (2026-09-25) left
// the write side alone and made option B the precondition for that day. This
// test is where the day announces itself. It fails loudly; it does not rely on
// someone rereading a note.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const CR008 =
  "docs/project/refinement/rs001-ariad-runtime-trust/cr008-bind-lifecycle-commands-to-active-journey.md";

/** Where a runtime would start naming its session: integrations, hooks, installers, skills. */
const INTEGRATION_ROOTS = [
  ".pi",
  ".claude",
  ".gemini",
  "plugins",
  "frame",
  "installer",
  "scripts",
  "templates",
];
const ROOT_FILES = [".env.example", ".env.example.advanced"];
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", "dist", "out"]);

/** Ways to SET the variable. Reading it is fine; naming a session is the event. */
const SETS_SESSION_ID: readonly RegExp[] = [
  /\bexport\s+MIRROR_SESSION_ID=/u,
  /(?:^|[\s;&|(])MIRROR_SESSION_ID=\S/mu,
  /\benv(?:\.MIRROR_SESSION_ID|\[\s*["']MIRROR_SESSION_ID["']\s*\])\s*=(?!=)/u,
  /["']?\bMIRROR_SESSION_ID["']?\s*:\s*(?!string\b)[^\s,}]/u,
  /\$env:MIRROR_SESSION_ID\s*=/iu,
  /\bset\s+"?MIRROR_SESSION_ID=/iu,
];

/** A skill, hook, or script naming its session to a Builder command. */
const BUILD_WITH_SESSION_ID = /\bbuild [a-z-]+[^\n]*--session-id/u;

function namesSession(text: string): boolean {
  // Comment lines document; they do not configure.
  const code = text
    .split("\n")
    .filter((line) => !/^\s*(?:#|\/\/)/u.test(line))
    .join("\n");
  return SETS_SESSION_ID.some((pattern) => pattern.test(code)) || BUILD_WITH_SESSION_ID.test(code);
}

function filesUnder(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const full = join(directory, entry.name);
      // Symlinks report neither, so `.agents` -> `.pi` style links cannot loop.
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) found.push(full);
    }
  };
  walk(root);
  return found;
}

test("the detector tells naming a session apart from reading or documenting one", () => {
  const names = [
    "export MIRROR_SESSION_ID=abc",
    "MIRROR_SESSION_ID=abc node ts/src/frontDoor/cli.ts build pull-candidates",
    "cd repo && MIRROR_SESSION_ID=$SID mirror build plan-item",
    "const env = { ...process.env, MIRROR_SESSION_ID: sessionId };",
    "process.env.MIRROR_SESSION_ID = sessionFile;",
    'env["MIRROR_SESSION_ID"] = id;',
    '"env": { "MIRROR_SESSION_ID": "abc" }',
    "$env:MIRROR_SESSION_ID = $id",
    "set MIRROR_SESSION_ID=abc",
    "node ts/src/frontDoor/cli.ts build pull-item --session-id S --method ariad",
    "mirror build load demo --session-id S",
  ];
  const doesNot = [
    "const sid = process.env.MIRROR_SESSION_ID ?? null;",
    "# MIRROR_SESSION_ID=",
    "# MIRROR_SESSION_ID=abc",
    "// process.env.MIRROR_SESSION_ID = example",
    "  MIRROR_SESSION_ID?: string;",
    "named with `--session-id` or `MIRROR_SESSION_ID`.",
    "if (env.MIRROR_SESSION_ID === undefined) return;",
    "delete process.env.MIRROR_SESSION_ID;",
    "mirror mode --session-id S status",
    "node ts/src/frontDoor/cli.ts build pull-item --journey <slug> --method ariad",
    "only to a session in Builder Mode named with `--session-id` or",
  ];
  for (const line of names) assert.ok(namesSession(line), `must detect: ${line}`);
  for (const line of doesNot) assert.ok(!namesSession(line), `must not flag: ${line}`);
});

test("CR008 decision C: no runtime integration or skill names its session to Mirror", () => {
  const files = [
    ...INTEGRATION_ROOTS.flatMap((root) => filesUnder(join(REPO, root))),
    ...ROOT_FILES.map((name) => join(REPO, name)),
  ];
  assert.ok(files.length > 100, `the scan must see the integrations, saw ${files.length} files`);
  const offenders = files
    .filter((file) => namesSession(readFileSync(file, "utf8")))
    .map((file) => relative(REPO, file));
  assert.deepEqual(
    offenders,
    [],
    `A runtime now names its session to Mirror (${offenders.join(", ")}). Before that ships, ` +
      "CR008 option B must land: a lifecycle command may bind a named session's Builder stamp " +
      "only if the stamp was written under that name, because `build load` still stamps a " +
      `GUESSED session when none is named. See ${CR008}, "Found During Implementation".`,
  );
});
