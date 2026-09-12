/**
 * Navigator-run live smoke for the long tail (CV22.DS8.US3).
 *
 * NEVER runs in CI. It spends real money and, for most probes, performs a real
 * write — against a COPY of the database, enforced by the same copy guard the
 * write-parity harness uses.
 *
 * Why this exists beyond the hermetic tests: those assert the request we build
 * and the response we parse. They cannot tell us that a real model, given the
 * digest-graded prompts, returns something each parser can actually use. A run
 * where every call comes back `parse_failed` satisfies every unit test, writes
 * the same number of ledger rows, and is a total product regression — which is
 * why every probe reports the OUTCOME, not a count (US3 plan review,
 * ai-engineer).
 *
 * Usage (the key lives in .env; this script reads the environment only):
 *   node --env-file=.env ts/parity/live_long_tail_smoke.ts --db tmp/parity/real-copy.db credits
 *   node --env-file=.env ts/parity/live_long_tail_smoke.ts --db tmp/parity/real-copy.db ask
 *   ... mirror-query | journal | harvest | week-plan | descriptor | apply
 *   ... consolidate-scan | shadow-scan        (gated until CV22.DS8.TS2)
 *
 * Output is redacted by construction: verdicts, counts, lengths, latencies,
 * costs, and outcome CLASSES. Never a prompt, never a model response, never a
 * memory's content, never the identity context — this output is pasted into a
 * story package.
 */

import { runConsult } from "#consult/core.ts";
import { parseConsultArgs } from "#consult/args.ts";
import { consolidateScan, shadowScan } from "#cultivation/scan.ts";
import { assertCopyTarget } from "#db/copyGuard.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { routeMemoryCommand } from "#frontDoor/routing.ts";
import { runConsolidateApply } from "#frontDoor/cultivationRoute.ts";
import {
  runDescriptorGenerateRoute,
  runJournalRoute,
  runWeekPlanRoute,
} from "#frontDoor/contentTailRoute.ts";
import { runSoulRoute } from "#frontDoor/soulRoute.ts";
import { runMirrorLoad } from "#mirror/orchestration.ts";
import {
  type ProviderCallReport,
  CallOutcomeTally,
  formatCallOutcome,
} from "#observability/callOutcome.ts";
import { chatLedgerHook, embeddingLedgerHook } from "#observability/ledgerHooks.ts";
import { resolveEmbeddingModel, resolveExtractionModel } from "#providers/config.ts";
import { EMBEDDING_DIMENSIONS, generateEmbeddingSafely } from "#providers/embedding.ts";
import { resolveFamilyProviders } from "#providers/familyProviders.ts";
import {
  CONSULT_ASK_TRANSPORT,
  CONSULT_CREDITS_TRANSPORT,
  CULTIVATION_APPLY_TRANSPORT,
  CULTIVATION_SCAN_TRANSPORT,
  DESCRIPTOR_TRANSPORT,
  JOURNAL_TRANSPORT,
  MIRROR_QUERY_TRANSPORT,
  SOUL_HARVEST_TRANSPORT,
  WEEK_PLAN_TRANSPORT,
} from "#providers/transport.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const printed: string[] = [];

function say(line: string): void {
  printed.push(line);
  process.stdout.write(`${line}\n`);
}

function fail(message: string): never {
  say(`FAIL ${message}`);
  process.exit(1);
}

function check(condition: boolean, label: string, detail: string): void {
  if (!condition) fail(`${label} -- ${detail}`);
  say(`  ok  ${label} (${detail})`);
}

function note(line: string): void {
  say(`  ..  ${line}`);
}

function optionValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

/**
 * Run a route without letting its rendered output reach this script's stdout.
 *
 * Journal receipts, Mirror cards, and week plans echo user content and
 * identity context. The verdicts below describe them structurally instead.
 */
async function quietly<T>(run: () => Promise<T>): Promise<T> {
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    return await run();
  } finally {
    process.stdout.write = original;
  }
}

// --- ledger reading -----------------------------------------------------------

