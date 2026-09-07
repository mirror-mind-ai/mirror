// Hook-inclusive E2E smoke for the conversation-logger family
// (CV22.DS7.US10 slice F, flip-checklist item 3).
//
// Drives the whole session lifecycle through the REAL front door -- one
// process per command, hook payloads through stdin, the replay transport
// configured through the environment -- on a disposable Mirror home, and
// grades what a Navigator would observe: stdout, the route the front door
// logged, and the rows left behind. No live provider is ever reachable: the
// close tail answers from a replay fixture written by this script.
//
// The step table carries the route each subcommand is EXPECTED to take at
// the current plateau. A flip changes exactly one expectation here, and the
// smoke proves it end to end before the burn-down ledger records it.
// Subcommands still on Python run through the real fallback, so the smoke
// also exercises the Python side reading rows TypeScript wrote.
//
// Run from the repo root:  node ts/parity/conversation_lifecycle_smoke.ts

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeMaintenanceReport } from "../src/parity/maintenanceReport.ts";

const TS_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const CLI = join(TS_ROOT, "src", "frontDoor", "cli.ts");
const CODEX_FIXTURE = join(TS_ROOT, "test", "fixtures", "backfill", "codex", "valid.jsonl");
const EMBEDDING_DIMENSIONS = 1536;

// --- the disposable home and the replay transport -----------------------------

mkdirSync(join(TS_ROOT, "tmp"), { recursive: true });
const home = mkdtempSync(join(TS_ROOT, "tmp", "smoke-lifecycle-"));
const dbPath = join(home, "memory_test.db");
const llmFixture = join(home, "replay-llm.json");
const embeddingFixture = join(home, "replay-embedding.json");
writeFileSync(
  llmFixture,
  JSON.stringify({
    kind: "llm",
    responses: {
      extraction: JSON.stringify([
        {
          title: "Smoke memory",
          content: "The smoke run persisted this memory through the replay transport.",
          context: "E2E smoke",
          memory_type: "insight",
          layer: "ego",
          tags: ["smoke"],
        },
      ]),
      task_extraction: "[]",
      curation: "[]",
      summary: "Smoke summary.",
      conversation_title: "Smoke title",
      conversation_tags: '["smoke"]',
      conversation_summary: "Smoke summary.",
    },
  }),
);
writeFileSync(
  embeddingFixture,
  JSON.stringify({
    kind: "embedding",
    response: { embedding: Array<number>(EMBEDDING_DIMENSIONS).fill(0.25) },
  }),
);

const baseEnv: Record<string, string> = {
  ...(process.env as Record<string, string>),
  NODE_OPTIONS: "--no-warnings",
  MEMORY_ENV: "test",
  MIRROR_TS_EXTERNAL_ROUTES: "1",
  MIRROR_TS_CONVERSATION_LLM_REPLAY: llmFixture,
  MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY: embeddingFixture,
  PI_SESSIONS_DIR: join(home, "absent-pi-sessions"),
  MIRROR_FRONTDOOR_PYTHON_TIMEOUT_MS: "120000",
};
// The kill switch must not be inherited from the developer's shell.
delete baseEnv.MIRROR_TS_CONVERSATION_LOGGER;
delete baseEnv.OPENROUTER_API_KEY;

// --- harness ------------------------------------------------------------------

interface StepResult {
  stdout: string;
  stderr: string;
  status: number | null;
  route: string;
}

const failures: string[] = [];
const lines: string[] = [];
function check(condition: boolean, description: string, detail = ""): void {
  lines.push(`${condition ? "PASS" : "FAIL"}  ${description}`);
  if (!condition) failures.push(`${description}${detail ? `\n      ${detail}` : ""}`);
}

function lastRoute(): string {
  try {
    const log = readFileSync(join(home, "front-door.log"), "utf8").trim().split("\n");
    const last = log.at(-1) ?? "";
    return last.split("\t")[3] ?? "?";
  } catch {
    return "?";
  }
}

