// Spike: TypeScript reimplementation of Mirror's hybrid search read path.
//
// Throwaway spike scaffolding. It reads the SAME fixture.db the Python oracle
// scored against, reimplements only the scoring math (FTS5/bm25 ordering comes
// free from the shared SQLite file), and checks ordered-result parity against
// golden.json.
//
// Run: node spikes/ts-search-parity/parity.ts

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const inputs = JSON.parse(readFileSync(join(HERE, "inputs.json"), "utf8"));
const golden = JSON.parse(readFileSync(join(HERE, "golden.json"), "utf8"));

const NOW_MS = parseUtcMs(inputs.frozen_now)!;
const Q: number[] = inputs.query_embedding;
const W = inputs.weights;

type Row = {
  id: string;
  created_at: string;
  last_accessed_at: string | null;
  use_count: number;
  relevance_score: number;
  embedding: Uint8Array;
};

function parseUtcMs(value: string | null): number | null {
  if (!value) return null;
  // Match Python _parse_datetime_utc: naive strings are treated as UTC.
  const hasTz = /[zZ]$|[+-]\d\d:\d\d$/.test(value);
  const ms = Date.parse(hasTz ? value : value + "Z");
  return Number.isNaN(ms) ? null : ms;
}

function blobToFloat32(u8: Uint8Array): Float32Array {
  return new Float32Array(u8.buffer, u8.byteOffset, Math.floor(u8.byteLength / 4));
}

function cosine(a: number[] | Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const norm = Math.sqrt(na) * Math.sqrt(nb);
  return norm === 0 ? 0 : dot / norm;
}

function recencyScore(createdAt: string): number {
  const created = parseUtcMs(createdAt);
  if (created === null) return 0.5;
  const daysAgo = Math.max(0, (NOW_MS - created) / 86400000);
  return Math.exp((-Math.LN2 * daysAgo) / inputs.recency_half_life_days);
}

function reinforcementScore(
  accessCount: number,
  useCount: number,
  lastAccessedAt: string | null,
): number {
  const useSignal = Math.min(1, useCount / 5);
  const retrievalRaw = Math.min(1, Math.log1p(accessCount) / 3);
  const last = accessCount > 0 && lastAccessedAt ? parseUtcMs(lastAccessedAt) : null;
  let retrievalSignal = retrievalRaw;
  if (last !== null) {
    const days = Math.max(0, (NOW_MS - last) / 86400000);
    retrievalSignal = retrievalRaw * Math.exp((-Math.LN2 * days) / inputs.reinforcement_decay_days);
  }
  return (
    inputs.reinforcement_use_weight * useSignal +
    inputs.reinforcement_retrieval_weight * retrievalSignal
  );
}

function ftsQuery(query: string): string {
  const words = query.split(/\s+/).map((w) => w.replace(/"/g, "")).filter(Boolean);
  return words.map((w) => `"${w}"`).join(" ");
}

function main(): void {
  const db = new DatabaseSync(join(HERE, "fixture.db"), { readOnly: true });

  // get_all_memories_with_embeddings: ORDER BY created_at DESC (insertion order
  // for the stable sort must match Python exactly).
  const rows = db
    .prepare("SELECT * FROM memories WHERE embedding IS NOT NULL ORDER BY created_at DESC")
    .all() as unknown as Row[];

  // Lexical pass: same MATCH + bm25 ordering, lexical = 1/(1+i).
  const ftsLookup = new Map<string, number>();
  const safeQ = ftsQuery(inputs.query);
  if (safeQ) {
    const ftsRows = db
      .prepare(
        "SELECT m.id FROM memories_fts f JOIN memories m ON m.rowid = f.rowid " +
          "WHERE memories_fts MATCH ? ORDER BY bm25(memories_fts) LIMIT ?",
      )
      .all(safeQ, 100) as { id: string }[];
    ftsRows.forEach((r, i) => ftsLookup.set(r.id, 1 / (1 + i)));
  }

  const accStmt = db.prepare(
    "SELECT COUNT(*) AS cnt FROM memory_access_log WHERE memory_id = ?",
  );

  type Cand = { id: string; score: number; emb: Float32Array };
  const candidates: Cand[] = [];
  for (const row of rows) {
    const emb = blobToFloat32(row.embedding);
    const sem = cosine(Q, emb);
    const rec = recencyScore(row.created_at);
    const accessCount = (accStmt.get(row.id) as { cnt: number }).cnt;
    const reinf = reinforcementScore(accessCount, row.use_count, row.last_accessed_at);
    let score =
      W.semantic * sem + W.recency * rec + W.reinforcement * reinf + W.relevance * row.relevance_score;
    score += (W.lexical ?? 0) * (ftsLookup.get(row.id) ?? 0);
    candidates.push({ id: row.id, score, emb });
  }

  // Stable sort by score desc (Array.prototype.sort is stable in V8).
  candidates.sort((a, b) => b.score - a.score);

  // MMR dedupe.
  const selected: Cand[] = [];
  for (const c of candidates) {
    if (selected.some((s) => cosine(s.emb, c.emb) >= inputs.mmr_threshold)) continue;
    selected.push(c);
    if (selected.length >= inputs.limit) break;
  }

  // Compare to golden.
  const tsIds = selected.map((s) => s.id);
  const goldIds = golden.ordered_results.map((r: { id: string }) => r.id);
  const orderMatch = JSON.stringify(tsIds) === JSON.stringify(goldIds);
  let maxDelta = 0;
  selected.forEach((s, i) => {
    const g = golden.ordered_results[i];
    if (g) maxDelta = Math.max(maxDelta, Math.abs(s.score - g.score));
  });

  console.log("TS REIMPL (reading shared fixture.db)");
  selected.forEach((s, i) => console.log(`  ${i}. ${s.id}  score=${s.score.toFixed(12)}`));
  console.log("\nPY golden order:", goldIds.join(", "));
  console.log("TS result order:", tsIds.join(", "));
  console.log("max score delta:", maxDelta.toExponential(3));
  console.log(orderMatch ? "\nPARITY: PASS (identical ranked order)" : "\nPARITY: FAIL (order differs)");
  process.exit(orderMatch ? 0 : 1);
}

main();
