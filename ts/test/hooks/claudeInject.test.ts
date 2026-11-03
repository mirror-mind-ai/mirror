// CV9.DS8.US4: the Claude-family inject hook calls the one doorman.
//
// Until this story the hook carried a policy of its own: the explicit form
// loaded the folder, and a session in Mirror Mode was loaded once more and
// then marked `hook_injected` (a column migration 018 dropped). Neither block carried the line the skill reads
// (TS3), so every explicit turn loaded twice; and once the once-injection was
// spent, a follow-up in another domain re-routed nothing. Now the hook hands
// the prompt and the session to `mirror doorman` and writes back what it
// delivers -- the decision table below is TS2's, seen from the hook.
//
// Driven through `bin/mirror-hook.js claude:inject`, the entry the wrappers
// run, against a scratch home: these are the bytes Claude Code and Codex get
// as additional context. The home is the shared doorman fixture
// (`#helpers/doormanHome.ts`), the world Antigravity's hook is measured in too
// (CV9.DS8.TS6).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { describe, test } from "node:test";
import { openDatabaseForBootstrap, openDatabaseReadOnly } from "#db/database.ts";
import {
  type DoormanHome,
  doormanHome,
  doormanHookEnv,
  embeddingRows,
  sessionRow as session,
  snapshots,
} from "#helpers/doormanHome.ts";
import { DELIVERED_LINE_PREFIX } from "#mirror/doorman.ts";
import { activateOperatingMode } from "#mode/operatingMode.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const HOOK_BIN = join(REPO_ROOT, "bin", "mirror-hook.js");

function home(): DoormanHome {
  return doormanHome("mirror-claude-inject-");
}

function inject(
  h: DoormanHome,
  payload: Record<string, unknown>,
  extraEnv: Record<string, string> = {},
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [HOOK_BIN, "claude:inject"], {
    encoding: "utf8",
    env: doormanHookEnv(h, extraEnv),
    input: JSON.stringify(payload),
    timeout: 60_000,
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

describe("the inject hook calls the doorman", () => {
  test("the explicit form: the full folder, opened by the delivered line, and the session marked active", () => {
    const h = home();
    const out = inject(h, { session_id: "S", prompt: "/mm:mirror should I take the money?" });
    assert.equal(out.status, 0, out.stderr);
    assert.ok(
      out.stdout.startsWith(
        `${DELIVERED_LINE_PREFIX}: full — answer as the mirror; sign ◇ cfo ===\n`,
      ),
      `stdout opens with the delivered line, got: ${out.stdout.slice(0, 120)}`,
    );
    assert.match(out.stdout, /◌ {2}MIRROR MODE ACTIVE/);
    assert.match(out.stdout, /=== persona\/cfo ===\nCFO context/);
    assert.deepEqual(session(h.dbPath, "S"), {
      mirror_active: 1,
      persona: "cfo",
      journey: "mirror",
    });
  });

  test("an ordinary turn in Mirror Mode: a delta, the newly routed persona, one embedding, no identity layer", () => {
    const h = home();
    inject(h, { session_id: "S", prompt: "/mm:mirror should I take the money?" });
    const before = embeddingRows(h.dbPath);

    const out = inject(h, { session_id: "S", prompt: "help me with the article draft" });
    assert.equal(out.status, 0, out.stderr);
    assert.ok(
      out.stdout.startsWith(
        `${DELIVERED_LINE_PREFIX}: delta (persona: writer · journey: mirror) — answer as the mirror; sign ◇ writer ===\n`,
      ),
      `a delta naming writer, got: ${out.stdout.slice(0, 160)}`,
    );
    assert.match(out.stdout, /=== persona\/writer ===\nWriter context/);
    assert.doesNotMatch(out.stdout, /MIRROR MODE ACTIVE|=== user\/identity ===|=== ego\//);
    assert.equal(session(h.dbPath, "S")?.persona, "writer");
    assert.equal(embeddingRows(h.dbPath), before + 1, "one embedding for the turn");

    // The same domain again: the line names the session's persona, no section, and
    // -- the old hook's once-injection gone -- no second folder either.
    const same = inject(h, { session_id: "S", prompt: "and the next draft?" });
    assert.ok(same.stdout.startsWith(`${DELIVERED_LINE_PREFIX}: delta (persona: writer`));
    assert.doesNotMatch(same.stdout, /=== persona\/|MIRROR MODE ACTIVE/);
  });

  test("Mirror Mode off: nothing printed, nothing written, no snapshot taken", () => {
    const h = home();
    const out = inject(h, { session_id: "S", prompt: "how do I split this module" });
    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.stdout, "");
    assert.equal(session(h.dbPath, "S"), undefined, "no row was created");
    assert.deepEqual(snapshots(h.dir), [], "no live-write snapshot");
  });

  test("Mirror Mode active but the session switched to Builder Mode: nothing (the mixed-mode finding)", () => {
    const h = home();
    inject(h, { session_id: "S", prompt: "/mm:mirror should I take the money?" });
    const db = openDatabaseForBootstrap(h.dbPath);
    activateOperatingMode(db, { mode: "Builder Mode", journey: "mirror", sessionId: "S" }, "t9");
    db.close();
    const before = embeddingRows(h.dbPath);

    const out = inject(h, { session_id: "S", prompt: "help me with the article draft" });
    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.stdout, "", "a Builder turn gets no delta");
    assert.equal(embeddingRows(h.dbPath), before, "and pays no embedding");
    assert.equal(session(h.dbPath, "S")?.persona, "cfo", "and moves no persona");

    // Re-entry: the explicit form stamps the session Mirror Mode again, and the
    // deltas resume.
    inject(h, { session_id: "S", prompt: "/mm:mirror back to the money question" });
    const resumed = inject(h, { session_id: "S", prompt: "help me with the article draft" });
    assert.ok(
      resumed.stdout.startsWith(`${DELIVERED_LINE_PREFIX}: delta`),
      "deltas resume after re-entry",
    );
  });

  test("a Grok-shaped payload returns before any load (CR143)", () => {
    const h = home();
    const out = inject(h, {
      session_id: "S",
      prompt: "/mm-mirror should I take the money?",
      hookEventName: "UserPromptSubmit",
      promptId: "p-1",
    });
    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.stdout, "");
    assert.equal(session(h.dbPath, "S"), undefined);
  });

  test("no session_id: the warning stays on stderr, and the explicit form still delivers, unnamed", () => {
    const h = home();
    const out = inject(h, { prompt: "/mm:mirror should I take the money?" });
    assert.equal(out.status, 0);
    assert.match(out.stderr, /no session_id/);
    assert.ok(out.stdout.startsWith(`${DELIVERED_LINE_PREFIX}: full`));
    const db = openDatabaseReadOnly(h.dbPath);
    const named = db
      .prepare(
        "SELECT COUNT(*) AS n FROM runtime_sessions WHERE mirror_active = 1 AND session_id NOT LIKE '\\_\\_%' ESCAPE '\\'",
      )
      .get()?.n;
    db.close();
    assert.equal(Number(named), 0, "no session was marked");
  });
});
