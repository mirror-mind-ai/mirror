// CV21.DS7.TS2 — the Antigravity hook entries; CV9.DS8.TS6 — PreInvocation
// through the one doorman.
//
// agy speaks camelCase protojson on stdin and expects JSON on stdout
// (`injectSteps`, nested `systemMessage`); the contracts are committed bytes
// in CV21.DS7.US1's evidence (`evidence/agy-1.4.2-hook-contracts.txt`), and
// TS6's probe (`evidence/probe-20261025.md`) recorded the 1.4.7 payload. The
// fixtures here are shaped from them, never invented.
//
// The properties under test:
//
//   * agy 1.4.7 carries the turn's prompt as `lastUserInput` (1.4.2 did not).
//     With it, invocation 0 hands the turn to `mirror doorman` and answers its
//     block as ONE persistent `systemMessage` step: the full folder on the
//     explicit form (even in a conversation no SessionStart activated), a
//     delta on an ordinary turn in Mirror Mode, nothing on a skill turn or
//     outside Mirror Mode. The hook decides nothing and reads no transcript.
//   * Without it -- agy before 1.4.7 -- today's injection stands, unchanged:
//     the quiet session answers `{}`, an active one gets ONE `ephemeralMessage`
//     step (Navigator decision (b), 2026-10-25).
//   * SessionStart turns Mirror Mode on for the conversation -- the flag, the
//     session's own mode stamp, and the refresh that makes its first turn full.
//   * The `invocationNum != 0` fast path reaches nothing; payload fields stay
//     inert through argv; no payload can fail the turn.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, test } from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { openDatabaseForBootstrap } from "#db/database.ts";
import {
  type DoormanHome,
  doormanHome,
  doormanHookEnv,
  embeddingRows,
  sessionMetadata,
  sessionRow,
  snapshots,
} from "#helpers/doormanHome.ts";
import { DELIVERED_LINE_PREFIX } from "#mirror/doorman.ts";
import { upsertRuntimeSession } from "#mirror/runtimeSession.ts";
import { activateOperatingMode } from "#mode/operatingMode.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const ENTRY = join(REPO_ROOT, "ts", "src", "hooks", "main.ts");
const HOOK_BIN = join(REPO_ROOT, "bin", "mirror-hook.js");
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
      MIRROR_SESSION_ID: "",
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

