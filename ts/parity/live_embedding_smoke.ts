/**
 * Navigator-run live embedding smoke contract (CV22.DS8.US1).
 *
 * NEVER runs in CI. This is the only check in the repo that spends real money
 * and reaches a real provider, so it is a script a human runs deliberately,
 * not a test a pipeline can trip into.
 *
 * What the hermetic tests cannot prove:
 *
 *   - that the live request shape is accepted by OpenRouter at all;
 *   - that the vectors it returns are usable (1536-dim, finite, self-consistent);
 *   - that TS vectors live in the SAME SPACE as the vectors already in the
 *     corpus, which Python produced. Dimension and self-similarity prove the
 *     pipe works; only `--cross-check` proves the geometry matches. Without it
 *     a silent provider re-route to a different 1536-dim space would degrade
 *     every ranking with no failing test anywhere (AI-07 is a shape guard, not
 *     a space guard).
 *
 * Usage (note `--env-file`: the key lives in .env, and this script reads it
 * from the ENVIRONMENT only -- it never opens a secrets file itself):
 *   node --env-file=.env ts/parity/live_embedding_smoke.ts --db tmp/parity/demo-memory.db
 *   node --env-file=.env ts/parity/live_embedding_smoke.ts --db tmp/parity/real-copy.db \
 *     --cross-check <memory-id>
 *
 * Output is redacted by default: counts, dimensions, similarities, latencies.
 * Never a vector, never a memory's content, never the key.
 */

import { assertCopyTarget } from "#db/copyGuard.ts";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import { resolveEmbeddingModel, resolveLogLlmCallsMode } from "#providers/config.ts";
import { EMBEDDING_DIMENSIONS, LiveEmbeddingProvider } from "#providers/embedding.ts";
import { searchMemoriesWithStatus } from "#search/memorySearch.ts";
// The ranker's own cosine, not a second copy: this smoke exists to judge
// vector similarity, so it must measure it the way search does.
import { cosineSimilarity } from "#search/ranker.ts";
import { memoryEmbedText } from "#soul/harvest.ts";

const PROBE_TEXT = "The mirror keeps a local memory of journeys, decisions, and identity.";
const PROBE_DISTANT = "Sourdough starter needs feeding twice a day in warm weather.";

/** Captures everything printed so the run can grep itself for the key. */
const printed: string[] = [];
function say(line: string): void {
  printed.push(line);
  process.stdout.write(`${line}\n`);
}

function optionValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function bytesToVector(blob: Uint8Array): readonly number[] {
  return Array.from(
    new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / Float32Array.BYTES_PER_ELEMENT),
  );
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
    // Name the fix, not just the problem: the key is in .env, and every other
    // entry point in this repo reaches it through node's --env-file. A bare
    // `node ts/parity/...` is the obvious thing to type and the wrong one.
    fail(
      "OPENROUTER_API_KEY is not set; this smoke exercises the LIVE path. " +
        "If your key is in .env, re-run with: node --env-file=.env ts/parity/live_embedding_smoke.ts ...",
    );
  }
  const dbPath = optionValue(argv, "--db");
  if (!dbPath) fail("--db <copy> is required");
  // Fails closed on a live memory.db or any path outside tmp/. The smoke both
  // reads memories and writes llm_calls rows, so it must never touch the real
  // database (CR030 copy discipline). Reported as a clean refusal rather than
  // a stack trace: this is the guard a hurried operator is most likely to hit.
  try {
    assertCopyTarget(dbPath);
  } catch (error) {
    fail(error instanceof Error ? error.message : "refusing this database path");
  }

  const model = resolveEmbeddingModel();
  say(`live embedding smoke -- model=${model} db=${dbPath}`);

  const db = openDatabaseCopyForWrite(dbPath);
  const before = ledgerCount(db);
  const provider = new LiveEmbeddingProvider();

  try {
    const t0 = Date.now();
    const first = await provider.embed(PROBE_TEXT);
    const firstMs = Date.now() - t0;
    const second = await provider.embed(PROBE_TEXT);
    const distant = await provider.embed(PROBE_DISTANT);

    check(
      first.vector.length === EMBEDDING_DIMENSIONS,
      "dimension",
      `${first.vector.length} == ${EMBEDDING_DIMENSIONS}`,
    );
    check(
      first.vector.every((value) => Number.isFinite(value)),
      "all values finite",
      "no NaN or Infinity would reach the corpus",
    );
    const selfSimilarity = cosineSimilarity(first.vector, second.vector);
    check(
      selfSimilarity >= 0.999,
      "self-similarity",
      `cos=${selfSimilarity.toFixed(6)} >= 0.999`,
    );
    const distantSimilarity = cosineSimilarity(first.vector, distant.vector);
    check(
      distantSimilarity < selfSimilarity,
      "an unrelated sentence is further away",
      `cos=${distantSimilarity.toFixed(4)} < ${selfSimilarity.toFixed(4)}`,
    );
    say(`  ..  first-call latency ${firstMs}ms, usage prompt_tokens=${first.promptTokens ?? "null"}`);

    const crossCheckId = optionValue(argv, "--cross-check");
    if (crossCheckId) await crossCheck(db, provider, crossCheckId);
    else
      say(
        "  ..  --cross-check skipped: vector-space parity against a Python-era vector NOT proven",
      );

    // The probes above call the provider DIRECTLY, so they exercise the
    // transport but nothing that writes to `llm_calls` -- the ledger row is
    // produced by generateEmbeddingSafely's onAttempt hook, one layer up.
    // Run one real search through that layer so the ledger assertions below
    // are about behavior this script actually caused.
    await searchMemoriesWithStatus(db, {
      query: "mirror identity and memory",
      limit: 3,
      provider,
    });
    reportLedger(db, ledgerCount(db) - before, model);
  } finally {
    db.close();
  }

  const key = process.env.OPENROUTER_API_KEY ?? "";
  if (key && printed.some((line) => line.includes(key))) {
    fail("the API key appeared in this script's own output");
  }
  say("PASS live embedding smoke");
}

