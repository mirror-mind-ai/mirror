// CV9.E2.S32 — `conversation-logger session-start --fast --welcome --format json`.
//
// The composite the Pi extension calls at session open: one process for the
// write (`session-start --fast`) and the two reads (`welcome`, `welcome
// --status-line`) that depend on it. The CLI half runs the REAL front door in
// a child process, so routing, dispatch, the live write path, and the
// front-door log are all on the path; byte-identity is graded against the
// standalone commands run against the same home. The unit half injects a
// throwing renderer to grade the one failure mode the CLI cannot provoke.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { openDatabaseReadOnly } from "#db/database.ts";
import { openLiveWriteDatabase } from "#frontDoor/liveBackup.ts";
import {
  runSessionStartWelcomeRoute,
  SESSION_START_WELCOME_SCHEMA_VERSION,
  type SessionStartWelcomeEnvelope,
} from "#frontDoor/sessionStartWelcomeRoute.ts";

const CLI = new URL("../../src/frontDoor/cli.ts", import.meta.url).pathname;

/** Where `setMute` keeps its flag: beside the database (`logger.ts`). */
function muteFlagPath(home: string): string {
  return join(home, "mute");
}

interface Fixture {
  root: string;
  home: string;
  cleanup: () => void;
}

function fixture(): Fixture {
  const root = realpathSync(mkdtempSync("/tmp/session-start-welcome-"));
  const home = join(root, "mirror-home");
  mkdirSync(home, { recursive: true });
  bootstrapDatabase(join(home, "memory.db")).close();
  return { root, home, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function runCli(f: Fixture, args: readonly string[], env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: f.root,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: f.root,
      NODE_OPTIONS: "--no-warnings",
      MIRROR_HOME: f.home,
      MIRROR_USER: "mirror-home",
      MEMORY_ENV: "",
      MIRROR_WELCOME_REMOTE_UPDATE_CHECK: "off",
      ...env,
    },
  });
  return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function frontDoorLogLines(f: Fixture): string[] {
  const path = join(f.home, "front-door.log");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean);
}

const COMPOSITE = [
  "conversation-logger",
  "session-start",
  "--fast",
  "--welcome",
  "--format",
  "json",
  "--session-id",
  "pi-session-1",
];

test("the composite emits one JSON line whose fields equal the three standalone commands", () => {
  const f = fixture();
  try {
    const standaloneStart = runCli(f, ["conversation-logger", "session-start", "--fast"]);
    const standaloneWelcome = runCli(f, ["welcome"]);
    const standaloneStatus = runCli(f, [
      "welcome",
      "--status-line",
      "--session-id",
      "pi-session-1",
    ]);
    assert.equal(standaloneStart.status, 0, standaloneStart.stderr);

    const result = runCli(f, COMPOSITE);
    assert.equal(result.status, 0, result.stderr);
    const lines = result.stdout.split("\n").filter(Boolean);
    assert.equal(lines.length, 1, "exactly one stdout line");
    const envelope = JSON.parse(lines[0] as string) as SessionStartWelcomeEnvelope;

    assert.equal(envelope.schemaVersion, SESSION_START_WELCOME_SCHEMA_VERSION);
    assert.equal(`${envelope.sessionStart}\n`, standaloneStart.stdout);
    assert.equal(`${envelope.welcome}\n`, standaloneWelcome.stdout);
    assert.equal(`${envelope.statusLine}\n`, standaloneStatus.stdout);
    assert.match(envelope.welcome, /◇ Mirror · mirror-home/);
    assert.match(envelope.statusLine, /Mirror Mode/);
  } finally {
    f.cleanup();
  }
});