/** A hook run through `bin/mirror-hook.js`, the entry the wrappers run, in the doorman's world. */
function agyHook(
  h: DoormanHome,
  name: string,
  payload: Record<string, unknown> | string,
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [HOOK_BIN, name], {
    encoding: "utf8",
    env: doormanHookEnv(h),
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    timeout: 60_000,
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

/** The one step's text, asserting it is ONE persistent `systemMessage` step. */
function systemStep(stdout: string): string {
  const parsed = JSON.parse(stdout) as { injectSteps?: Record<string, unknown>[] };
  assert.ok(parsed.injectSteps, `a step was injected, got: ${stdout.slice(0, 160)}`);
  assert.equal(parsed.injectSteps.length, 1);
  const step = parsed.injectSteps[0] ?? {};
  assert.ok(!("ephemeralMessage" in step), "the persistent step, not the ephemeral one");
  const nested = step.systemMessage as { systemMessage?: unknown } | undefined;
  assert.ok(nested && typeof nested.systemMessage === "string", "systemMessage nests its text");
  return nested.systemMessage as string;
}

function hooksLog(dir: string): string {
  const path = join(dir, "hooks.log");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

// Fixtures shaped from the evidence bytes: camelCase, common system fields.
// The transcript path names no file: the doorman path never reads one.
const COMMON = {
  conversationId: "ec33ebf9-0cba-4100-8142-c61503f6c587",
  workspacePaths: ["/path/to/workspace"],
  transcriptPath: "/path/to/workspace/.gemini/antigravity/transcript.jsonl",
  modelName: "gemini",
};
const CID = COMMON.conversationId;

describe("agy:pre-invocation through the doorman (agy 1.4.7 carries lastUserInput)", () => {
  function turn(h: DoormanHome, prompt: string, extra: Record<string, unknown> = {}) {
    // invocationNum 0 is omitted, as protojson omits a zero-valued field.
    return agyHook(h, "agy:pre-invocation", { ...COMMON, lastUserInput: prompt, ...extra });
  }

  test("the explicit form, in a conversation no SessionStart activated: ONE systemMessage step opened by the delivered line", () => {
    const h = doormanHome("agy-doorman-");
    const out = turn(h, "/mirror-mind:mm:mirror should I take the money?");
    assert.equal(out.status, 0, out.stderr);
    const text = systemStep(out.stdout);
    assert.ok(
      text.startsWith(`${DELIVERED_LINE_PREFIX}: full — answer as the mirror; sign ◇ cfo ===\n`),
      `the full folder, opened by the delivered line, got: ${text.slice(0, 120)}`,
    );
    assert.match(text, /◌ {2}MIRROR MODE ACTIVE/);
    assert.match(text, /=== persona\/cfo ===\nCFO context/);
    assert.deepEqual(sessionRow(h.dbPath, CID), {
      mirror_active: 1,
      persona: "cfo",
      journey: "mirror",
    });
    // The payload's transcript path names no file, and nothing was recorded:
    // the hook read the prompt from the payload, never from a transcript.
    assert.equal(hooksLog(h.dir), "");
  });

  test("a new conversation: the first ordinary turn is the full folder; another domain is a delta, signed, one embedding", () => {
    const h = doormanHome("agy-doorman-");
    agyHook(h, "agy:session-start", { ...COMMON, lastUserInput: "should I take the money?" });

    const first = systemStep(turn(h, "should I take the money?").stdout);
    assert.ok(
      first.startsWith(`${DELIVERED_LINE_PREFIX}: full — answer as the mirror; sign ◇ cfo ===\n`),
      `SessionStart's refresh makes the first turn full, got: ${first.slice(0, 120)}`,
    );
    assert.equal(sessionMetadata(h.dbPath, CID).doorman_refresh, undefined, "and is answered");

    const before = embeddingRows(h.dbPath);
    const second = systemStep(turn(h, "help me with the article draft").stdout);
    assert.ok(
      second.startsWith(
        `${DELIVERED_LINE_PREFIX}: delta (persona: writer · journey: mirror) — answer as the mirror; sign ◇ writer ===\n`,
      ),
      `a delta naming writer, got: ${second.slice(0, 160)}`,
    );
    assert.match(second, /=== persona\/writer ===\nWriter context/);
    assert.doesNotMatch(second, /MIRROR MODE ACTIVE|=== user\/identity ===|=== ego\//);
    assert.equal(embeddingRows(h.dbPath), before + 1, "one embedding for the turn");

    const third = systemStep(turn(h, "and the next draft?").stdout);
    assert.ok(third.startsWith(`${DELIVERED_LINE_PREFIX}: delta (persona: writer`));
    assert.doesNotMatch(third, /=== persona\/|MIRROR MODE ACTIVE/);
  });

  test("a skill turn in Mirror Mode answers {} and pays no embedding", () => {
    const h = doormanHome("agy-doorman-");
    agyHook(h, "agy:session-start", COMMON);
    turn(h, "should I take the money?");
    const before = embeddingRows(h.dbPath);

    const out = turn(h, "/mirror-mind:mm:build mirror");
    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.stdout.trim(), "{}");
    assert.equal(embeddingRows(h.dbPath), before);
  });

  test("outside Mirror Mode an ordinary turn answers {}: nothing written, no snapshot taken", () => {
    const h = doormanHome("agy-doorman-");
    const out = turn(h, "how do I split this module");
    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.stdout.trim(), "{}");
    assert.equal(sessionRow(h.dbPath, CID), undefined, "no row was created");
    assert.deepEqual(snapshots(h.dir), [], "no live-write snapshot");
  });

  test("a conversation switched to Builder Mode gets nothing on an ordinary turn", () => {
    const h = doormanHome("agy-doorman-");
    agyHook(h, "agy:session-start", COMMON);
    turn(h, "should I take the money?");
    const db = openDatabaseForBootstrap(h.dbPath);
    activateOperatingMode(db, { mode: "Builder Mode", journey: "mirror", sessionId: CID }, "t9");
    db.close();
    const before = embeddingRows(h.dbPath);

    const out = turn(h, "help me with the article draft");
    assert.equal(out.stdout.trim(), "{}", "a Builder turn gets no delta");
    assert.equal(embeddingRows(h.dbPath), before, "and pays no embedding");
  });

  test("a global Builder stamp does not silence a new conversation: SessionStart stamps the session's own mode", () => {
    const h = doormanHome("agy-doorman-");
    // The last mode written anywhere on this home was Builder, with no session
    // named: the global row. The doorman reads the session's own stamp first.
    const db = openDatabaseForBootstrap(h.dbPath);
    activateOperatingMode(db, { mode: "Builder Mode", journey: "mirror" }, "t0");
    db.close();

    agyHook(h, "agy:session-start", COMMON);
    const text = systemStep(turn(h, "should I take the money?").stdout);
    assert.ok(text.startsWith(`${DELIVERED_LINE_PREFIX}: full`), text.slice(0, 120));
  });

  test("payload fields stay inert: flag- and shell-shaped prompts and ids cannot forge argv or fail the turn", () => {
    const h = doormanHome("agy-doorman-");
    agyHook(h, "agy:session-start", COMMON);
    turn(h, "should I take the money?");

    // A prompt that is exactly a flag is read as the prompt: `--session-id`
    // goes first in the argv, and the route reads a flag's first occurrence.
    // Read as the flag instead, the doorman would name a session no one
    // started and answer {}; read as the prompt, it is this session's delta.
    const flag = systemStep(turn(h, "--session-id").stdout);
    assert.ok(flag.startsWith(`${DELIVERED_LINE_PREFIX}: delta`), flag.slice(0, 120));

    for (const prompt of ["$(whoami)", 'x"; rm -rf /tmp/x; echo "', "a\nb", "--forget"]) {
      const out = turn(h, prompt);
      assert.equal(out.status, 0, out.stderr);
      JSON.parse(out.stdout); // a step or {}, never a broken answer
    }
    for (const hostile of ["--prompt", 'x"; rm -rf /tmp/x; echo "', "$(whoami)", "a\nb"]) {
      const out = agyHook(h, "agy:pre-invocation", {
        ...COMMON,
        conversationId: hostile,
        lastUserInput: "/mirror-mind:mm:mirror should I take the money?",
      });
      assert.equal(out.status, 0, out.stderr);
      JSON.parse(out.stdout);
    }
    const log = hooksLog(h.dir);
    assert.ok(!/whoami|rm -rf|money/.test(log), log);
  });

  test("a doorman that cannot run answers {} and records the fact, never the prompt", () => {
    const h = doormanHome("agy-doorman-");
    writeFileSync(h.dbPath, "this is not a database");
    const out = turn(h, "/mirror-mind:mm:mirror should I take the money?");
    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.stdout.trim(), "{}");
    const lines = hooksLog(h.dir).split("\n").filter(Boolean);
    assert.equal(lines.length, 1, lines.join("\n"));
    assert.match(lines[0] ?? "", /agy:pre-invocation/);
    assert.doesNotMatch(lines[0] ?? "", /money|mirror-mind:mm:mirror/);
  });
});

describe("agy:pre-invocation, the gate and the pre-1.4.7 path (no lastUserInput)", () => {
  test("invocationNum != 0 answers {} without touching the database", () => {
    const home = initializedHome();
    // init creates no database; the fast path must not either — with the
    // prompt in the payload or without it: the gate comes first.
    for (const payload of [
      { ...COMMON, invocationNum: 3, initialNumSteps: 10 },
      { ...COMMON, invocationNum: 3, initialNumSteps: 10, lastUserInput: "/mm-mirror hi" },
    ]) {
      const { stdout } = runHook("agy:pre-invocation", JSON.stringify(payload), home);
      assert.equal(stdout.trim(), "{}");
      assert.throws(() => readFileSync(join(home, "memory.db")), /ENOENT/);
    }
  });

  test("the quiet session answers {} — unbound, and bound with Mirror Mode off", () => {
    const home = initializedHome();
    // Unbound: no runtime session row for the conversation. invocationNum 0
    // may also arrive ABSENT: protojson omits zero-valued fields, so absence
    // passes the gate as 0 does.
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
    // The pre-1.4.7 path keeps its step: the ephemeral one, re-injected whole
    // each turn, as before TS6.
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

describe("agy:stop", () => {
  const TWO_TURNS = resolve(
    import.meta.dirname,
    "..",
    "fixtures",
    "agy",
    "transcript-two-turns.jsonl",
  );
  const SKILL_TURN = resolve(
    import.meta.dirname,
    "..",
    "fixtures",
    "agy",
    "transcript-skill-turn.jsonl",
  );

  function messages(home: string, cid: string): { role: string; content: string; iface: string }[] {
    const db = bootstrapDatabase(join(home, "memory.db"));
    try {
      return db
        .prepare(
          "SELECT m.role, m.content, c.interface AS iface FROM messages m " +
            "JOIN conversations c ON c.id = m.conversation_id " +
            "JOIN runtime_sessions r ON r.conversation_id = c.id " +
            "WHERE r.session_id = ? ORDER BY m.created_at, m.rowid",
        )
        .all(cid) as { role: string; content: string; iface: string }[];
    } finally {
      db.close();
    }
  }

  test("logs both turns as antigravity, each reply beside its prompt", () => {
    const home = initializedHome();
    bootstrapDatabase(join(home, "memory.db")).close();
    const { stdout } = runHook(
      "agy:stop",
      JSON.stringify({ ...COMMON, transcriptPath: TWO_TURNS }),
      home,
    );
    assert.equal(stdout.trim(), "{}");
    assert.deepEqual(
      messages(home, COMMON.conversationId).map((m) => `${m.iface}|${m.role}|${m.content}`),
      [
        "antigravity|user|Hello there",
        "antigravity|assistant|Hi! How can I help?",
        "antigravity|user|What is 2+2?",
        "antigravity|assistant|It is 4.",
      ],
    );
  });

  test("a re-fired Stop on the same transcript logs nothing new (idempotent, step_index high-water)", () => {
    const home = initializedHome();
    bootstrapDatabase(join(home, "memory.db")).close();
    const payload = JSON.stringify({ ...COMMON, transcriptPath: TWO_TURNS });
    runHook("agy:stop", payload, home);
    runHook("agy:stop", payload, home);
    assert.equal(messages(home, COMMON.conversationId).length, 4);
  });

  test("a skill turn is not logged as conversation", () => {
    const home = initializedHome();
    bootstrapDatabase(join(home, "memory.db")).close();
    runHook("agy:stop", JSON.stringify({ ...COMMON, transcriptPath: SKILL_TURN }), home);
    assert.equal(messages(home, COMMON.conversationId).length, 0);
  });

  test("an absent transcript answers {} and logs nothing, never fails the turn", () => {
    const home = initializedHome();
    bootstrapDatabase(join(home, "memory.db")).close();
    const { stdout } = runHook(
      "agy:stop",
      JSON.stringify({ ...COMMON, transcriptPath: join(home, "nope.jsonl") }),
      home,
    );
    assert.equal(stdout.trim(), "{}");
    assert.equal(messages(home, COMMON.conversationId).length, 0);
  });

  test("a returning SessionStart closes the prior conversation as a stale orphan", () => {
    // agy has no SessionEnd, so an agy-only machine closes a conversation
    // only when the next session's SessionStart sweeps it (amendment g).
    const home = initializedHome();
    bootstrapDatabase(join(home, "memory.db")).close();
    runHook("agy:stop", JSON.stringify({ ...COMMON, transcriptPath: TWO_TURNS }), home);

    const openBefore = (): number => {
      const db = bootstrapDatabase(join(home, "memory.db"));
      try {
        return (
          db
            .prepare(
              "SELECT COUNT(*) AS n FROM conversations c JOIN runtime_sessions r " +
                "ON r.conversation_id = c.id WHERE r.session_id = ? AND c.ended_at IS NULL",
            )
            .get(COMMON.conversationId) as { n: number }
        ).n;
      } finally {
        db.close();
      }
    };
    assert.equal(openBefore(), 1, "the conversation is open after the turn");

    // A returning session start with the orphan threshold at 0 closes it.
    execFileSync(process.execPath, ["--no-warnings", CLI, "conversation-logger", "session-start"], {
      encoding: "utf8",
      env: {
        ...process.env,
        MIRROR_HOME: home,
        MIRROR_USER: "",
        DB_PATH: join(home, "memory.db"),
        MEMORY_ENV: "production",
        MIRROR_STALE_ORPHAN_MINUTES: "0",
        OPENROUTER_API_KEY: "",
      },
      timeout: 60_000,
    });
    assert.equal(
      openBefore(),
      0,
      "the prior conversation is closed after the returning session start",
    );
  });
});

describe("agy:session-start", () => {
  test("turns Mirror Mode on for the conversation: the flag, its own mode stamp, and the refresh", () => {
    // SessionStart is agy's one activation point (CV21.DS7.US4's scope
    // change): the doorman reads a session as in Mirror Mode only while its
    // operating mode says so -- its own stamp, else the global one -- so the
    // flag alone would leave a new conversation at the mercy of whatever mode
    // was last stamped globally. The refresh makes its first turn the full
    // folder, routed from that turn's prompt (CV9.DS8.TS6).
    const h = doormanHome("agy-session-start-");
    for (const round of ["fresh", "returning"]) {
      const out = agyHook(h, "agy:session-start", COMMON);
      assert.equal(out.stdout.trim(), "{}", round);
      assert.equal(sessionRow(h.dbPath, CID)?.mirror_active, 1, round);
      const metadata = sessionMetadata(h.dbPath, CID);
      assert.equal(
        (metadata.operating_mode as { active_mode?: string } | undefined)?.active_mode,
        "Mirror Mode",
        round,
      );
      assert.equal(metadata.doorman_refresh, true, round);
      // The full turn answers the refresh, so the returning round sees it set again.
      agyHook(h, "agy:pre-invocation", { ...COMMON, lastUserInput: "should I take the money?" });
      assert.equal(sessionMetadata(h.dbPath, CID).doorman_refresh, undefined, round);
    }
  });

  test("without lastUserInput, a following pre-invocation injects today's ephemeral context", () => {
    const home = initializedHome();
    bootstrapDatabase(join(home, "memory.db")).close();
    runHook("agy:session-start", JSON.stringify(COMMON), home);
    // A following pre-invocation for the same conversation now injects.
    const { stdout } = runHook(
      "agy:pre-invocation",
      JSON.stringify({ ...COMMON, invocationNum: 0 }),
      home,
    );
    const parsed = JSON.parse(stdout) as { injectSteps?: { ephemeralMessage?: string }[] };
    assert.ok(parsed.injectSteps && parsed.injectSteps.length === 1, "context was injected");
    assert.ok(typeof parsed.injectSteps[0]?.ephemeralMessage === "string");
  });

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
