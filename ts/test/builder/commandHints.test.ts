// CR104 — every command a Builder hint tells its reader to run carries the journey
// slug as one shell word.
//
// A hint is printed to be copied, and agents copy it. A journey created before the
// slug grammar existed can hold anything a shell reads as syntax, so the proof is a
// paste: each hint, run under `sh` with a stub `mirror` that only echoes its
// arguments, must run nothing the slug smuggles in and must deliver the slug as one
// argument, byte for byte. The journey row is planted with raw SQL, which is how such
// a slug exists: it was created before anything checked it.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { invokeBuilderArgv, invokeReadOnlyBuilderArgv } from "#builder/argv.ts";
import { runBuildLoad } from "#builder/load.ts";
import { setAdoptedMethod } from "#builder/methodAdoption.ts";
import { renderJourneyWithoutAdoptedMethod } from "#builder/methodInspection.ts";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { WritableDatabase } from "#db/database.ts";

const NOW = "2026-09-27T12:00:00.000000Z";

/** Slugs a shell would split, substitute, pipe, or fail to parse. */
const HOSTILE = [
  "x;touch PWNED",
  "$(touch PWNED)",
  "`touch PWNED`",
  "it's; touch PWNED",
  "a b|touch PWNED",
];

const roots: string[] = [];

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function scratch(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `command-hints-${name}-`));
  roots.push(root);
  return root;
}

/** A real schema holding one journey per slug, planted as a row that predates the grammar. */
function databaseWith(slugs: readonly string[]): WritableDatabase {
  const db = bootstrapDatabase(join(scratch("db"), "memory.db"));
  const insert = db.prepare(
    "INSERT INTO identity (id, layer, key, content, version, created_at, updated_at) " +
      "VALUES (?, 'journey', ?, '# Planted', '1.0.0', ?, ?)",
  );
  slugs.forEach((slug, index) => {
    insert.run(`planted-${index}`, slug, NOW, NOW);
  });
  return db;
}

/**
 * Run `command` as pasted, under `sh`, with `mirror` defined to echo each argument
 * on its own line, and return the arguments it received. Asserts the paste ran
 * cleanly and ran nothing else.
 */
function pasted(command: string): string[] {
  const cwd = scratch("paste");
  const stub = `mirror() { for a in "$@"; do printf '%s\\n' "$a"; done; }`;
  const result = spawnSync("sh", ["-c", `${stub}; ${command}`], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${command}\n${result.stderr}`);
  assert.equal(existsSync(join(cwd, "PWNED")), false, `${command} ran a command`);
  return result.stdout.split("\n").slice(0, -1);
}

/** The argument that follows `flag` in a pasted command's arguments. */
function argumentAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

/** The command a refusal or trailer prints after `Run: `. */
function runLine(text: string): string {
  const match = /Run: (.*?)\]?\n?$/u.exec(text);
  assert.ok(match, `no Run: line in ${JSON.stringify(text)}`);
  return match[1] as string;
}

test("inspect-method's next action carries a hostile slug as one word", () => {
  for (const slug of HOSTILE) {
    const lines = renderJourneyWithoutAdoptedMethod(slug).split("\n");
    const command = lines[lines.indexOf("next action") + 1] as string;
    assert.equal(argumentAfter(pasted(command), "--journey"), slug, command);
  }
});

test("the not-adopted refusal's adopt command carries a hostile slug as one word", () => {
  const db = databaseWith(HOSTILE);
  try {
    for (const slug of HOSTILE) {
      const result = invokeReadOnlyBuilderArgv(db, [
        "pull-candidates",
        "--journey",
        slug,
        "--method",
        "ariad",
      ]);
      assert.equal(result.exitCode, 1, result.stderr);
      const command = runLine(result.stderr);
      assert.match(command, /^mirror build adopt /u);
      assert.equal(argumentAfter(pasted(command), "--journey"), slug, command);
    }
  } finally {
    db.close();
  }
});

test("the no-cursor refusal's sync-cursor command carries a hostile slug as one word", () => {
  const db = databaseWith(HOSTILE);
  try {
    for (const slug of HOSTILE) {
      setAdoptedMethod(db, slug, "ariad", () => NOW);
      const result = invokeBuilderArgv(
        db,
        [
          "pull-item",
          "--journey",
          slug,
          "--method",
          "ariad",
          "--item-code",
          "CV1",
          "--item-title",
          "A title",
          "--item-level",
          "delivery_story",
          "--why-now",
          "now",
        ],
        { nowIso: () => NOW },
      );
      assert.equal(result.exitCode, 1, result.stderr);
      const command = runLine(result.stderr);
      assert.match(command, /^mirror build sync-cursor /u);
      assert.equal(argumentAfter(pasted(command), "--journey"), slug, command);
    }
  } finally {
    db.close();
  }
});

test("build load's set-path trailer carries a hostile slug as one word", async () => {
  const db = databaseWith(HOSTILE);
  try {
    for (const slug of HOSTILE) {
      const result = await runBuildLoad(
        db,
        { slug, sessionId: null },
        { nowIso: () => NOW, newId: () => "00000001" },
      );
      assert.equal(result.exitCode, 0, result.stderr);
      const command = runLine(result.stdout);
      assert.match(command, /^mirror journey set-path /u);
      assert.equal(argumentAfter(pasted(command), "set-path"), slug, command);
    }
  } finally {
    db.close();
  }
});

test("a plain slug prints in every hint exactly as it did before quoting", () => {
  const lines = renderJourneyWithoutAdoptedMethod("mirror-ts-core").split("\n");
  assert.equal(
    lines[lines.indexOf("next action") + 1],
    "mirror build adopt --journey mirror-ts-core --method ariad",
  );
});