interface LedgerRow {
  role: string;
  cost_usd: number | null;
  prompt_tokens: number | null;
  p: number;
  r: number;
}

function ledgerSince(db: WritableDatabase, rowid: number): LedgerRow[] {
  return db
    .prepare(
      `SELECT role, cost_usd, prompt_tokens, LENGTH(prompt) AS p, LENGTH(response) AS r
         FROM llm_calls WHERE rowid > ? ORDER BY rowid`,
    )
    .all(rowid) as unknown as LedgerRow[];
}

function maxLedgerRowid(db: WritableDatabase): number {
  const row = db.prepare("SELECT COALESCE(MAX(rowid), 0) AS n FROM llm_calls").get() as { n: number };
  return row.n;
}

/** Roles, pricing, and body withholding — the three ledger properties that matter. */
/**
 * The live witness that the INSTRUCTION TEXT reached the model, per role
 * (CV22.DS8.TS2). The ledger withholds bodies, so the digest cannot be
 * observed live; the token count can. The dump prompt these two leaves sent
 * until TS2 was ~50 tokens; the real templates alone are ~550 and ~400 before
 * any memory or identity text, so a row under the floor means a dump went out.
 */
const PROMPT_TOKEN_FLOORS: Readonly<Record<string, number>> = {
  consolidation: 400,
  shadow_scan: 300,
};

function checkLedger(rows: readonly LedgerRow[], expectedRoles: readonly string[]): void {
  note(`ledger: ${rows.map((row) => row.role).join(" -> ") || "(none)"}`);
  for (const role of expectedRoles) {
    check(
      rows.some((row) => row.role === role),
      `a ${role} row was written`,
      "Python writes one here too",
    );
    const floor = PROMPT_TOKEN_FLOORS[role];
    if (floor !== undefined) {
      const tokens = rows.filter((row) => row.role === role).map((row) => row.prompt_tokens);
      check(
        tokens.length > 0 && tokens.every((n) => n !== null && n >= floor),
        `${role} prompt_tokens >= ${floor}`,
        `saw ${tokens.join(", ") || "(none)"}: the instruction text, not a memory dump, was sent`,
      );
    }
  }
  check(
    rows.every((row) => row.p === 0 && row.r === 0),
    "bodies withheld",
    "no prompt or response text persisted",
  );
  const priced = rows.filter((row) => row.cost_usd !== null).length;
  const spend = rows.reduce((sum, row) => sum + (row.cost_usd ?? 0), 0);
  note(`priced ${priced}/${rows.length} rows, total ${usd(spend)}`);
}

/** Sub-microcent totals are real (a `2.0e-07` apply embed); do not round them to `$0.000000`. */
function usd(amount: number): string {
  return amount !== 0 && Math.abs(amount) < 1e-6
    ? `$${amount.toExponential(1)}`
    : `$${amount.toFixed(6)}`;
}

function tallyOf(): { tally: CallOutcomeTally; onOutcome: (report: ProviderCallReport) => void } {
  const tally = new CallOutcomeTally();
  return { tally, onOutcome: (report) => tally.record(report) };
}

/**
 * The verdict the whole seam exists for: a run that produced nothing because
 * the model's answer was unusable is a PROMPT-layer regression, and it must not
 * pass as "nothing to do".
 */
function checkOutcomes(tally: CallOutcomeTally, options: { requireAnswered: boolean }): void {
  note(`outcomes: ${tally.summary()}`);
  check(tally.calls > 0, "the probe actually called the provider", `calls=${tally.calls}`);
  check(
    !tally.summary().includes("parse_failed"),
    "no parse_failed outcome",
    "a call that came back unusable is a prompt-layer finding, not an empty result",
  );
  check(
    !tally.summary().includes("transport_failed"),
    "no transport_failed outcome",
    "every call reached the provider",
  );
  if (options.requireAnswered) {
    check(
      tally.summary().includes("answered="),
      "at least one call carried a result",
      "a zero-result run would pass a count-based check and prove nothing",
    );
  }
}

// --- probes -------------------------------------------------------------------

