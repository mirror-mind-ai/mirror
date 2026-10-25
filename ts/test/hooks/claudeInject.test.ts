// CV9.DS8.US4: the Claude-family inject hook calls the one doorman.
//
// Until this story the hook carried a policy of its own: the explicit form
// loaded the folder, and a session in Mirror Mode was loaded once more and
// then marked `hook_injected`. Neither block carried the line the skill reads
// (TS3), so every explicit turn loaded twice; and once the once-injection was
// spent, a follow-up in another domain re-routed nothing. Now the hook hands
// the prompt and the session to `mirror doorman` and writes back what it
// delivers -- the decision table below is TS2's, seen from the hook.
//
// Driven through `bin/mirror-hook.js claude:inject`, the entry the wrappers
// run, against a scratch home: these are the bytes Claude Code and Codex get
// as additional context.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, test } from "node:test";
import { bootstrapDatabaseIfMissing } from "#db/bootstrap.ts";
import { openDatabaseForBootstrap, openDatabaseReadOnly } from "#db/database.ts";
import { DELIVERED_LINE_PREFIX } from "#mirror/doorman.ts";
import { activateOperatingMode } from "#mode/operatingMode.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const HOOK_BIN = join(REPO_ROOT, "bin", "mirror-hook.js");
const roots: string[] = [];

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function home(): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-claude-inject-"));
  roots.push(dir);
  const dbPath = join(dir, "memory.db");
  bootstrapDatabaseIfMissing(dbPath);
  const db = openDatabaseForBootstrap(dbPath);
  const insert = db.prepare(
    "INSERT INTO identity (id, layer, key, content, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, 't', 't', ?)",
  );
  insert.run("ego", "ego", "behavior", "Be useful", null);
  insert.run("user", "user", "identity", "User context", null);
  insert.run(
    "cfo",
    "persona",
    "cfo",
    "CFO context",
    JSON.stringify({ routing_keywords: ["budget", "money"] }),
  );
  insert.run(
    "writer",
    "persona",
    "writer",
    "Writer context",
    JSON.stringify({ routing_keywords: ["article", "draft"] }),
  );
  insert.run(
    "journey",
    "journey",
    "mirror",
    "# Mirror\n**Status:** active\n\n## Description\nThe mirror itself\n\n## End",
    null,
  );
  db.close();
  writeFileSync(
    join(dir, "embedding.json"),
    JSON.stringify({
      kind: "embedding",
      response: { embedding: Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0)) },
    }),
  );
  // Reception is off (MEMORY_RECEPTION=0), but the family refuses a partial
  // replay: every fixture it declares, or none. Never consulted.
  writeFileSync(
    join(dir, "llm.json"),
    JSON.stringify({ kind: "llm", responses: { reception: { content: "{}", model: "fixture" } } }),
  );
  return { dir, dbPath };
}

function inject(
  h: { dir: string; dbPath: string },
  payload: Record<string, unknown>,
  extraEnv: Record<string, string> = {},
): { stdout: string; stderr: string; status: number | null } {
  const env: Record<string, string | undefined> = {
    ...process.env,
    NODE_OPTIONS: "--no-warnings",
    MIRROR_HOME: h.dir,
    MIRROR_USER: "",
    DB_PATH: h.dbPath,
    MEMORY_ENV: "production",
    MEMORY_RECEPTION: "0",
    MIRROR_TS_MIRROR_EMBEDDING_REPLAY: join(h.dir, "embedding.json"),
    MIRROR_TS_MIRROR_LLM_REPLAY: join(h.dir, "llm.json"),
    OPENROUTER_API_KEY: "",
    // An empty string is "unset" to the session reader (it trims) but a set
    // key is "Grok" to the runtime detector, so those two are deleted below.
    CLAUDE_CODE_SESSION_ID: "",
    CODEX_SESSION_ID: "",
    MIRROR_SESSION_ID: "",
    ...extraEnv,
  };
  delete env.GROK_HOOK_EVENT;
  delete env.GROK_SESSION_ID;
  const result = spawnSync(process.execPath, [HOOK_BIN, "claude:inject"], {
    encoding: "utf8",
    env,
    input: JSON.stringify(payload),
    timeout: 60_000,
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

function session(dbPath: string, id: string) {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return db
      .prepare("SELECT mirror_active, persona, journey FROM runtime_sessions WHERE session_id = ?")
      .get(id);
  } finally {
    db.close();
  }
}

function embeddingRows(dbPath: string): number {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return Number(
      db.prepare("SELECT COUNT(*) AS n FROM llm_calls WHERE role = 'embedding'").get()?.n,
    );
  } finally {
    db.close();
  }
}

function snapshots(dir: string): string[] {
  const backups = join(dir, "backups");
  return existsSync(backups) ? readdirSync(backups) : [];
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
