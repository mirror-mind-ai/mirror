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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
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
// The kill switches must not be inherited from the developer's shell.
delete baseEnv.MIRROR_TS_CONVERSATION_LOGGER;
delete baseEnv.MIRROR_TS_BACKUP;
delete baseEnv.MIRROR_TS_REPAIR_ENCODING;
delete baseEnv.MIRROR_TS_WELCOME;
delete baseEnv.MIRROR_TS_RUNTIME_READS;
delete baseEnv.MIRROR_TS_SOUL;
// Empty, not deleted: `memory.config` re-applies a repo `.env` with
// `os.environ.setdefault` at import, so a DELETED key comes back and
// `runtime diagnose` would make a live OpenRouter call on the Python side --
// warning `model_pin_unresolved` where TS cannot until DS8, and breaking the
// byte comparison for a reason that has nothing to do with the port.
baseEnv.OPENROUTER_API_KEY = "";
// The welcome's remote update check is bounded but real; the smoke stays offline.
baseEnv.MIRROR_WELCOME_REMOTE_UPDATE_CHECK = "off";
// `runtime version` and `release-notes` take no `--mirror-home`, so without an
// ambient home they would resolve the DEVELOPER's real mirror home and append
// to its front-door.log. Pin both to the disposable home; the explicit
// `--mirror-home` every other step passes still takes precedence.
baseEnv.MIRROR_HOME = home;
baseEnv.MIRROR_USER = basename(home);

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
  if (!condition) {
    failures.push(`${description}${detail ? `\n      ${detail}` : ""}`);
    // Surface immediately as well: a later step may throw before the report.
    process.stderr.write(`FAIL  ${description}\n      ${detail.trim()}\n`);
  }
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
  check(
    result.status === 0,
    `${label}: exit 0`,
    `exit=${result.status} stdout=${result.stdout.trim()} stderr=${result.stderr.trim()}`,
  );
  check(
    result.route === expectedRoute,
    `${label}: routed to ${expectedRoute}`,
    `front-door log says '${result.route}'`,
  );
  return result;
}

function readdirSyncSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function query<T = Record<string, unknown>>(sql: string, ...params: (string | number)[]): T[] {
  if (!existsSync(dbPath)) {
    check(false, `database exists before querying: ${sql.slice(0, 40)}...`, dbPath);
    return [];
  }
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}

function execute(sql: string, ...params: (string | number)[]): void {
  if (!existsSync(dbPath)) return;
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
const start = step("session-start --fast", ["conversation-logger", "session-start", "--fast"], "ts");
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

// 4. Full session start, then maintenance twice: the second run is idempotent
// and makes no model call.
const fullStart = step("session-start (full)", ["conversation-logger", "session-start"], "ts");
check(
  normalizeMaintenanceReport(fullStart.stdout.trim()).startsWith(
    "Conversation logging ACTIVE.\nConversation maintenance complete.\nClosed stale conversations: 0 (<elapsed>s)",
  ),
  "full session-start prints the banner and the maintenance report",
  fullStart.stdout,
);
const ledgerCount = () => Number(query("SELECT COUNT(*) AS c FROM llm_calls")[0]?.c ?? -1);
const maintenance = step("session-maintenance", ["conversation-logger", "session-maintenance"], "ts");
check(
  normalizeMaintenanceReport(maintenance.stdout.trim()).startsWith(
    "Conversation maintenance complete.\nClosed stale conversations: 0 (<elapsed>s)\nBackfilled Pi sessions: 0 (<elapsed>s)",
  ),
  "session-maintenance renders the report in the released grammar",
  maintenance.stdout,
);
const ledgerAfterFirst = ledgerCount();
step("session-maintenance (re-run)", ["conversation-logger", "session-maintenance"], "ts");
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
  "ts",
);
check(
  codex.stdout.trim() === `Backfilled 1 Codex session from ${CODEX_FIXTURE}`,
  "backfill-codex-session reports the import",
  codex.stdout,
);
const diagnose = step("diagnose-journeys", ["conversation-logger", "diagnose-journeys"], "ts");
check(
  diagnose.stdout.trim().split("\n")[0]?.startsWith("Repair candidates: "),
  "diagnose-journeys renders the findings header",
  diagnose.stdout,
);
const repair = step("repair-journeys (dry run)", ["conversation-logger", "repair-journeys"], "ts");
check(
  repair.stdout.trim().endsWith("Dry run only. Re-run with --apply to repair after reviewing candidates."),
  "repair-journeys without --apply prints the dry-run notice",
  repair.stdout,
);