/**
 * The retrieval-parity proof: re-embed a real memory's text through TS and
 * compare with the vector Python stored for it. Anything below 0.99 means the
 * two engines are not embedding into the same space, and the cutover must not
 * proceed on shape checks alone.
 */
async function crossCheck(
  db: ReturnType<typeof openDatabaseCopyForWrite>,
  provider: LiveEmbeddingProvider,
  memoryId: string,
): Promise<void> {
  const row = db
    .prepare("SELECT title, content, context, embedding FROM memories WHERE id = ?")
    .get(memoryId) as
    | { title: string; content: string; context: string | null; embedding: Uint8Array }
    | undefined;
  if (!row) fail(`--cross-check memory ${memoryId} not found in the copy`);
  if (!(row.embedding instanceof Uint8Array)) fail("stored embedding is not a BLOB");

  const stored = bytesToVector(row.embedding);
  if (stored.length !== EMBEDDING_DIMENSIONS) {
    fail(`stored vector is ${stored.length}-dim; pick a memory embedded with the current pin`);
  }
  // The SAME text add_memory embedded, CONTEXT INCLUDED. Python's
  // memory_embed_text appends "Context: ..." when the column is set, and on a
  // real home essentially every extracted memory has one -- embedding without
  // it would compare two different sentences and report a low cosine that says
  // nothing about whether the two engines share a vector space.
  const fresh = await provider.embed(memoryEmbedText(row.title, row.content, row.context));
  const similarity = cosineSimilarity(stored, fresh.vector);
  check(
    similarity >= 0.99,
    "vector-space parity with the stored Python-era vector",
    `cos=${similarity.toFixed(6)} >= 0.99`,
  );
}

function ledgerCount(db: ReturnType<typeof openDatabaseCopyForWrite>): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM llm_calls").get() as { n: number };
  return row.n;
}

/** Reports the rows the run produced. Bodies must be empty in metadata mode. */
function reportLedger(
  db: ReturnType<typeof openDatabaseCopyForWrite>,
  added: number,
  model: string,
): void {
  if (resolveLogLlmCallsMode() === "off") {
    // A deliberate operator choice, not a defect: say so rather than failing.
    say("  ..  MEMORY_LOG_LLM_CALLS=off -- ledger assertions skipped by configuration");
    return;
  }
  check(added > 0, "ledger rows written", `${added} new llm_calls rows`);
  const rows = db
    .prepare(
      `SELECT model, prompt_tokens, cost_usd, latency_ms, LENGTH(prompt) AS prompt_len,
              LENGTH(response) AS response_len
         FROM llm_calls WHERE role = 'embedding' ORDER BY called_at DESC LIMIT ?`,
    )
    .all(added) as {
    model: string;
    prompt_tokens: number | null;
    cost_usd: number | null;
    latency_ms: number | null;
    prompt_len: number;
    response_len: number;
  }[];

  check(
    rows.every((row) => row.model === model),
    "every row names the configured pin",
    model,
  );
  check(
    rows.every((row) => row.prompt_len === 0 && row.response_len === 0),
    "bodies withheld",
    "metadata mode never persists the query text",
  );
  check(
    rows.every((row) => (row.latency_ms ?? 0) > 0),
    "latency recorded",
    "a real round-trip took measurable time",
  );
  // Usage and cost are REPORTED, not asserted: whether OpenRouter returns
  // `usage` for embeddings is a provider fact, and Python writes null in the
  // same case. Parity against Python's row for the same query is step 4 of the
  // Navigator route in test-guide.md, and that is where it is judged.
  const priced = rows.filter((row) => row.cost_usd !== null).length;
  say(
    `  ..  usage reported on ${priced}/${rows.length} rows` +
      `${priced === 0 ? " (provider omitted usage; Python must show the same)" : ""}`,
  );
}

await main(process.argv.slice(2));