test("the write really happened before the reads: mute cleared, orientation reset", () => {
  const f = fixture();
  try {
    assert.equal(runCli(f, ["conversation-logger", "mute"]).status, 0);
    assert.ok(existsSync(muteFlagPath(f.home)), "muted before the composite");
    // Activate the global mode so `resetSessionOrientation` has something to
    // undo; the standalone status line would show Builder until then.
    const activate = runCli(f, ["mode", "activate", "Builder Mode"]);
    assert.equal(activate.status, 0, activate.stderr);
    assert.match(runCli(f, ["welcome", "--status-line"]).stdout, /Builder Mode/);

    const result = runCli(f, [
      "conversation-logger",
      "session-start",
      "--fast",
      "--welcome",
      "--format",
      "json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!existsSync(muteFlagPath(f.home)), "the composite unmuted");
    const envelope = JSON.parse(result.stdout) as SessionStartWelcomeEnvelope;
    // The status line read the reset orientation, not the activated one.
    assert.match(envelope.statusLine, /Mirror Mode/);
    assert.doesNotMatch(envelope.statusLine, /Builder Mode/);
  } finally {
    f.cleanup();
  }
});

test("welcome disabled by env: both renders are empty, the session start still answers", () => {
  const f = fixture();
  try {
    const result = runCli(f, COMPOSITE, { MIRROR_WELCOME: "off" });
    assert.equal(result.status, 0, result.stderr);
    const envelope = JSON.parse(result.stdout) as SessionStartWelcomeEnvelope;
    assert.equal(envelope.welcome, "");
    assert.equal(envelope.statusLine, "");
    assert.equal(envelope.sessionStart, "Conversation logging ACTIVE. Maintenance deferred.");
    assert.ok(!existsSync(muteFlagPath(f.home)));
  } finally {
    f.cleanup();
  }
});

test("--welcome without --fast refuses with one stderr line and writes nothing", () => {
  const f = fixture();
  try {
    assert.equal(runCli(f, ["conversation-logger", "mute"]).status, 0);
    const result = runCli(f, [
      "conversation-logger",
      "session-start",
      "--welcome",
      "--format",
      "json",
    ]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.split("\n").filter(Boolean).length, 1);
    assert.match(result.stderr, /requires --fast/);
    assert.ok(existsSync(muteFlagPath(f.home)), "still muted: no write happened");
  } finally {
    f.cleanup();
  }
});

test("--welcome without --format json refuses with one stderr line and writes nothing", () => {
  const f = fixture();
  try {
    assert.equal(runCli(f, ["conversation-logger", "mute"]).status, 0);
    const result = runCli(f, ["conversation-logger", "session-start", "--fast", "--welcome"]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.split("\n").filter(Boolean).length, 1);
    assert.match(result.stderr, /requires --format json/);
    assert.ok(existsSync(muteFlagPath(f.home)), "still muted: no write happened");
  } finally {
    f.cleanup();
  }
});

test("an unresolvable home answers exactly as the standalone session-start does, with no stdout", () => {
  const f = fixture();
  try {
    const unresolved = { MIRROR_HOME: "", MIRROR_USER: "", MEMORY_DIR: "", DB_PATH: "" };
    const standalone = runCli(f, ["conversation-logger", "session-start", "--fast"], unresolved);
    const composite = runCli(f, COMPOSITE, unresolved);
    assert.notEqual(standalone.status, 0);
    assert.equal(composite.status, standalone.status);
    assert.equal(composite.stderr, standalone.stderr);
    assert.equal(composite.stdout, "");
  } finally {
    f.cleanup();
  }
});

test("the front-door log carries exactly one entry for the composite process", () => {
  const f = fixture();
  try {
    const result = runCli(f, COMPOSITE);
    assert.equal(result.status, 0, result.stderr);
    const lines = frontDoorLogLines(f);
    assert.equal(lines.length, 1, lines.join("\n"));
    assert.match(lines[0] as string, /\tconversation-logger\t/);
    assert.match(lines[0] as string, /exit=0/);
    // Metadata only: no session id, no card text.
    assert.doesNotMatch(lines[0] as string, /pi-session-1|Where shall we begin/);
  } finally {
    f.cleanup();
  }
});

test("a render failure after the write keeps the write and still emits the envelope", async () => {
  const f = fixture();
  try {
    assert.equal(runCli(f, ["conversation-logger", "mute"]).status, 0);
    const dbPath = join(f.home, "memory.db");
    let stdout = "";
    const outcome = await runSessionStartWelcomeRoute(
      ["conversation-logger", "session-start", "--fast", "--welcome", "--format", "json"],
      {
        withMirrorWriteDb: async (_argv, write) => {
          const db = openLiveWriteDatabase(dbPath);
          try {
            return await write(db, dbPath);
          } finally {
            db.close();
          }
        },
        renderWelcome: () => {
          throw new RangeError("boom");
        },
        stdout: (text) => (stdout += text),
        stderr: () => {},
      },
    );
    assert.equal(outcome.exitCode, 0);
    assert.equal(outcome.detail, "render-failed=RangeError");
    assert.ok(!existsSync(muteFlagPath(f.home)), "the unmute stands");
    const envelope = JSON.parse(stdout) as SessionStartWelcomeEnvelope;
    assert.equal(envelope.sessionStart, "Conversation logging ACTIVE. Maintenance deferred.");
    assert.equal(envelope.welcome, "");
    assert.equal(envelope.statusLine, "");
    // The write handle was closed before the reads: the database is readable.
    openDatabaseReadOnly(dbPath).close();
  } finally {
    f.cleanup();
  }
});