/** The cheapest live check: one GET, no spend, no write. */
async function creditsProbe(): Promise<void> {
  const family = await resolveFamilyProviders(process.env, CONSULT_CREDITS_TRANSPORT);
  if (!family?.credits) fail("no credit provider resolved; is MIRROR_TS_CONSULT=0 set?");
  check(family.mode === "live", "transport is live", family.mode);

  const startedAt = Date.now();
  const info = await family.credits.getCredits();
  note(`latency ${Date.now() - startedAt}ms`);

  for (const [label, value] of Object.entries(info)) {
    check(Number.isFinite(value), `${label} is a finite number`, `${value}`);
  }
  check(
    Math.abs(info.balance - (info.totalCredits - info.totalUsage)) < 1e-9,
    "balance = total - usage",
    "the arithmetic the bar renders",
  );
}

/** One consult call, its real fetched cost, and the ledger row it must leave. */
async function askProbe(db: WritableDatabase, question: string): Promise<void> {
  const family = await resolveFamilyProviders(process.env, CONSULT_ASK_TRANSPORT);
  if (!family?.llm || !family.credits) fail("consult ask did not resolve both providers");
  check(family.mode === "live", "transport is live", family.mode);

  const before = maxLedgerRowid(db);
  const command = parseConsultArgs(["openai", "lite", question]);
  const startedAt = Date.now();
  // No identity context: this smoke must not put the user's identity on the
  // wire, and the envelope's SHAPE is what is under test here.
  const rendered = await quietly(() =>
    runConsult(command, {
      llm: family.llm as NonNullable<typeof family.llm>,
      credits: family.credits as NonNullable<typeof family.credits>,
      loadContext: () => "",
      db,
    }),
  );
  note(`latency ${Date.now() - startedAt}ms, rendered ${rendered.length} chars`);

  const rows = ledgerSince(db, before);
  checkLedger(rows, ["consult"]);
  const consultRow = rows.find((row) => row.role === "consult");
  note(
    consultRow?.cost_usd === null
      ? "cost is null: the generation poll never exposed a figure (Python's behavior too)"
      : `cost ${usd(consultRow?.cost_usd ?? 0)} fetched from /generation`,
  );
}

/** Reception plus the query's own embedding, through the real orchestration. */
async function mirrorQueryProbe(
  db: WritableDatabase,
  dbPath: string,
  query: string,
): Promise<void> {
  const family = await resolveFamilyProviders(process.env, MIRROR_QUERY_TRANSPORT);
  if (!family?.llm || !family.embedding) fail("mirror query did not resolve both providers");
  check(family.mode === "live", "transport is live", family.mode);

  const before = maxLedgerRowid(db);
  const { tally, onOutcome } = tallyOf();
  const mirrorHome = dirname(dbPath);
  const startedAt = Date.now();
  const rendered = await runMirrorLoad(db, {
    identity: "smoke",
    databasePath: dbPath,
    mirrorHome,
    user: "smoke",
    persona: null,
    journey: null,
    query,
    org: false,
    contextOnly: true,
    sessionId: null,
    environmentSessionId: null,
    receptionEnabled: true,
    llmProvider: family.llm,
    embeddingProvider: family.embedding,
    onReceptionOutcome: onOutcome,
    newId,
    nowIso,
  });
  const elapsed = Date.now() - startedAt;

  // The card carries identity context; only its size is reported.
  note(`latency ${elapsed}ms, context ${rendered.stdout.length} chars`);
  check(
    elapsed < 40_000,
    "within the stated reception bound",
    "3 attempts x 10s reception tier plus backoff",
  );
  checkOutcomes(tally, { requireAnswered: false });
  checkLedger(ledgerSince(db, before), ["reception"]);
}