// The mutating repair follows the backup gate (CV22.DS7.TS1, flipped
// 2026-09-07): TS by default, Python under MIRROR_TS_BACKUP=0. The TS steps
// below run with NO gate in the environment, so the smoke proves the default.
const applyRepairPython = step(
  "repair-journeys --apply (backup gate off)",
  ["conversation-logger", "repair-journeys", "--apply"],
  "python",
  { env: { MIRROR_TS_BACKUP: "0" } },
);
check(
  applyRepairPython.stdout.includes("Repaired: "),
  "repair-journeys --apply reports through Python when the backup gate is off",
  applyRepairPython.stdout,
);
const applyRepair = step(
  "repair-journeys --apply (default route)",
  ["conversation-logger", "repair-journeys", "--apply"],
  "ts",
);
check(
  applyRepair.stdout.includes("Repaired: "),
  "repair-journeys --apply reports through TS by default",
  applyRepair.stdout,
);

// --- DB safety tools (CV22.DS7.TS1) -------------------------------------------

// 10. backup: both real CLIs archive the same file into separate directories;
// Python's zipfile must read the TS archive and see the same restore image.
const backupTs = step("backup (TS, default route)", ["backup", "--backup-dir", join(home, "backups-ts")], "ts");
const backupPy = step("backup (Python)", ["backup", "--backup-dir", join(home, "backups-py")], "python", {
  env: { MIRROR_TS_BACKUP: "0" },
});
const normalizeBackupStdout = (text: string) =>
  text
    .replace(/memory_\d{8}_\d{6}\.zip/g, "memory_<stamp>.zip")
    .replace(/\(\d+ KB\)/g, "(<KB> KB)")
    .replace(/backups-(ts|py)/g, "backups-<engine>");
check(
  normalizeBackupStdout(backupTs.stdout) === normalizeBackupStdout(backupPy.stdout),
  "backup prints the same lines from both engines (stamp and KB normalized)",
  `${backupTs.stdout}---\n${backupPy.stdout}`,
);
const archiveCheck = spawnSync(
  "uv",
  [
    "run",
    "python",
    "-c",
    [
      "import glob, json, sys, zipfile",
      "def members(d):",
      "    paths = sorted(glob.glob(d + '/memory_*.zip'))",
      "    assert len(paths) == 1, paths",
      "    with zipfile.ZipFile(paths[0]) as zf:",
      "        assert zf.testzip() is None, 'testzip failed: ' + paths[0]",
      "        return [(i.filename, i.file_size, i.CRC) for i in zf.infolist()]",
      "ts, py = members(sys.argv[1]), members(sys.argv[2])",
      "print(json.dumps({'ts': ts, 'py': py, 'same': ts == py}))",
    ].join("\n"),
    join(home, "backups-ts"),
    join(home, "backups-py"),
  ],
  { encoding: "utf8", cwd: resolve(TS_ROOT, ".."), env: baseEnv },
);
const archiveReport = archiveCheck.status === 0 ? JSON.parse(archiveCheck.stdout.trim()) : null;
check(
  archiveReport !== null,
  "Python's zipfile verifies both archives (testzip)",
  archiveCheck.stderr,
);
check(
  archiveReport?.same === true && archiveReport?.ts?.[0]?.[0] === "memory.db",
  "the TS archive holds the same restore image as the Python one (member names, sizes, CRC-32)",
  archiveCheck.stdout,
);
check(
  !existsSync(join(home, "backups-ts")) ||
    !readdirSyncSafe(join(home, "backups-ts")).some((name) => name.endsWith(".partial")),
  "no .partial staging file survives the TS backup",
);

