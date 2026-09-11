/**
 * Navigator-run live chat + close-tail smoke contract (CV22.DS8.US2).
 *
 * NEVER runs in CI. It spends real money and, with `--session-end`, performs
 * the product's actual unattended write path — extraction, titling, tagging,
 * summarising, embedding — against a real model.
 *
 * Why this exists beyond the hermetic tests: those assert the request we build
 * and the response we parse. They cannot tell us that a real model, given the
 * digest-graded prompts, returns something the parser can actually use. A run
 * where every role comes back `parse_failed` would satisfy every unit test and
 * be a total product regression, so this reports STRUCTURAL VERDICTS, not
 * counts (CV22.DS8.US2 plan review, ai-engineer).
 *
 * Usage (the key lives in .env; this script reads the environment only):
 *   node --env-file=.env ts/parity/live_chat_smoke.ts --db tmp/parity/real-copy.db
 *   node --env-file=.env ts/parity/live_chat_smoke.ts --db tmp/parity/real-copy.db \
 *     --session-end <conversation-id>
 *
 * Without `--session-end` it makes ONE cheap title-shaped call and lists
 * candidate conversations. With it, it runs the full close tail on the copy.
 * Output is redacted: verdicts, counts, lengths, latencies — never content.
 */

import { assertCopyTarget } from "#db/copyGuard.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createLoggerRuntime } from "#conversation/loggerRuntime.ts";
import { endConversation } from "#conversation/logger.ts";
import { resolveExtractionModel } from "#providers/config.ts";
import { LiveLlmProvider } from "#providers/llm.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";

/** Python's `_clean_title_suggestion` cap. NOT 60 — that is the journal
 * fallback from US11, a different surface entirely. */
const TITLE_MAX = 160;

const printed: string[] = [];
function say(line: string): void {
  printed.push(line);
  process.stdout.write(`${line}\n`);
}

function optionValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function fail(message: string): never {
  say(`FAIL ${message}`);
  process.exit(1);
}

function check(condition: boolean, label: string, detail: string): void {
  if (!condition) fail(`${label} -- ${detail}`);
  say(`  ok  ${label} (${detail})`);
}

async function main(argv: readonly string[]): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    fail(
      "OPENROUTER_API_KEY is not set; this smoke exercises the LIVE path. " +
        "If your key is in .env, re-run with: node --env-file=.env ts/parity/live_chat_smoke.ts ...",
    );
  }
  const dbPath = optionValue(argv, "--db");
  if (!dbPath) fail("--db <copy> is required");
  try {
    assertCopyTarget(dbPath);
  } catch (error) {
    fail(error instanceof Error ? error.message : "refusing this database path");
  }

  say(`live chat smoke -- model=${resolveExtractionModel()} db=${dbPath}`);
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    await chatProbe();
    const conversationId = optionValue(argv, "--session-end");
    if (conversationId) await closeTailProbe(db, dbPath, conversationId);
    else listCandidates(db);
  } finally {
    db.close();
  }

  const key = process.env.OPENROUTER_API_KEY ?? "";
  if (key && printed.some((line) => line.includes(key))) {
    fail("the API key appeared in this script's own output");
  }
  say("PASS live chat smoke");
}

/** One title-shaped call: the cheapest proof the live chat path works at all. */
async function chatProbe(): Promise<void> {
  const provider = new LiveLlmProvider();
  const startedAt = Date.now();
  const response = await provider.complete({
    role: "conversation_title",
    prompt:
      "Reply with a short title, four words at most, for a conversation about " +
      "porting a Python core to TypeScript. Reply with the title only.",
    temperature: 0.2,
    maxTokens: 40,
  });
  const elapsed = Date.now() - startedAt;

  check(response.content.length > 0, "chat returned content", `${response.content.length} chars`);
  check(response.content.length <= TITLE_MAX, "content within the title cap", `<= ${TITLE_MAX}`);
  check(Boolean(response.generationId), "generation id present", "cost is attributable");
  check(elapsed > 0 && elapsed < 60_000, "latency within the extraction tier", `${elapsed}ms`);
  say(
    `  ..  usage prompt=${response.promptTokens ?? "null"} completion=${
      response.completionTokens ?? "null"
    }`,
  );
}

/**
 * The real close tail on a copy: extraction, titling, tagging, summary, and
 * every embedding, through the same `endConversation` the session-end hook
 * calls. Reports what the MODEL produced structurally, because that is what
 * the hermetic tests cannot reach.
 */