/** A journal entry: one classification, one embedding, one memory row. */
async function journalProbe(db: WritableDatabase, text: string): Promise<void> {
  const family = await resolveFamilyProviders(process.env, JOURNAL_TRANSPORT);
  if (!family?.llm || !family.embedding) fail("journal did not resolve both providers");
  check(family.mode === "live", "transport is live", family.mode);

  const before = maxLedgerRowid(db);
  const memoriesBefore = countMemories(db);
  const exitCode = await quietly(() =>
    runJournalRoute(db, ["journal", text], {
      llm: family.llm as NonNullable<typeof family.llm>,
      embedding: family.embedding as NonNullable<typeof family.embedding>,
    }),
  );

  check(exitCode === 0, "journal exited 0", `exit=${exitCode}`);
  check(countMemories(db) === memoriesBefore + 1, "one memory row written", "the journal entry");
  const row = db
    .prepare(
      `SELECT title, LENGTH(embedding) AS bytes, tags, metadata FROM memories
        ORDER BY rowid DESC LIMIT 1`,
    )
    .get() as { title: string; bytes: number; tags: string | null; metadata: string | null };
  check(row.title.trim().length > 0, "a title was classified", `${row.title.length} chars`);
  check([...row.title].length <= 60, "title within the AI-24 cap", "<= 60 code points");
  check(row.bytes === EMBEDDING_DIMENSIONS * 4, "vector is 1536 dims", `${row.bytes} bytes`);
  check(Array.isArray(safeJson(row.tags)), "tags stored as a list", typeLabel(safeJson(row.tags)));
  check(
    String(row.metadata ?? "").includes("embedding_model"),
    "embedding provenance recorded",
    "AI-07",
  );
  checkLedger(ledgerSince(db, before), ["journal_classification", "embedding"]);
}

/** `soul harvest save`: the leaf that had no provider at all before US3. */
async function harvestProbe(db: WritableDatabase, sessionId: string): Promise<void> {
  const family = await resolveFamilyProviders(process.env, SOUL_HARVEST_TRANSPORT);
  if (!family?.embedding) fail("soul harvest save did not resolve an embedding provider");
  check(family.mode === "live", "transport is live", family.mode);

  const state = db
    .prepare("SELECT metadata FROM runtime_sessions WHERE session_id = ?")
    .get(sessionId) as { metadata: string | null } | undefined;
  if (!state) fail(`runtime session ${sessionId} not found in the copy`);
  if (!String(state.metadata ?? "").includes("harvested_fruit")) {
    fail(`session ${sessionId} has no harvested fruit; set one with \`soul harvest set\` first`);
  }

  const before = maxLedgerRowid(db);
  const memoriesBefore = countMemories(db);
  const exitCode = await quietly(() =>
    runSoulRoute(db, ["soul", "harvest", "save", "--session-id", sessionId]),
  );

  check(exitCode === 0, "harvest save exited 0", `exit=${exitCode}`);
  check(countMemories(db) === memoriesBefore + 1, "one journal memory written", "the harvest");
  const cleared = db
    .prepare("SELECT metadata FROM runtime_sessions WHERE session_id = ?")
    .get(sessionId) as { metadata: string | null };
  check(
    !String(cleared.metadata ?? "").includes('"harvested_fruit"'),
    "the fruit was cleared after the write",
    "and only after: a failed embedding leaves it for a retry",
  );
  checkLedger(ledgerSince(db, before), ["embedding"]);
}

/** `week plan`: one call, a parsed item list, a pending file in tmp. */
async function weekPlanProbe(db: WritableDatabase, text: string, pendingPath: string): Promise<void> {
  const family = await resolveFamilyProviders(process.env, WEEK_PLAN_TRANSPORT);
  if (!family?.llm) fail("week plan did not resolve an LLM provider");
  check(family.mode === "live", "transport is live", family.mode);

  const before = maxLedgerRowid(db);
  const exitCode = await quietly(() =>
    runWeekPlanRoute(db, [text], family.llm as NonNullable<typeof family.llm>, { pendingPath }),
  );

  check(exitCode === 0, "week plan exited 0", `exit=${exitCode}`);
  const pending = readJsonFile(pendingPath);
  if (pending === null) {
    note("no pending file: the model found no temporal items (a legitimate outcome)");
  } else {
    check(Array.isArray(pending), "pending file holds a list", typeLabel(pending));
    note(`pending items: ${(pending as unknown[]).length}`);
  }
  checkLedger(ledgerSince(db, before), ["week_plan"]);
}

