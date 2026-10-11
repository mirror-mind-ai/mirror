/**
 * Retrieval relevance eval (CV22.DS10.TS3, port of
 * `evals/retrieval_relevance.py`; originally CV9.E2.S28 / AI-14).
 *
 * Distinct from the reinforcement scoring contracts, which verify the scoring
 * math is internally consistent and now live in `ts/test/search/ranker.test.ts`
 * as CI tests. This eval asks a different question: given a real corpus and
 * real queries, does the hybrid ranker (semantic + recency + reinforcement +
 * relevance + lexical + MMR) surface memories a human would call relevant?
 * Answered with hit@k and MRR against a corpus and labeled queries authored
 * independently of the ranker's output -- never against the ranker's own
 * output, which would be circular.
 *
 * Frozen, not live: corpus and query embeddings were generated once against
 * the real embedding model and committed, so this module is deterministic and
 * **keyless**. That is why it stays in the harness rather than moving to CI
 * with the math contracts: it measures ranking QUALITY, which drifts when
 * weights change, and it is the one module that proves the harness works
 * without a key or a cent.
 *
 * It does not tune the weights -- it measures, so a future weight change
 * becomes a diff rather than a guess.
 *
 * Run:
 *   npm run eval -- retrieval_relevance
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabaseForBootstrap, type WritableDatabase } from "#db/database.ts";
import { SCHEMA } from "#db/schema.ts";
import type { EvalProbe, ProbeOutcome } from "#evals/harness/types.ts";
import type { EmbeddingProvider, EmbeddingResult } from "#providers/embedding.ts";
import { searchMemoriesWithStatus } from "#search/memorySearch.ts";

/**
 * Measured baseline (2026-07-18, current weights): 18/18 hit@k, MRR 0.9074,
 * probe score 19/19 = 1.0 -- the always-passing MRR aggregate counts toward
 * the denominator. Fully deterministic (frozen embeddings, frozen clock), so
 * there is no sampling noise to buffer against. Set just below perfect so any
 * single hit@k regression (18/19 = 0.947) trips it: an exact regression
 * detector, not loose slack.
 */
export const THRESHOLD = 0.95;

/** Frozen fixture: no live model call at eval time. */
export const EVAL_MODEL: string | undefined = undefined;
export const EVAL_PROMPTS: readonly string[] = [];

interface CorpusMemory {
  id: string;
  title: string;
  content: string;
  created_at: string;
  memory_type: string;
  layer: string;
  relevance_score: number;
  use_count: number;
  access_count: number;
  last_accessed_at: string | null;
  embedding: number[];
}

interface LabeledQuery {
  id: string;
  text: string;
  relevant_ids: string[];
  rationale: string;
  top_k: number;
  embedding: number[];
}

interface Provenance {
  embedding_model: string;
  generated_at: string;
  frozen_now: string;
}

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "retrieval_relevance",
);
const SEARCH_LIMIT = 10; // generous window so MRR can see beyond a strict top-k cutoff

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8")) as T;
}

export const CORPUS = loadFixture<{ provenance: Provenance; memories: CorpusMemory[] }>(
  "corpus.json",
);
export const QUERIES = loadFixture<{ provenance: Provenance; queries: LabeledQuery[] }>(
  "queries.json",
);

const FROZEN_NOW_MS = Date.parse(CORPUS.provenance.frozen_now);

/** Float32 little-endian, the storage encoding the ranker decodes. */
function embeddingToBytes(vector: readonly number[]): Uint8Array {
  const buffer = Buffer.alloc(vector.length * 4);
  for (const [index, value] of vector.entries()) {
    buffer.writeFloatLE(value, index * 4);
  }
  return new Uint8Array(buffer);
}

/**
 * Hydrate the frozen corpus into a scratch database, once, shared read-only
 * across every probe -- every search below passes `logAccess: false`, so no
 * probe writes and reuse is safe (AI-12's discipline).
 *
 * The real `SCHEMA` is applied rather than a hand-rolled subset, so the FTS
 * table and its triggers behave exactly as they do in production: the lexical
 * half of the hybrid score is part of what this eval measures.
 *
 * `:memory:` through the bootstrap opener, matching Python's
 * `sqlite3.connect(":memory:")`. Not `openDatabaseCopyForWrite`, whose copy
 * guard exists to protect a real `memory.db` during parity proofs -- there is
 * no live database anywhere near this eval, and nothing to copy.
 */
