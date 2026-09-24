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
// Every step is answered by TypeScript, and the smoke checks that the front
// door's log says so. Until CV22.DS10.TS5 it also ran each family's revert
// through the real Python fallback, proving Python could read the rows
// TypeScript wrote -- the property that made a revert safe. The reverts left
// with the engine, and so did those steps.
//
// Run from the repo root:  node ts/smoke/conversation_lifecycle_smoke.ts

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
  MIRROR_TS_CONVERSATION_LLM_REPLAY: llmFixture,
  MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY: embeddingFixture,
  // The BUILD family's fixtures, because `explore story promote` ends in a
  // Builder session start and its seams are built from THESE variables.
  //
  // Not optional, and the first run without them proved why: with only the
  // conversation family configured, the composed decision reports an incomplete
  // replay fixture and refuses promote by name rather than replaying two
  // searches and sending the close tail to a live provider. A
  // harness that configures one family and exercises another gets the refusal,
  // which is the behavior CV22.DS7.US8 item 18b specifies.
  MIRROR_TS_BUILD_LLM_REPLAY: join(TS_ROOT, "test", "fixtures", "builder-load", "replay-llm.json"),
  MIRROR_TS_BUILD_EMBEDDING_REPLAY: join(
    TS_ROOT,
    "test",
    "fixtures",
    "builder-load",
    "replay-embedding.json",
  ),
  PI_SESSIONS_DIR: join(home, "absent-pi-sessions"),
};
// Empty, not deleted: the smoke must stay offline, and an empty key is what
// every provider treats as "none configured".
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

/**
 * One step: the subcommand, the route the front door must log for it, and its
 * checks. The route is always `ts` now; the check stays, because a step that
 * came back `usage` or `retired` would still exit and must still fail.
 */
function step(
  label: string,
  args: string[],
  expectedRoute: "ts",
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
const start = step(
  "session-start --fast",
  ["conversation-logger", "session-start", "--fast"],
  "ts",
);
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
}>(
  "SELECT ended_at, title, summary, tags, metadata FROM conversations WHERE id = ?",
  conversationId,
);
check(Boolean(closed?.ended_at), "session-end set ended_at");
check(
  closed?.title === "Smoke title",
  "close-time finalization generated the title",
  closed?.title ?? "",
);
check(
  closed?.tags === '["smoke"]',
  "close-time finalization generated the tags",
  closed?.tags ?? "",
);
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
  query("SELECT 1 FROM conversation_embeddings WHERE conversation_id = ?", conversationId)
    .length === 1,
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
const maintenance = step(
  "session-maintenance",
  ["conversation-logger", "session-maintenance"],
  "ts",
);
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
  stdin: hook({
    session_id: "smoke-2",
    prompt: "a session whose answers live only in the transcript",
  }),
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
  repair.stdout
    .trim()
    .endsWith("Dry run only. Re-run with --apply to repair after reviewing candidates."),
  "repair-journeys without --apply prints the dry-run notice",
  repair.stdout,
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

// 10. backup: the archive must verify through the product's own verifier. (It
// used to be graded by Python's zipfile against a Python-made twin; the
// verifier is what an operator actually runs before restoring.)
const backupTs = step(
  "backup (TS, default route)",
  ["backup", "--backup-dir", join(home, "backups-ts")],
  "ts",
);
const [archiveName] = readdirSyncSafe(join(home, "backups-ts")).filter((name) =>
  /^memory_\d{8}_\d{6}\.zip$/.test(name),
);
check(backupTs.stdout.includes("Backup created: "), "backup reports the archive", backupTs.stdout);
const verified = step(
  "runtime backup --verify the archive",
  ["runtime", "backup", "--verify", join(home, "backups-ts", archiveName ?? "missing.zip")],
  "ts",
);
check(
  /^Verification result: valid$/m.test(verified.stdout),
  "the TS archive verifies as a restorable database",
  verified.stdout,
);
check(
  !existsSync(join(home, "backups-ts")) ||
    !readdirSyncSafe(join(home, "backups-ts")).some((name) => name.endsWith(".partial")),
  "no .partial staging file survives the TS backup",
);

