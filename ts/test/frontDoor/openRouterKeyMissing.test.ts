// CR187 — a missing OPENROUTER_API_KEY, through the real front door.
//
// Before: `consult`, `journal`, and `week plan` reached Node as a stack trace that
// named no file; `journal` lost the entry after copying the whole database into its
// pre-write snapshot; `descriptor generate` reported "skipped (empty response)" for
// every persona; and a keyless `consolidate scan` blamed the memories. Now each
// command that cannot work without the key refuses before it does anything, in one
// line that says what was not done and where the key goes.

import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { spawnFrontDoor } from "#helpers/frontDoor.ts";
import { tempDir } from "#helpers/tempDir.ts";

// Live mode for every family touched here, whatever the caller's environment says.
const LIVE = {
  MIRROR_TS_JOURNAL_LLM_REPLAY: "",
  MIRROR_TS_JOURNAL_EMBEDDING_REPLAY: "",
  MIRROR_TS_WEEK_LLM_REPLAY: "",
  MIRROR_TS_CONSULT_LLM_REPLAY: "",
  MIRROR_TS_CREDITS_REPLAY: "",
  MIRROR_TS_DESCRIPTOR_LLM_REPLAY: "",
  MIRROR_TS_CULTIVATION_LLM_REPLAY: "",
  MIRROR_TS_CULTIVATION_EMBEDDING_REPLAY: "",
  MIRROR_TS_SEARCH_EMBEDDING_REPLAY: "",
};

interface KeylessHome {
  env: Record<string, string>;
  config: string;
  backups: string;
  db: string;
}

/**
 * A seeded home, selected in the environment, with no key. The key is the EMPTY
 * string, never unset: on a developer machine this checkout's `.env` supplies a
 * real one to an unset variable. No config file exists, as on a clone whose `.env`
 * selects the user.
 */
function keylessHome(): KeylessHome {
  const home = tempDir("cr187-keyless-");
  const env = {
    HOME: home,
    MIRROR_USER: "probe",
    MIRROR_HOME: "",
    XDG_CONFIG_HOME: "",
    OPENROUTER_API_KEY: "",
    MEMORY_ENV: "",
    ...LIVE,
  };
  for (const args of [["init", "probe"], ["seed"]]) {
    const made = spawnFrontDoor(args, env);
    assert.equal(made.status, 0, made.stderr);
  }
  const userHome = join(home, ".mirror-minds", "probe");
  return {
    env,
    config: join(home, ".config", "mirror", "env"),
    backups: join(userHome, "backups"),
    db: join(userHome, "memory.db"),
  };
}

/** Run `args` with no backups directory, and assert it refused before doing anything. */
function refusedBeforeAnyWork(home: KeylessHome, args: string[], consequence: string): void {
  rmSync(home.backups, { recursive: true, force: true });
  const result = spawnFrontDoor(args, home.env);
  const command = args.join(" ");
  assert.equal(result.status, 2, `${command}: ${result.stderr}`);
  assert.equal(result.stdout, "", command);
  const lines = result.stderr.trimEnd().split("\n");
  assert.equal(lines.length, 1, `${command}: one line, no stack trace\n${result.stderr}`);
  assert.equal(
    lines[0],
    `Error: ${consequence}, because OPENROUTER_API_KEY is not configured. ` +
      `Add OPENROUTER_API_KEY=<your key> to ${home.config} ` +
      `(a new file; make it readable only by you: chmod 600 ${home.config}), ` +
      "then run the same command again.",
    command,
  );
  // The pre-write snapshot is the first thing a write takes: its absence is the
  // proof that the command stopped before the database was opened.
  assert.ok(!existsSync(home.backups), `${command}: no pre-write snapshot`);
}

function memoryCount(db: string): number {
  const handle = new DatabaseSync(db, { readOnly: true });
  try {
    return Number((handle.prepare("SELECT COUNT(*) AS n FROM memories").get() as { n: number }).n);
  } finally {
    handle.close();
  }
}

test("`journal` says the entry was not saved, and keeps nothing", () => {
  const home = keylessHome();
  const before = memoryCount(home.db);
  refusedBeforeAnyWork(
    home,
    ["journal", "a note about the day"],
    "the journal entry was not saved",
  );
  assert.equal(memoryCount(home.db), before);
});

test("`consult` ask refuses before it opens its ledger database", () => {
  // Its ledger open used to take the snapshot ahead of any provider.
  const home = keylessHome();
  refusedBeforeAnyWork(home, ["consult", "openai/gpt-5-mini", "hello"], "nothing was done");
});

test("the other commands that cannot work without the key refuse the same way", () => {
  const home = keylessHome();
  for (const args of [
    ["week", "plan", "Monday: write"],
    ["consult", "credits"],
    ["descriptor", "generate"],
    ["consolidate", "scan"],
    ["shadow", "scan"],
  ]) {
    refusedBeforeAnyWork(home, args, "nothing was done");
  }
});