/** `descriptor generate` for ONE entity: the fan-out is the thing to bound. */
async function descriptorProbe(
  db: WritableDatabase,
  layer: string,
  key: string,
): Promise<void> {
  const family = await resolveFamilyProviders(process.env, DESCRIPTOR_TRANSPORT);
  if (!family?.llm) fail("descriptor generate did not resolve an LLM provider");
  check(family.mode === "live", "transport is live", family.mode);

  const before = maxLedgerRowid(db);
  const { tally, onOutcome } = tallyOf();
  const exitCode = await quietly(() =>
    runDescriptorGenerateRoute(
      db,
      ["generate", "--layer", layer, "--key", key],
      family.llm as NonNullable<typeof family.llm>,
      onOutcome,
    ),
  );

  check(exitCode === 0, "descriptor generate exited 0", `exit=${exitCode}`);
  check(tally.calls === 1, "exactly one entity was described", `calls=${tally.calls}`);
  checkOutcomes(tally, { requireAnswered: true });
  const row = db
    .prepare("SELECT LENGTH(descriptor) AS n FROM identity_descriptors WHERE layer = ? AND key = ?")
    .get(layer, key) as { n: number } | undefined;
  check((row?.n ?? 0) > 0, "a descriptor was stored", `${row?.n ?? 0} chars`);
  // Python writes NO ledger row here; TypeScript does, by decision.
  checkLedger(ledgerSince(db, before), ["descriptor"]);
}

/** `consolidate apply` on a pending merge: an embedding, no prompt. */
async function applyProbe(db: WritableDatabase, proposalId: string): Promise<void> {
  const family = await resolveFamilyProviders(process.env, CULTIVATION_APPLY_TRANSPORT);
  if (!family?.embedding) fail("consolidate apply did not resolve an embedding provider");
  check(family.mode === "live", "transport is live", family.mode);

  const before = maxLedgerRowid(db);
  const memoriesBefore = countMemories(db);
  const outcome = await runConsolidateApply(
    db,
    proposalId,
    null,
    { identityId: newId(), mergeMemoryId: newId(), nowIso: nowIso() },
    family.embedding,
  );

  check(outcome.kind === "applied", "the proposal applied", outcome.kind);
  check(countMemories(db) === memoriesBefore + 1, "the merged memory was written", "one row");
  checkLedger(ledgerSince(db, before), ["embedding"]);
}

/**
 * The two scan leaves. The probe reads the ROUTE rather than assuming it is
 * live: from DS8.US3 until DS8.TS2 ported `CONSOLIDATION_PROMPT` and
 * `SHADOW_SCAN_PROMPT`, `routing.ts` refused them by name and this probe
 * printed SKIPPED without spending. It still would, should a revert be set.
 */
async function scanProbe(db: WritableDatabase, which: "consolidate" | "shadow"): Promise<void> {
  const argv = which === "consolidate" ? ["consolidate", "scan"] : ["shadow", "scan"];
  const decision = routeMemoryCommand(argv, process.env);
  if (decision.engine !== "ts") {
    say(`  --  SKIPPED: ${argv.join(" ")} does not route to TypeScript yet`);
    note(`route reason: ${decision.reason}`);
    note("no call was made and nothing was spent");
    return;
  }

  const family = await resolveFamilyProviders(process.env, CULTIVATION_SCAN_TRANSPORT);
  if (!family?.llm) fail(`${which} scan did not resolve an LLM provider`);
  check(family.mode === "live", "transport is live", family.mode);

  const before = maxLedgerRowid(db);
  const { tally, onOutcome } = tallyOf();
  if (which === "consolidate") {
    const result = await consolidateScan(db, {
      limit: 3,
      provider: family.llm,
      id: newId,
      nowIso,
      onLlmCall: chatLedgerHook(db, "consolidation"),
      onOutcome,
    });
    note(`clusters considered: ${result.results.length}`);
  } else {
    const result = await shadowScan(db, {
      limit: 5,
      provider: family.llm,
      id: newId,
      nowIso,
      onLlmCall: chatLedgerHook(db, "shadow_scan"),
      onOutcome,
    });
    note(`candidates considered: ${result.candidatesConsidered}`);
  }

  // requireAnswered: a seeded-or-real cluster that produces no proposal at all
  // is the exact run a count-based verdict would wave through.
  checkOutcomes(tally, { requireAnswered: which === "consolidate" });
  checkLedger(ledgerSince(db, before), [
    which === "consolidate" ? "consolidation" : "shadow_scan",
  ]);
}