function run(
  args: string[],
  options: { stdin?: string; env?: Record<string, string> } = {},
): StepResult {
  const result = spawnSync(process.execPath, [CLI, ...args, "--mirror-home", home], {
    encoding: "utf8",
    cwd: resolve(TS_ROOT, ".."),
    env: { ...baseEnv, ...(options.env ?? {}) },
    ...(options.stdin !== undefined ? { input: options.stdin } : {}),
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
    route: lastRoute(),
  };
}

/** One step: the subcommand, its expected route at this plateau, and its checks. */
function step(
  label: string,
  args: string[],
  expectedRoute: "ts" | "python",
  options: { stdin?: string; env?: Record<string, string> } = {},
): StepResult {
  const result = run(args, options);
  check(result.status === 0, `${label}: exit 0`, `exit=${result.status} stderr=${result.stderr}`);
  check(
    result.route === expectedRoute,
    `${label}: routed to ${expectedRoute}`,
    `front-door log says '${result.route}'`,
  );
  return result;
}

function query<T = Record<string, unknown>>(sql: string, ...params: (string | number)[]): T[] {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}

function execute(sql: string, ...params: (string | number)[]): void {
  const db = new DatabaseSync(dbPath);
  try {
    db.prepare(sql).run(...params);
  } finally {
    db.close();
  }
}

const hook = (payload: Record<string, string>) => JSON.stringify(payload);

// --- the lifecycle --------------------------------------------------------------

// 1. Session start (fast): unmute, defer maintenance.
const start = step("session-start --fast", ["conversation-logger", "session-start", "--fast"], "python");
check(
  start.stdout.trim() === "Conversation logging ACTIVE. Maintenance deferred.",
  "session-start --fast prints the released banner",
  start.stdout,
);

// 2. Four turns through the hot path: the user-prompt hook and log-assistant.
step("user-prompt #1", ["conversation-logger", "user-prompt"], "ts", {
  stdin: hook({ session_id: "smoke-1", prompt: "question one about the port" }),
});
step("log-assistant #1", ["conversation-logger", "log-assistant", "smoke-1", "answer one"], "ts");
step("user-prompt #2", ["conversation-logger", "user-prompt"], "ts", {
  stdin: hook({ session_id: "smoke-1", prompt: "question two about parity" }),
});
step("log-assistant #2", ["conversation-logger", "log-assistant", "smoke-1", "answer two"], "ts");
const [bound] = query<{ conversation_id: string }>(
  "SELECT conversation_id FROM runtime_sessions WHERE session_id = 'smoke-1'",
);
const conversationId = bound?.conversation_id ?? "";
check(Boolean(conversationId), "user-prompt bound smoke-1 to a conversation");
check(
  query("SELECT role FROM messages WHERE conversation_id = ? ORDER BY created_at", conversationId)
    .map((row) => row.role)
    .join(",") === "user,assistant,user,assistant",
  "the four turns are logged in order",
);
// Extraction requires a journey; a Mirror/Builder load would bind it in a
// real session. That binding is not the surface under test here.
execute("UPDATE conversations SET journey = 'smoke-journey' WHERE id = ?", conversationId);

// 3. Session end (hook): the close tail under replay -- extraction, then finalization.
step("session-end hook", ["conversation-logger", "session-end"], "ts", {
  stdin: hook({ session_id: "smoke-1" }),
});
const [closed] = query<{
  ended_at: string | null;
  title: string | null;
  summary: string | null;
  tags: string | null;
  metadata: string | null;
}>("SELECT ended_at, title, summary, tags, metadata FROM conversations WHERE id = ?", conversationId);
check(Boolean(closed?.ended_at), "session-end set ended_at");
check(closed?.title === "Smoke title", "close-time finalization generated the title", closed?.title ?? "");
check(closed?.tags === '["smoke"]', "close-time finalization generated the tags", closed?.tags ?? "");
check(
  closed?.summary === "Smoke summary.",
  "close-time finalization generated the summary",
  closed?.summary ?? "",
);
const closedMetadata = JSON.parse(closed?.metadata ?? "{}") as Record<string, unknown>;
check(closedMetadata.extracted === true, "extraction marked the conversation extracted");
check(
  closedMetadata.title_source === "close_time_metadata_finalization",
  "metadata provenance names the close-time finalization",
);
check(
  query("SELECT title FROM memories WHERE conversation_id = ?", conversationId).length === 1,
  "one memory was extracted through the replay transport",
);
check(
  query("SELECT 1 FROM conversation_embeddings WHERE conversation_id = ?", conversationId).length === 1,
  "the summary embedding was stored",
);
const ledgerRoles = query<{ role: string }>(
  "SELECT role FROM llm_calls WHERE conversation_id = ? ORDER BY rowid",
  conversationId,
).map((row) => row.role);
check(
  ledgerRoles.join(",") ===
    "extraction,task_extraction,embedding,embedding,conversation_title,conversation_summary,conversation_tags",
  "the ledger records the close tail's calls in Python's order",
  ledgerRoles.join(","),
);
check(
  query("SELECT 1 FROM llm_calls WHERE prompt != '' OR response != ''").length === 0,
  "the ledger withholds prompt and response bodies (metadata mode)",
);
check(
  query("SELECT active FROM runtime_sessions WHERE session_id = 'smoke-1'")[0]?.active === 0,
  "session-end deactivated the runtime session",
);

// 4. Maintenance, twice: the second run is idempotent and makes no model call.
const ledgerCount = () => Number(query("SELECT COUNT(*) AS c FROM llm_calls")[0]?.c ?? -1);
const maintenance = step("session-maintenance", ["conversation-logger", "session-maintenance"], "python");
check(
  normalizeMaintenanceReport(maintenance.stdout.trim()).startsWith(
    "Conversation maintenance complete.\nClosed stale conversations: 0 (<elapsed>s)\nBackfilled Pi sessions: 0 (<elapsed>s)",
  ),
  "session-maintenance renders the report in the released grammar",
  maintenance.stdout,
);
const ledgerAfterFirst = ledgerCount();
step("session-maintenance (re-run)", ["conversation-logger", "session-maintenance"], "python");
check(ledgerCount() === ledgerAfterFirst, "the maintenance re-run adds zero ledger rows");

// 5. The session-less route: a transcript backfills an assistant-less conversation.
step("user-prompt (smoke-2)", ["conversation-logger", "user-prompt"], "ts", {
  stdin: hook({ session_id: "smoke-2", prompt: "a session whose answers live only in the transcript" }),
});
const transcript = join(home, "transcript.jsonl");
writeFileSync(
  transcript,
  `${JSON.stringify({
    type: "assistant",
    timestamp: new Date(Date.now() + 1000).toISOString(),
    message: { content: [{ type: "text", text: "the transcript's answer" }] },
  })}\n`,
);
step("session-end hook (session-less)", ["conversation-logger", "session-end"], "ts", {
  stdin: hook({ session_id: "", transcript_path: transcript }),
});
const [smoke2] = query<{ conversation_id: string }>(
  "SELECT conversation_id FROM runtime_sessions WHERE session_id = 'smoke-2'",
);
check(
  query(
    "SELECT content FROM messages WHERE conversation_id = ? AND role = 'assistant'",
    smoke2?.conversation_id ?? "",
  )[0]?.content === "the transcript's answer",
  "the session-less session-end backfilled the assistant turn",
);
check(
  query("SELECT active FROM runtime_sessions WHERE session_id = 'smoke-2'")[0]?.active === 1,
  "the session-less route ended no session",
);

// 6. switch and session-end-pi on that session.
const switched = step("switch", ["conversation-logger", "switch", "--session-id", "smoke-2"], "ts");
check(
  /^New conversation created: [0-9a-f]{8}$/.test(switched.stdout.trim()),
  "switch reports the new conversation id",
  switched.stdout,
);
check(
  Boolean(
    query("SELECT ended_at FROM conversations WHERE id = ?", smoke2?.conversation_id ?? "")[0]
      ?.ended_at,
  ),
  "switch closed the previous conversation",
);
const endPi = step("session-end-pi", ["conversation-logger", "session-end-pi", "smoke-2"], "ts");
check(endPi.stdout === "", "session-end-pi is silent");
check(
  query("SELECT active FROM runtime_sessions WHERE session_id = 'smoke-2'")[0]?.active === 0,
  "session-end-pi deactivated the session",
);

// 7. Backfill a Codex session, then diagnose and dry-run repair.
const codex = step(
  "backfill-codex-session",
  ["conversation-logger", "backfill-codex-session", CODEX_FIXTURE],
  "python",
);
check(
  codex.stdout.trim() === `Backfilled 1 Codex session from ${CODEX_FIXTURE}`,
  "backfill-codex-session reports the import",
  codex.stdout,
);
const diagnose = step("diagnose-journeys", ["conversation-logger", "diagnose-journeys"], "python");
check(
  diagnose.stdout.trim().split("\n")[0]?.startsWith("Repair candidates: "),
  "diagnose-journeys renders the findings header",
  diagnose.stdout,
);
const repair = step("repair-journeys (dry run)", ["conversation-logger", "repair-journeys"], "python");
check(
  repair.stdout.trim().endsWith("Dry run only. Re-run with --apply to repair after reviewing candidates."),
  "repair-journeys without --apply prints the dry-run notice",
  repair.stdout,
);

// 8. Redaction: no payload text anywhere the front door writes.
const frontDoorLog = readFileSync(join(home, "front-door.log"), "utf8");
check(
  !frontDoorLog.includes("question one") && !frontDoorLog.includes("answer one"),
  "the front-door log carries names and routes only, never payloads",
);

// 9. Revertibility: the family switch sends the whole family back to Python.
const reverted = run(["conversation-logger", "status"], { env: { MIRROR_TS_CONVERSATION_LOGGER: "0" } });
check(reverted.route === "python", "MIRROR_TS_CONVERSATION_LOGGER=0 reverts to Python", reverted.route);
check(reverted.stdout.trim() === "ACTIVE", "the reverted status answers from Python", reverted.stdout);

// --- report --------------------------------------------------------------------

process.stdout.write("== conversation-logger lifecycle smoke ==\n");
process.stdout.write(`home: ${home}\n`);
for (const line of lines) process.stdout.write(`${line}\n`);
if (failures.length > 0) {
  process.stdout.write(`\n${failures.length} check(s) failed:\n`);
  for (const failure of failures) process.stdout.write(`  - ${failure}\n`);
  process.exit(1);
}
rmSync(home, { recursive: true, force: true });
process.stdout.write("\nall checks passed; disposable home removed\n");
