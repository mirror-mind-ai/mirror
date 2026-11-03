// The world a hook test hands a turn to the one doorman in (CV9.DS8).
//
// Claude's inject hook (US4) and Antigravity's PreInvocation (TS6) both hand
// the turn to `mirror doorman`; their tests drive the hook's real entry against
// the same scratch home: a bootstrapped database holding the identity layers a
// full load renders, two personas a prompt routes to by keyword (`money` ->
// cfo, `draft` -> writer), one journey, and replayed providers, so a delta's
// one embedding is counted in `llm_calls` without a network. One fixture, so
// the two hooks are measured against one world and cannot drift apart.

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrapDatabaseIfMissing } from "#db/bootstrap.ts";
import { openDatabaseForBootstrap, openDatabaseReadOnly } from "#db/database.ts";
import { tempDir } from "./tempDir.ts";

export interface DoormanHome {
  readonly dir: string;
  readonly dbPath: string;
}

/** A scratch Mirror home with personas to route to and providers to replay. */
export function doormanHome(prefix: string): DoormanHome {
  const dir = tempDir(prefix);
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

/**
 * The environment a hook process runs in against `home`: the production paths
 * pinned to the scratch home, reception off, both providers replayed, and no
 * harness session variable -- the suite may itself run inside a runtime that
 * set one (Pi sets `MIRROR_SESSION_ID`), and an inherited name would decide
 * which session the doorman reads. An empty string is "unset" to the session
 * reader (it trims), but a set Grok key is "Grok" to the runtime detector, so
 * those two are deleted.
 */
export function doormanHookEnv(
  home: DoormanHome,
  extraEnv: Record<string, string> = {},
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    NODE_OPTIONS: "--no-warnings",
    MIRROR_HOME: home.dir,
    MIRROR_USER: "",
    DB_PATH: home.dbPath,
    MEMORY_ENV: "production",
    MEMORY_RECEPTION: "0",
    MIRROR_TS_MIRROR_EMBEDDING_REPLAY: join(home.dir, "embedding.json"),
    MIRROR_TS_MIRROR_LLM_REPLAY: join(home.dir, "llm.json"),
    OPENROUTER_API_KEY: "",
    CLAUDE_CODE_SESSION_ID: "",
    CODEX_SESSION_ID: "",
    MIRROR_SESSION_ID: "",
    ...extraEnv,
  };
  delete env.GROK_HOOK_EVENT;
  delete env.GROK_SESSION_ID;
  return env;
}

/** The session's Mirror columns, or undefined when no row was written. */
export function sessionRow(dbPath: string, id: string) {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return db
      .prepare("SELECT mirror_active, persona, journey FROM runtime_sessions WHERE session_id = ?")
      .get(id);
  } finally {
    db.close();
  }
}

/** The session's metadata, decoded; an empty object when there is none. */
export function sessionMetadata(dbPath: string, id: string): Record<string, unknown> {
  const db = openDatabaseReadOnly(dbPath);
  try {
    const raw = db
      .prepare("SELECT metadata FROM runtime_sessions WHERE session_id = ?")
      .get(id)?.metadata;
    return typeof raw === "string" && raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } finally {
    db.close();
  }
}

/** How many embedding calls the ledger holds. */
export function embeddingRows(dbPath: string): number {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return Number(
      db.prepare("SELECT COUNT(*) AS n FROM llm_calls WHERE role = 'embedding'").get()?.n,
    );
  } finally {
    db.close();
  }
}

/** The pre-write snapshots the live-write path took. */
export function snapshots(dir: string): string[] {
  const backups = join(dir, "backups");
  return existsSync(backups) ? readdirSync(backups) : [];
}
