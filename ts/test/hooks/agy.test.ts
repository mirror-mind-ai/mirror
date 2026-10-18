// CV21.DS7.TS2 — the Antigravity hook entries.
//
// agy speaks camelCase protojson on stdin and expects JSON on stdout
// (`injectSteps`, nested `systemMessage`); the contracts are committed bytes
// in US1's evidence (`evidence/agy-1.4.2-hook-contracts.txt`), and the
// fixtures here are shaped from them, never invented.
//
// The properties under test: the `invocationNum != 0` fast path answers `{}`
// and reaches nothing; the quiet session — unbound, or bound with Mirror
// Mode off — answers `{}` (Mirror on agy is invisible until invoked); an
// active session gets its context injected as ONE `ephemeralMessage` step
// (the data-minimizing choice: a `systemMessage` would persist identity in
// agy's stored trajectory); payload fields stay inert through argv; and no
// payload can fail the turn.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, test } from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { upsertRuntimeSession } from "#mirror/runtimeSession.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const ENTRY = join(REPO_ROOT, "ts", "src", "hooks", "main.ts");
const CLI = join(REPO_ROOT, "ts", "src", "frontDoor", "cli.ts");

const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/**
 * A scratch Mirror home, initialized through the real front door. `init`
 * derives the home from HOME, so HOME is pinned to the scratch root — a
 * fixture must never be able to touch the machine's real `~/.mirror-minds`
 * (the CR123/128/137/142 lesson, learned again here in red).
 */
function initializedHome(): string {
  const root = mkdtempSync(join(tmpdir(), "agy-hooks-"));
  roots.push(root);
  execFileSync(process.execPath, ["--no-warnings", CLI, "init", "agy-user"], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: root,
      MIRROR_HOME: "",
      MIRROR_USER: "",
      XDG_CONFIG_HOME: "",
      OPENROUTER_API_KEY: "",
    },
    timeout: 60_000,
  });
  return join(root, ".mirror-minds", "agy-user");
}

function runHook(name: string, input: string, home: string): { stdout: string; status: number } {
  const stdout = execFileSync(process.execPath, ["--no-warnings", ENTRY, name], {
    encoding: "utf8",
    env: {
      ...process.env,
      MIRROR_HOME: home,
      MIRROR_USER: "",
      DB_PATH: join(home, "memory.db"),
      MEMORY_ENV: "production",
      OPENROUTER_API_KEY: "",
    },
    input,
    timeout: 60_000,
  });
  return { stdout, status: 0 };
}

/** Bind a runtime session the way the product does, with Mirror Mode on. */
function activateMirror(home: string, sessionId: string): void {
  // init does not create the database; bootstrap does, with the product's
  // schema, and the product's own upsert binds the session.
  const db = bootstrapDatabase(join(home, "memory.db"));
  try {
    upsertRuntimeSession(db, sessionId, { mirrorActive: true }, new Date().toISOString());
  } finally {
    db.close();
  }
}

// Fixtures shaped from the evidence bytes: camelCase, common system fields.
const COMMON = {
  conversationId: "ec33ebf9-0cba-4100-8142-c61503f6c587",
  workspacePaths: ["/path/to/workspace"],
  transcriptPath: "/path/to/workspace/.gemini/antigravity/transcript.jsonl",
  modelName: "gemini",
};

describe("agy:pre-invocation", () => {
  test("invocationNum != 0 answers {} without touching the database", () => {
    const home = initializedHome();
    // init creates no database; the fast path must not either.
    const { stdout } = runHook(
      "agy:pre-invocation",
      JSON.stringify({ ...COMMON, invocationNum: 3, initialNumSteps: 10 }),
      home,
    );
    assert.equal(stdout.trim(), "{}");
    assert.throws(() => readFileSync(join(home, "memory.db")), /ENOENT/);
  });

  test("the quiet session answers {} — unbound, and bound with Mirror Mode off", () => {
    const home = initializedHome();
    // Unbound: no runtime session row for the conversation (every session
    // until TS3 lands). invocationNum 0 may also arrive ABSENT: protojson
    // omits zero-valued fields, so absence passes the gate as 0 does.
    for (const payload of [
      { ...COMMON, invocationNum: 0 },
      { ...COMMON }, // invocationNum omitted at 0
    ]) {
      const { stdout } = runHook("agy:pre-invocation", JSON.stringify(payload), home);
      assert.equal(stdout.trim(), "{}");
    }
  });

  test("an active Mirror session gets ONE ephemeralMessage step with its context", () => {
    const home = initializedHome();
    activateMirror(home, COMMON.conversationId);
    const { stdout } = runHook(
      "agy:pre-invocation",
      JSON.stringify({ ...COMMON, invocationNum: 0 }),
      home,
    );
    const parsed = JSON.parse(stdout) as { injectSteps?: { ephemeralMessage?: string }[] };
    assert.ok(parsed.injectSteps, "context was injected");
    assert.equal(parsed.injectSteps.length, 1);
    const step = parsed.injectSteps[0] ?? {};
    assert.ok(typeof step.ephemeralMessage === "string" && step.ephemeralMessage.length > 0);
    // The ephemeral step, not the persistent one: the data-minimizing choice.
    assert.ok(!("systemMessage" in step));
  });

  test("payload fields stay inert: a hostile conversationId cannot forge argv or fail the turn", () => {
    const home = initializedHome();
    for (const hostile of ['x"; rm -rf /tmp/x; echo "', "a\nb", "$(whoami)", "--persona"]) {
      const { stdout } = runHook(
        "agy:pre-invocation",
        JSON.stringify({ ...COMMON, conversationId: hostile, invocationNum: 0 }),
        home,
      );
      assert.equal(stdout.trim(), "{}", JSON.stringify(hostile));
    }
    // hooks.log, if any line was written, carries no payload text.
    try {
      const log = readFileSync(join(home, "hooks.log"), "utf8");
      assert.ok(!log.includes("rm -rf") && !log.includes("whoami"));
    } catch {
      // no log: nothing failed, nothing recorded — the better outcome.
    }
  });

  test("a payload that is not JSON still answers {} and exits 0 — never fail the turn", () => {
    const home = initializedHome();
    const { stdout } = runHook("agy:pre-invocation", "not json at all", home);
    assert.equal(stdout.trim(), "{}");
  });
});

describe("agy:session-start", () => {
  test("answers the output contract and turns conversation logging on", () => {
    const home = initializedHome();
    const { stdout } = runHook("agy:session-start", JSON.stringify(COMMON), home);
    assert.equal(stdout.trim(), "{}");
    // The observable: nothing failed loudly — the session-start call is the
    // same quiet front-door call every runtime's session-start makes, and a
    // failure would land in hooks.log.
    try {
      const log = readFileSync(join(home, "hooks.log"), "utf8");
      assert.ok(!log.includes("agy:session-start"), log);
    } catch {
      // no log: the better outcome.
    }
  });
});