// 11. repair-encoding: a seeded mojibake row is reported identically by both
// engines, repaired by TS (with the dated zip first), and then Python sees
// nothing left to repair -- Python reading what TypeScript wrote.
execute(
  "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)",
  "smoke-mojibake",
  query<{ id: string }>("SELECT id FROM conversations LIMIT 1")[0]?.id ?? "smoke-conv",
  "sess\u00c3\u00a3o com acentua\u00c3\u00a7\u00c3\u00a3o quebrada",
  "2026-09-07T12:00:00.000000Z",
);
const dryTs = step("repair-encoding dry run (TS, default route)", ["repair-encoding"], "ts");
const dryPy = step("repair-encoding dry run (Python)", ["repair-encoding"], "python", {
  env: { MIRROR_TS_REPAIR_ENCODING: "0" },
});
check(
  dryTs.stdout === dryPy.stdout && dryTs.stdout.includes("Repairable mojibake hits: 1"),
  "repair-encoding dry run is byte-identical across engines and finds the seeded row",
  `${dryTs.stdout}---\n${dryPy.stdout}`,
);
const applyEncoding = step("repair-encoding --apply (TS, default route)", ["repair-encoding", "--apply"], "ts");
check(
  /Backup created: memory_\d{8}_\d{6}\.zip/.test(applyEncoding.stdout) &&
    applyEncoding.stdout.trim().endsWith("Applied repairs: 1"),
  "repair-encoding --apply takes the dated zip first, then applies one repair",
  applyEncoding.stdout,
);
check(
  query<{ content: string }>("SELECT content FROM messages WHERE id = 'smoke-mojibake'")[0]?.content ===
    "sess\u00e3o com acentua\u00e7\u00e3o quebrada",
  "the seeded row is repaired in place",
);
const afterPy = step("repair-encoding dry run after apply (Python)", ["repair-encoding"], "python", {
  env: { MIRROR_TS_REPAIR_ENCODING: "0" },
});
check(
  afterPy.stdout.includes("Repairable mojibake hits: 0"),
  "Python finds nothing left to repair after the TS apply",
  afterPy.stdout,
);

// 12. CV22.DS7.TS3 -- the daily-visible tail through both engines. The gates
// are FLIPPED, so the TS side carries no gate at all in this environment (the
// kill switches are deleted from `baseEnv` above): the smoke proves the
// shipped default, not a configuration only the smoke sets. The Python side is
// selected with `=0`, which is the revert control.
//
// `runtime version` and `runtime release-notes` take no `--mirror-home`, so
// they bypass the helper that appends it -- argparse would reject the flag.
function runRaw(args: string[], env: Record<string, string>): StepResult {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd: resolve(TS_ROOT, ".."),
    env: { ...baseEnv, ...env },
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
    route: lastRoute(),
  };
}

const TAIL_DEFAULT: Record<string, string> = {};
const TAIL_OFF = { MIRROR_TS_WELCOME: "0", MIRROR_TS_RUNTIME_READS: "0" };

/**
 * Lines that may legitimately differ between the engines on THIS database.
 *
 * `status` and `diagnose` are the two commands the story exists to change:
 * they grade the migration ledger, and the TS core knows the TS-authored
 * `017_journey_parent_column` that Python calls unknown. Everything else --
 * including every other finding -- must still match, so the assertion below is
 * "TS removed the false alarm and changed nothing else", not byte identity.
 *
 * `front_door_errors` is a harness artifact, not a port difference: the finding
 * COUNTS entries in the front-door log, and this smoke appends to that same log
 * on every step -- including the two diagnose invocations being compared. The
 * count therefore moves between them no matter which engine answers.
 */
const DIVERGENT_LINE =
  /017_journey_parent_column|core_migration_unknown|^Core migrations:|^Findings:|^Status:|^Subject: database _migrations$|^Recommendation: classify as legacy core row|^Repair route: manual review$|front_door_errors/;