// 11. repair-encoding: a seeded mojibake row is found, repaired (with the dated
// zip first), and then found no more.
execute(
  "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)",
  "smoke-mojibake",
  query<{ id: string }>("SELECT id FROM conversations LIMIT 1")[0]?.id ?? "smoke-conv",
  "sess\u00c3\u00a3o com acentua\u00c3\u00a7\u00c3\u00a3o quebrada",
  "2026-09-07T12:00:00.000000Z",
);
const dryTs = step("repair-encoding dry run", ["repair-encoding"], "ts");
check(
  dryTs.stdout.includes("Repairable mojibake hits: 1"),
  "repair-encoding dry run finds the seeded row",
  dryTs.stdout,
);
const applyEncoding = step(
  "repair-encoding --apply (TS, default route)",
  ["repair-encoding", "--apply"],
  "ts",
);
check(
  /Backup created: memory_\d{8}_\d{6}\.zip/.test(applyEncoding.stdout) &&
    applyEncoding.stdout.trim().endsWith("Applied repairs: 1"),
  "repair-encoding --apply takes the dated zip first, then applies one repair",
  applyEncoding.stdout,
);
check(
  query<{ content: string }>("SELECT content FROM messages WHERE id = 'smoke-mojibake'")[0]
    ?.content === "sess\u00e3o com acentua\u00e7\u00e3o quebrada",
  "the seeded row is repaired in place",
);
const afterApply = step("repair-encoding dry run after apply", ["repair-encoding"], "ts");
check(
  afterApply.stdout.includes("Repairable mojibake hits: 0"),
  "nothing is left to repair after the apply",
  afterApply.stdout,
);

// 12. CV22.DS7.TS3 -- the daily-visible tail. (Until CV22.DS10.TS5 each surface
// was also rendered by Python through its revert gate and compared byte for
// byte; that parity is recorded, and the gates are gone.)
//
// `runtime version` and `runtime release-notes` take no `--mirror-home`, so
// they bypass the helper that appends it.
function runRaw(args: string[]): StepResult {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd: resolve(TS_ROOT, ".."),
    env: baseEnv,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
    route: lastRoute(),
  };
}

for (const [label, args, raw] of [
  ["welcome", ["welcome"], false],
  ["welcome --status-line", ["welcome", "--status-line"], false],
  ["runtime version", ["runtime", "version"], true],
  ["runtime status", ["runtime", "status"], false],
  ["runtime diagnose", ["runtime", "diagnose"], false],
] as [string, string[], boolean][]) {
  const result = raw ? runRaw(args) : run(args);
  check(result.route === "ts", `${label}: routes to TS`, result.route);
  check(result.stdout.length > 0, `${label}: renders`, result.stderr);
}

// The per-turn path must not write. A status line that migrates the database
// it reads would report a state it created.
const beforeStatusLine = readFileSync(dbPath);
run(["welcome", "--status-line"]);
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

// 10. CV22.DS7.US6 — the Soul ritual, run end to end on the same disposable
// home. Every surface here is transport=verbatim, and the bugs in a stateful
// ritual live in the TRANSITIONS, not in single renders, so the sequence runs
// as one session rather than as isolated calls. (Until CV22.DS10.TS5 each
// read-only surface was also rendered by Python and compared byte for byte.)
const SOUL_ON = { MIRROR_HOME: home };
const soulSession = "smoke-soul-session";

// Every invocation here targets the disposable home through the environment --
// the way a real session reaches it. (The oracle's `soul` and `explore` parsers
// accepted no `--mirror-home`, which is why; TypeScript does, and that is
// asserted further down.)
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

/** A read-only ritual surface: answered by TypeScript, rendered, no state touched. */
function soulRender(label: string, args: string[]): StepResult {
  const result = runSoul(args, SOUL_ON);
  check(result.route === "ts", `${label}: routed to ts`, result.route);
  check(result.stdout.length > 0 || result.stderr.length > 0, `${label}: renders`);
  return result;
}