function buildCorpusDatabase(): WritableDatabase {
  const db = openDatabaseForBootstrap(":memory:");
  db.exec(SCHEMA);

  const insertMemory = db.prepare(
    "INSERT INTO memories (id, memory_type, layer, title, content, created_at, " +
      "relevance_score, use_count, embedding, last_accessed_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertAccess = db.prepare(
    "INSERT INTO memory_access_log (memory_id, accessed_at, access_context) VALUES (?, ?, ?)",
  );

  for (const memory of CORPUS.memories) {
    insertMemory.run(
      memory.id,
      memory.memory_type,
      memory.layer,
      memory.title,
      memory.content,
      memory.created_at,
      memory.relevance_score,
      memory.use_count,
      embeddingToBytes(memory.embedding),
      memory.last_accessed_at,
    );
    for (let i = 0; i < memory.access_count; i += 1) {
      insertAccess.run(memory.id, memory.last_accessed_at, "fixture");
    }
  }
  return db;
}

const corpusDb = buildCorpusDatabase();

/**
 * Replays exactly one frozen query vector.
 *
 * Python froze `search_mod.generate_embedding` and `search_mod.datetime` by
 * monkeypatching the module and restoring both afterwards, so a frozen clock
 * could not leak into sibling modules under `eval --all`. TypeScript needs
 * none of that: the provider and `frozenNowMs` are parameters of the search
 * call, so the freeze cannot escape the call that asked for it.
 */
class FrozenQueryEmbeddingProvider implements EmbeddingProvider {
  // Declared field plus assignment, not a parameter property: `erasableSyntaxOnly`
  // is on, and Node strips types rather than compiling them.
  private readonly vector: readonly number[];
  constructor(vector: readonly number[]) {
    this.vector = vector;
  }
  async embed(): Promise<EmbeddingResult> {
    return { vector: this.vector, promptTokens: null };
  }
}

async function searchIds(query: LabeledQuery): Promise<string[]> {
  const outcome = await searchMemoriesWithStatus(corpusDb, {
    query: query.text,
    limit: SEARCH_LIMIT,
    logAccess: false,
    recordEmbeddingLedger: false,
    frozenNowMs: FROZEN_NOW_MS,
    provider: new FrozenQueryEmbeddingProvider(query.embedding),
  });
  return outcome.results.map((result) => result.id);
}

export function reciprocalRank(
  returnedIds: readonly string[],
  relevantIds: readonly string[],
): number {
  const index = returnedIds.findIndex((id) => relevantIds.includes(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

function hitAtKProbe(query: LabeledQuery): () => Promise<ProbeOutcome> {
  return async () => {
    const returned = await searchIds(query);
    const topK = returned.slice(0, query.top_k);
    const hit = topK.some((id) => query.relevant_ids.includes(id));
    const rr = reciprocalRank(returned, query.relevant_ids);
    return {
      passed: hit,
      notes: `relevant=[${query.relevant_ids.join(", ")}] top_${query.top_k}=[${topK.join(", ")}] rr=${rr.toFixed(3)}`,
    };
  };
}

/**
 * Informational only -- always passes. MRR across every labeled query,
 * reported so a weight change's effect on ranking POSITION stays visible even
 * when hit@k alone does not move (report, don't gate).
 */
async function mrrAggregate(): Promise<ProbeOutcome> {
  const ranks: number[] = [];
  for (const query of QUERIES.queries) {
    ranks.push(reciprocalRank(await searchIds(query), query.relevant_ids));
  }
  const mrr = ranks.length > 0 ? ranks.reduce((sum, r) => sum + r, 0) / ranks.length : 0;
  return { passed: true, notes: `MRR=${mrr.toFixed(4)} over ${ranks.length} queries` };
}

export const PROBES: EvalProbe[] = [
  ...QUERIES.queries.map(
    (query): EvalProbe => ({
      id: query.id,
      description: `hit@${query.top_k}: ${JSON.stringify(query.text)}`,
      run: hitAtKProbe(query),
    }),
  ),
  {
    id: "mrr-aggregate",
    description: "Mean Reciprocal Rank across all labeled queries (informational)",
    run: mrrAggregate,
  },
];