// --- helpers ------------------------------------------------------------------

function countMemories(db: WritableDatabase): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM memories").get() as { n: number }).n;
}

function safeJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function typeLabel(value: unknown): string {
  if (Array.isArray(value)) return `array(${value.length})`;
  return value === null ? "null" : typeof value;
}

function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const PROBES = [
  "credits",
  "ask",
  "mirror-query",
  "journal",
  "harvest",
  "week-plan",
  "descriptor",
  "apply",
  "consolidate-scan",
  "shadow-scan",
] as const;

async function main(argv: readonly string[]): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    fail(
      "OPENROUTER_API_KEY is not set; this smoke exercises the LIVE path. " +
        "If your key is in .env, re-run with: node --env-file=.env " +
        "ts/parity/live_long_tail_smoke.ts ...",
    );
  }
  const dbPath = optionValue(argv, "--db");
  if (!dbPath) fail("--db <copy> is required");
  try {
    assertCopyTarget(dbPath);
  } catch (error) {
    fail(error instanceof Error ? error.message : "refusing this database path");
  }
  const probe = argv.find((token) => (PROBES as readonly string[]).includes(token));
  if (!probe) fail(`one probe is required: ${PROBES.join(" | ")}`);

  say(
    `live long-tail smoke -- probe=${probe} chat=${resolveExtractionModel()} ` +
      `embedding=${resolveEmbeddingModel()}`,
  );
  say(`  ..  db=${dbPath}`);

  const db = openDatabaseCopyForWrite(dbPath);
  try {
    switch (probe) {
      case "credits":
        await creditsProbe();
        break;
      case "ask":
        await askProbe(db, optionValue(argv, "--question") ?? "Reply with one short sentence.");
        break;
      case "mirror-query":
        await mirrorQueryProbe(db, dbPath, optionValue(argv, "--query") ?? "how is the port going?");
        break;
      case "journal":
        await journalProbe(
          db,
          optionValue(argv, "--text") ?? "Live long-tail smoke entry for CV22.DS8.US3.",
        );
        break;
      case "harvest":
        await harvestProbe(db, optionValue(argv, "--session-id") ?? fail("--session-id required"));
        break;
      case "week-plan":
        await weekPlanProbe(
          db,
          optionValue(argv, "--text") ?? "Segunda: revisar o plano da US3.",
          optionValue(argv, "--pending") ?? join(dirname(dbPath), "smoke-week-pending.json"),
        );
        break;
      case "descriptor":
        await descriptorProbe(
          db,
          optionValue(argv, "--layer") ?? "persona",
          optionValue(argv, "--key") ?? fail("--key required, to bound the fan-out to one entity"),
        );
        break;
      case "apply":
        await applyProbe(db, optionValue(argv, "--proposal") ?? fail("--proposal <id> required"));
        break;
      case "consolidate-scan":
        await scanProbe(db, "consolidate");
        break;
      case "shadow-scan":
        await scanProbe(db, "shadow");
        break;
      default:
        fail(`unknown probe ${probe}`);
    }
  } finally {
    db.close();
  }

  const key = process.env.OPENROUTER_API_KEY ?? "";
  if (key && printed.some((line) => line.includes(key))) {
    fail("the API key appeared in this script's own output");
  }
  say(`PASS live long-tail smoke -- ${probe}`);
}

await main(process.argv.slice(2));