for (const [label, args, raw, mayDiverge] of [
  ["welcome", ["welcome"], false, false],
  ["welcome --status-line", ["welcome", "--status-line"], false, false],
  ["runtime version", ["runtime", "version"], true, false],
  ["runtime status", ["runtime", "status"], false, true],
  ["runtime diagnose", ["runtime", "diagnose"], false, true],
] as [string, string[], boolean, boolean][]) {
  const invoke = (env: Record<string, string>): StepResult =>
    raw ? runRaw(args, env) : run(args, { env });
  const ts = invoke(TAIL_DEFAULT);
  const py = invoke(TAIL_OFF);
  check(ts.route === "ts", `${label}: routes to TS by default (no gate set)`, ts.route);
  check(py.route === "python", `${label}: reverts to Python with the gate at 0`, py.route);

  if (!mayDiverge) {
    check(
      ts.stdout === py.stdout,
      `${label}: byte-identical across engines`,
      `--- ts ---\n${ts.stdout}--- python ---\n${py.stdout}`,
    );
    check(
      ts.status === py.status,
      `${label}: same exit code across engines`,
      `ts=${ts.status} python=${py.status}`,
    );
    continue;
  }

  const tsLines = ts.stdout.split("\n");
  const pyLines = py.stdout.split("\n");
  const unexplained = pyLines.filter(
    (line) => !DIVERGENT_LINE.test(line) && !tsLines.includes(line),
  );
  check(
    unexplained.length === 0,
    `${label}: TS drops the 017 false alarm and changes nothing else`,
    `lines only Python produced:\n${unexplained.join("\n")}`,
  );
  check(
    py.stdout.includes("017_journey_parent_column") &&
      !ts.stdout.includes("017_journey_parent_column"),
    `${label}: Python flags the TS-authored migration and TS does not`,
    `--- ts ---\n${ts.stdout}--- python ---\n${py.stdout}`,
  );
}

// The per-turn path must not write. A status line that migrates the database
// it reads would report a state it created.
const beforeStatusLine = readFileSync(dbPath);
run(["welcome", "--status-line"], { env: TAIL_DEFAULT });

// The two tail gates revert INDEPENDENTLY: they fail differently, so reverting
// the per-turn surface must not drag diagnostics back to Python with it.
check(
  run(["runtime", "status"], { env: { MIRROR_TS_WELCOME: "0" } }).route === "ts",
  "MIRROR_TS_WELCOME=0 does not revert the runtime reads",
);
check(
  run(["welcome"], { env: { MIRROR_TS_RUNTIME_READS: "0" } }).route === "ts",
  "MIRROR_TS_RUNTIME_READS=0 does not revert welcome",
);
check(
  Buffer.compare(readFileSync(dbPath), beforeStatusLine) === 0,
  "welcome --status-line leaves the database byte-identical",
);

// 8. Redaction: no payload text anywhere the front door writes.
const frontDoorLog = readFileSync(join(home, "front-door.log"), "utf8");
check(
  !frontDoorLog.includes("question one") &&
    !frontDoorLog.includes("answer one") &&
    !frontDoorLog.includes("quebrada") &&
    !frontDoorLog.includes("backups-ts"),
  "the front-door log carries names and routes only, never payloads or paths",
);

// 9. Revertibility: the family switch sends the whole family back to Python.
const reverted = run(["conversation-logger", "status"], { env: { MIRROR_TS_CONVERSATION_LOGGER: "0" } });
check(reverted.route === "python", "MIRROR_TS_CONVERSATION_LOGGER=0 reverts to Python", reverted.route);
check(reverted.stdout.trim() === "ACTIVE", "the reverted status answers from Python", reverted.stdout);