// Read-only ritual surfaces.
soulRender("soul listen", [
  "soul",
  "listen",
  "--self",
  "what remains true without proof",
  "--shadow",
  "the protection inside the control",
]);
soulRender("soul rite self", ["soul", "rite", "self", "--says", "o que resiste a ser explicado"]);
soulRender("soul close", ["soul", "close", "--harvested", "uma verdade", "--echoes", "um eco"]);
soulRender("soul review", ["soul", "review", "--origin", "a origem", "--self", "um princípio"]);
soulRender("soul propose", [
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
soulRender("soul prompt wisdom", ["soul", "prompt", "wisdom"]);

// Refusals are ritual text too.
const refusedRite = soulRender("soul rite wisdom without --says", ["soul", "rite", "wisdom"]);
check(refusedRite.status === 1, "soul rite wisdom: exit 1", `${refusedRite.status}`);
check(refusedRite.stderr.length > 0, "soul rite wisdom: says why", refusedRite.stderr);

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

// `harvest save` is the one Soul leaf that crosses the provider seam, and it
// goes live by default (CV22.DS8.US3).
const saveUnconfigured = runSoul(["soul", "harvest", "save", "--session-id", soulSession], SOUL_ON);
check(
  saveUnconfigured.route === "ts",
  "soul harvest save reaches TS on an unconfigured install (DS8.US3)",
  saveUnconfigured.route,
);

// An unknown subcommand gets the family's own usage answer, never inheritance
// (CV22.DS10.TS5, D2).
const unknownSub = runSoul(["soul", "publish"], SOUL_ON);
check(
  unknownSub.route === "usage" && unknownSub.status === 2,
  "an unallowlisted soul subcommand gets the family's usage answer",
  `${unknownSub.route} exit=${unknownSub.status}`,
);

// The TS route accepts `--mirror-home` like every other front-door command.
// (Python's `soul` parser refused it -- a recorded divergence while it existed.)
const soulHomeFlagTs = runSoul(["soul", "listen", "--self", "x", "--mirror-home", home], SOUL_ON);
check(soulHomeFlagTs.status === 0, "TS soul accepts --mirror-home", `${soulHomeFlagTs.status}`);

check(
  !frontDoorLog.includes("um fruto em maturação") &&
    !frontDoorLog.includes("resiste a ser explicado"),
  "the front-door log carries no ritual text",
);

// --- CV22.DS7.US7: Explorer Mode -----------------------------------------------
//
// One continuous exploration, because the bugs in stateful narrative surfaces
// live in the TRANSITIONS -- open, thicken, attractor, experiment, snapshot,
// handoff, archive -- not in single renders.
//
const EXPLORE_ON = { MIRROR_HOME: home };
const exploreJourney = "smoke-explore-journey";
const exploreProject = join(home, "explore-project");

function runExplore(args: string[], env: Record<string, string>): StepResult {
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

function exploreStep(label: string, args: string[]): StepResult {
  const result = runExplore(args, EXPLORE_ON);
  check(result.status === 0, `${label}: exit 0`, `exit=${result.status} ${result.stderr.trim()}`);
  check(result.route === "ts", `${label}: routed to ts`, result.route);
  return result;
}

// A journey with a project path, so the handoff step has somewhere to write.
mkdirSync(exploreProject, { recursive: true });
step(
  "seed explore journey",
  [
    "identity",
    "set",
    "journey",
    exploreJourney,
    "--content",
    "# Smoke Explore\n**Status:** active\n",
    "--mirror-home",
    home,
  ],
  "ts",
);
step(
  "set explore project path",
  ["journey", "set-path", exploreJourney, exploreProject, "--mirror-home", home],
  "ts",
);

const exploreOpen = exploreStep("explore story open", [
  "explore",
  "story",
  "open",
  exploreJourney,
  "--story",
  "a parte que ainda não sabemos nomear",
]);
check(
  exploreOpen.stdout.includes("[[MIRROR_REQUIRED_SURFACE_BEGIN:exploratory_story_opened]]"),
  "explore story open emits the required-surface marker",
  exploreOpen.stdout.slice(0, 120),
);

// THE seam check, inverted. Until CV22.DS10.TS1 this asserted that the
// TypeScript write delegated a Journey projection refresh to Python and that
// Python published `operational.json` -- a file rather than a log line, because
// the delegation was best-effort and a broken seam was therefore SILENT.
//
// The subsystem is retired: nothing publishes, and the silence that made the
// old check necessary is now the correct behavior. So the check is kept and
// reversed. It still guards the same property from the other side -- an
// end-to-end proof, through the real front door on a real project, that an
// Explorer write spawns nothing and writes nothing under `.mirror/`. The
// unit-level guard (`noPythonSpawn.test.ts`) greps the process table; this one
// grades the filesystem a user would see.
const retiredProjectionTree = join(exploreProject, ".mirror", "projections");
check(
  !existsSync(retiredProjectionTree),
  "the TS write published no Journey projection: the subsystem is retired",
  retiredProjectionTree,
);

const exploreThicken = exploreStep("explore story thicken", [
  "explore",
  "story",
  "thicken",
  exploreJourney,
  "--story",
  "o muro era um problema de renderização",
  "--changed",
  "a pergunta mudou",
]);
check(
  exploreThicken.stdout.includes("STORY THICKENED"),
  "explore story thicken renders the thickened card",
  exploreThicken.stdout.slice(0, 120),
);

exploreStep("explore story attractors", [
  "explore",
  "story",
  "attractors",
  exploreJourney,
  "--attractor",
  "graduar a superfície, não a intenção",
  "--status",
  "accepted",
]);
exploreStep("explore story experiment", [
  "explore",
  "story",
  "experiment",
  exploreJourney,
  "--title",
  "portar um comando ritual de ponta a ponta",
]);
exploreStep("explore story snapshot", ["explore", "story", "snapshot", exploreJourney]);

// One durable row, not one per mutation: the upsert must inherit its id.
const exploreRows = query<{ id: string; status: string; title: string }>(
  "SELECT id, status, title FROM exploratory_stories WHERE journey = ?",
  exploreJourney,
);
check(
  exploreRows.length === 1,
  "five mutations produced exactly one active row",
  `${exploreRows.length} rows`,
);

// The legacy runtime payload is still dual-written on every mutation.
const [exploreSession] = query<{ metadata: string | null; active: number }>(
  "SELECT metadata, active FROM runtime_sessions WHERE session_id = ?",
  `__explorer_story__:${exploreJourney}`,
);
check(
  (exploreSession?.metadata ?? "").includes('"current_exploratory_story":'),
  "the legacy runtime payload is written alongside the durable row",
  exploreSession?.metadata?.slice(0, 120) ?? "(no row)",
);

const exploreHandoff = exploreStep("explore story handoff", [
  "explore",
  "story",
  "handoff",
  exploreJourney,
  "--title",
  "Paridade é um problema de renderização",
  "--summary",
  "forma suficiente para planejar",
]);
check(
  exploreHandoff.stdout.includes("BUILDER HANDOFF PROPOSED"),
  "explore story handoff renders the handoff card",
  exploreHandoff.stdout.slice(0, 120),
);
const handoffIndex = join(
  exploreProject,
  "docs",
  "project",
  "explorations",
  "paridade-e-um-problema-de-renderizacao",
  "index.md",
);
check(
  existsSync(handoffIndex),
  "the handoff wrote its documents into the journey's project",
  handoffIndex,
);

const exploreList = exploreStep("explore story list", ["explore", "story", "list", exploreJourney]);
check(
  exploreList.stdout.includes("[[MIRROR_REQUIRED_SURFACE_BEGIN:exploratory_stories]]"),
  "explore story list emits the required-surface marker",
  exploreList.stdout.slice(0, 120),
);

exploreStep("explore story archive", ["explore", "story", "archive", exploreJourney]);
const [archivedSession] = query<{ metadata: string | null; active: number }>(
  "SELECT metadata, active FROM runtime_sessions WHERE session_id = ?",
  `__explorer_story__:${exploreJourney}`,
);
check(
  archivedSession?.active === 0 && archivedSession?.metadata === null,
  "archive deactivates the legacy payload instead of leaving it readable",
  `active=${archivedSession?.active} metadata=${String(archivedSession?.metadata)}`,
);

// `explore load` activates the mode. TS only: it WRITES, and both engines would
// each claim the row.
const exploreLoad = exploreStep("explore load", ["explore", "load", exploreJourney]);
check(
  exploreLoad.stdout.includes("EXPLORER MODE ACTIVE"),
  "explore load renders the entry card",
  exploreLoad.stdout.slice(0, 120),
);
check(
  exploreLoad.stdout.includes("=== Explorer Mode guidance ==="),
  "explore load emits the guidance block",
  exploreLoad.stdout.slice(-200),
);

// `story promote` answers from TypeScript since US8 plateau 7, when the leaf its
// tail depends on — Builder `load` — was ported.
//
// The story was ARCHIVED two steps above, so this exercises the refusal path:
// no active story means no handoff, which Python renders and returns from BEFORE
// reaching `cmd_load`. That is deliberate here — the session-start path spends
// on a provider, and this smoke runs with no key by contract. The promotion that
// does enter Builder is graded under replay in `test/frontDoor/explorePromote.test.ts`.
const explorePromote = runExplore(["explore", "story", "promote", exploreJourney], EXPLORE_ON);
check(
  explorePromote.route === "ts",
  "explore story promote is answered by TypeScript (US8 plateau 7)",
  explorePromote.route,
);
check(
  explorePromote.status === 0 &&
    explorePromote.stdout.includes("[[MIRROR_REQUIRED_SURFACE_BEGIN:no_builder_handoff]]"),
  "promote with no active story renders the no-handoff surface and exits 0",
  `exit=${explorePromote.status} ${explorePromote.stdout.slice(0, 120)}`,
);

// An unknown action gets `explore story`'s own usage answer, never inheritance
// (CV22.DS10.TS5, D2).
const exploreUnknown = runExplore(["explore", "story", "publish", exploreJourney], EXPLORE_ON);
check(
  exploreUnknown.route === "usage" && exploreUnknown.status === 2,
  "an unallowlisted explore story action gets the family's usage answer",
  `${exploreUnknown.route} exit=${exploreUnknown.status}`,
);

// The TS route accepts `--mirror-home` like every other front-door command.
const exploreHomeFlagTs = runExplore(
  ["explore", "story", "show", exploreJourney, "--mirror-home", home],
  EXPLORE_ON,
);
check(
  exploreHomeFlagTs.status === 0,
  "TS explore accepts --mirror-home",
  `${exploreHomeFlagTs.status}`,
);

const exploreLog = readFileSync(join(home, "front-door.log"), "utf8");
check(
  !exploreLog.includes("ainda não sabemos nomear") &&
    !exploreLog.includes("problema de renderização"),
  "the front-door log carries no exploratory story text",
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