async function closeTailProbe(
  db: WritableDatabase,
  dbPath: string,
  conversationId: string,
): Promise<void> {
  const before = counts(db, conversationId);
  const conversation = db
    .prepare("SELECT id, journey, ended_at FROM conversations WHERE id = ?")
    .get(conversationId) as { id: string; journey: string | null; ended_at: string | null } | undefined;
  if (!conversation) fail(`conversation ${conversationId} not found in the copy`);
  if (!conversation.journey) fail("conversation has no journey; extraction would be skipped");
  if (conversation.ended_at) say("  ..  conversation was already ended; re-closing on the copy");

  const messageCount = (
    db.prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?").get(conversationId) as
      | { n: number }
      | undefined
  )?.n;
  if ((messageCount ?? 0) < 4) fail(`conversation has ${messageCount} messages; extraction needs 4`);

  const runtime = createLoggerRuntime({
    db,
    mirrorHome: dbPath.replace(/\/[^/]+$/, ""),
    homeDir: process.env.HOME ?? "",
    env: process.env,
    deps: { newId, nowIso },
  });
  check(runtime.transportMode === "live", "transport is live", runtime.transportMode);

  const startedAt = Date.now();
  await endConversation(db, conversationId, { extract: true }, { newId, nowIso }, await runtime.closeHooks());
  say(`  ..  close tail completed in ${Date.now() - startedAt}ms`);

  const after = counts(db, conversationId);
  const row = db
    .prepare("SELECT title, tags, summary, metadata FROM conversations WHERE id = ?")
    .get(conversationId) as {
    title: string | null;
    tags: string | null;
    summary: string | null;
    metadata: string | null;
  };
  const metadata = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};

  // --- structural verdicts -------------------------------------------------
  const status = String(metadata.extraction_status ?? "missing");
  check(
    status === "ok" || status === "no_signal",
    "extraction_status",
    `${status} (parse_failed means the model's reply was unusable -- a PROMPT-layer finding)`,
  );
  check(Boolean(row.title?.trim()), "title generated", `${row.title?.length ?? 0} chars`);
  check((row.title?.length ?? 0) <= TITLE_MAX, "title within cap", `<= ${TITLE_MAX}`);
  check(Array.isArray(safeJson(row.tags)), "tags parsed as a list", typeofLabel(safeJson(row.tags)));
  check(Boolean(row.summary?.trim()), "summary present", `${row.summary?.length ?? 0} chars`);
  check(metadata.extracted === true, "conversation marked extracted", "the retry will not re-run it");

  const newMemories = after.memories - before.memories;
  say(`  ..  memories created: ${newMemories}`);
  if (status === "ok") {
    check(newMemories > 0, "extraction persisted memories", `${newMemories} rows`);
    const badVectors = (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM memories WHERE conversation_id = ? AND LENGTH(embedding) != 6144",
        )
        .get(conversationId) as { n: number }
    ).n;
    check(badVectors === 0, "every memory carries a 1536-dim vector", "no short/absent embeddings");
  }

  // --- ledger --------------------------------------------------------------
  const rows = db
    .prepare(
      `SELECT role, cost_usd, LENGTH(prompt) AS p, LENGTH(response) AS r
         FROM llm_calls WHERE conversation_id = ? ORDER BY called_at`,
    )
    .all(conversationId) as { role: string; cost_usd: number | null; p: number; r: number }[];
  check(rows.length > 0, "ledger rows written", `${rows.length} rows`);
  check(
    rows.every((entry) => entry.p === 0 && entry.r === 0),
    "bodies withheld",
    "no transcript text persisted in the ledger",
  );
  const priced = rows.filter((entry) => entry.cost_usd !== null).length;
  say(`  ..  role sequence: ${rows.map((entry) => entry.role).join(" -> ")}`);
  say(`  ..  priced ${priced}/${rows.length} rows (compare with Python's run for the same query)`);
}

function counts(db: WritableDatabase, conversationId: string): { memories: number } {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM memories WHERE conversation_id = ?")
    .get(conversationId) as { n: number };
  return { memories: row.n };
}

function safeJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function typeofLabel(value: unknown): string {
  if (Array.isArray(value)) return `array(${value.length})`;
  return value === null ? "null" : typeof value;
}

/** Conversations this smoke could close: un-extracted, journeyed, long enough. */
function listCandidates(db: WritableDatabase): void {
  const rows = db
    .prepare(
      `SELECT c.id, c.journey, COUNT(m.id) AS messages
         FROM conversations c JOIN messages m ON m.conversation_id = c.id
        WHERE c.journey IS NOT NULL
          AND COALESCE(json_extract(c.metadata, '$.extracted'), 0) != 1
        GROUP BY c.id HAVING COUNT(m.id) >= 4
        ORDER BY c.started_at DESC LIMIT 5`,
    )
    .all() as { id: string; journey: string; messages: number }[];
  say("  ..  candidates for --session-end (id / journey / messages):");
  for (const row of rows) say(`      ${row.id}  ${row.journey}  ${row.messages}`);
  if (rows.length === 0) say("      none found — every conversation in this copy is extracted");
}

await main(process.argv.slice(2));