// 10. CV22.DS7.US6 — the Soul ritual, run end to end through BOTH engines on
// the same disposable home. Every surface here is transport=verbatim, and the
// bugs in a stateful ritual live in the TRANSITIONS, not in single renders, so
// the sequence runs as one session rather than as isolated calls.
//
// The gate is off in this build, so each step is run twice on purpose: once
// with MIRROR_TS_SOUL=1 (proving the route that plateau 7 will make default)
// and once without (proving today's shipped default is still Python), and the
// two outputs are compared byte for byte.
// After the 2026-09-08 flip the SHIPPED route is TS with no gate in the
// environment, so `SOUL_ON` sets none: the steps below prove the default rather
// than a configuration. `SOUL_OFF` is the revert control.
const SOUL_ON = { MIRROR_HOME: home };
const SOUL_OFF = { MIRROR_HOME: home, MIRROR_TS_SOUL: "0" };
const soulSession = "smoke-soul-session";

// Python's `soul` parser accepts NO `--mirror-home` (nor does `explore`, which
// US7 will meet), so every invocation here targets the disposable home through
// the environment instead -- the way a real session reaches it. The divergence
// this exposes is asserted explicitly further down rather than worked around
// silently.
function runSoul(args: string[], env: Record<string, string>): StepResult {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd: resolve(TS_ROOT, ".."),
    env: { ...baseEnv, ...env },
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
    route: lastRoute(),
  };
}

function soulStep(label: string, args: string[]): StepResult {
  const result = runSoul(args, SOUL_ON);
  check(result.status === 0, `${label}: exit 0`, `exit=${result.status} ${result.stderr.trim()}`);
  check(result.route === "ts", `${label}: routed to ts`, result.route);
  return result;
}

function soulBothEngines(label: string, args: string[]): { ts: StepResult; python: StepResult } {
  const ts = runSoul(args, SOUL_ON);
  const python = runSoul(args, SOUL_OFF);
  check(ts.route === "ts", `${label}: TS by default, no gate in the environment`, ts.route);
  check(python.route === "python", `${label}: MIRROR_TS_SOUL=0 reverts to Python`, python.route);
  check(
    ts.stdout === python.stdout,
    `${label}: both engines render identically`,
    `ts=${JSON.stringify(ts.stdout.slice(0, 120))} python=${JSON.stringify(python.stdout.slice(0, 120))}`,
  );
  check(ts.status === python.status, `${label}: same exit code`, `${ts.status} vs ${python.status}`);
  return { ts, python };
}

// Read-only ritual surfaces: identical on both engines, no state touched.
soulBothEngines("soul listen", [
  "soul",
  "listen",
  "--self",
  "what remains true without proof",
  "--shadow",
  "the protection inside the control",
]);
soulBothEngines("soul rite self", ["soul", "rite", "self", "--says", "o que resiste a ser explicado"]);
soulBothEngines("soul close", ["soul", "close", "--harvested", "uma verdade", "--echoes", "um eco"]);
soulBothEngines("soul review", ["soul", "review", "--origin", "a origem", "--self", "um princípio"]);
soulBothEngines("soul propose", [
  "soul",
  "propose",
  "self",
  "--origin",
  "um rito",
  "--proposed",
  "um princípio novo",
  "--why",
  "porque recorre",
]);
soulBothEngines("soul prompt wisdom", ["soul", "prompt", "wisdom"]);

// Refusals are ritual text too, and they must match including the exit code.
const refusedRite = soulBothEngines("soul rite wisdom without --says", ["soul", "rite", "wisdom"]);
check(refusedRite.ts.status === 1, "soul rite wisdom: exit 1", `${refusedRite.ts.status}`);
check(
  refusedRite.ts.stderr === refusedRite.python.stderr,
  "soul rite wisdom: identical stderr",
  `ts=${refusedRite.ts.stderr.trim()} python=${refusedRite.python.stderr.trim()}`,
);

// Stateful sequence on the TS engine, verified in the database as it goes.
const fruitSet = soulStep("soul fruit set", [
  "soul",
  "fruit",
  "set",
  "um fruto em maturação",
  "--session-id",
  soulSession,
]);
check(
  fruitSet.stdout.includes("FRUIT IN MATURATION"),
  "soul fruit set renders the maturation card",
  fruitSet.stdout,
);
const [afterSet] = query<{ metadata: string }>(
  "SELECT metadata FROM runtime_sessions WHERE session_id = ?",
  soulSession,
);
check(
  (afterSet?.metadata ?? "").includes('"soul": {"fruit_in_maturation"'),
  "the fruit is stored in Python's JSON dialect",
  afterSet?.metadata ?? "(no row)",
);

soulStep("soul fruit show", ["soul", "fruit", "show", "--session-id", soulSession]);
soulStep("soul harvest set", ["soul", "harvest", "set", "--session-id", soulSession]);
const [afterHarvest] = query<{ metadata: string }>(
  "SELECT metadata FROM runtime_sessions WHERE session_id = ?",
  soulSession,
);
check(
  (afterHarvest?.metadata ?? "").includes("harvested_fruit") &&
    !(afterHarvest?.metadata ?? "").includes("fruit_in_maturation"),
  "harvest promotes and pops in one write",
  afterHarvest?.metadata ?? "(no row)",
);

soulStep("soul harvest decline", ["soul", "harvest", "decline", "--session-id", soulSession]);
const [afterDecline] = query<{ metadata: string | null }>(
  "SELECT metadata FROM runtime_sessions WHERE session_id = ?",
  soulSession,
);
check(
  afterDecline?.metadata === null,
  "declining the last soul key writes SQL NULL, not '{}'",
  String(afterDecline?.metadata),
);

// `soul load` activates the mode. Run on TS only, because it WRITES and the
// two engines would each claim the row; the card itself is already proven
// identical by the golden, so what this checks is the state transition.
const soulLoad = soulStep("soul load", ["soul", "load", "--session-id", soulSession]);
check(
  soulLoad.stdout.includes("SOUL MODE ACTIVE"),
  "soul load renders the entry card",
  soulLoad.stdout.slice(0, 80),
);
const [afterLoad] = query<{ metadata: string }>(
  "SELECT metadata FROM runtime_sessions WHERE session_id = ?",
  soulSession,
);
check(
  (afterLoad?.metadata ?? "").includes('"operating_mode": {"active_mode": "Soul Mode"'),
  "soul load writes the operating mode in Python's dialect",
  afterLoad?.metadata ?? "(no row)",
);

// `harvest save` is the one leaf that crosses the provider seam: it must stay
// on Python until the embedding replay transport is configured, even with the
// family gate on.
const saveWithoutReplay = runSoul(["soul", "harvest", "save", "--session-id", soulSession], SOUL_ON);
check(
  saveWithoutReplay.route === "python",
  "soul harvest save stays on Python without the replay transport",
  saveWithoutReplay.route,
);

// An unported subcommand reaches Python by name, never by inheritance.
const unknownSub = runSoul(["soul", "publish"], SOUL_ON);
check(
  unknownSub.route === "python",
  "an unallowlisted soul subcommand reaches Python by name",
  unknownSub.route,
);

// Recorded divergence: Python's `soul` parser has no `--mirror-home`, so it
// refuses the flag with argparse's exit 2 while the TS route -- like every
// other front-door command -- accepts it. A superset, not a changed answer for
// any invocation that works today, and asserted so it stays visible.
const soulHomeFlagTs = runSoul(["soul", "listen", "--self", "x", "--mirror-home", home], SOUL_ON);
const soulHomeFlagPython = runSoul(
  ["soul", "listen", "--self", "x", "--mirror-home", home],
  SOUL_OFF,
);
check(soulHomeFlagTs.status === 0, "TS soul accepts --mirror-home", `${soulHomeFlagTs.status}`);
check(
  soulHomeFlagPython.status === 2,
  "Python soul refuses --mirror-home (recorded divergence)",
  `${soulHomeFlagPython.status}`,
);

check(
  !frontDoorLog.includes("um fruto em maturação") && !frontDoorLog.includes("resiste a ser explicado"),
  "the front-door log carries no ritual text",
);

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
