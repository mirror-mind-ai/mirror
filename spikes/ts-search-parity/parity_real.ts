// Spike: real-DB parity check. Loops every probe, reproduces the ranker in TS
// over the snapshot, and reports ordered-id parity plus the closest near-tie
// margin where order still agreed (the residual-risk evidence).
//
// Run: node spikes/ts-search-parity/parity_real.ts

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const inputs = JSON.parse(readFileSync(join(HERE, "inputs_real.json"), "utf8"));
const golden = JSON.parse(readFileSync(join(HERE, "golden_real.json"), "utf8"));
const NOW_MS = parseUtcMs(inputs.frozen_now)!;
const W = inputs.weights;

function parseUtcMs(value: string | null): number | null {
  if (!value) return null;
  const hasTz = /[zZ]$|[+-]\d\d:\d\d$/.test(value);
  const ms = Date.parse(hasTz ? value : value + "Z");
  return Number.isNaN(ms) ? null : ms;
}
function blobToFloat32(u8: Uint8Array): Float32Array {
  return new Float32Array(u8.buffer, u8.byteOffset, Math.floor(u8.byteLength / 4));
}
function cosine(a: number[] | Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const norm = Math.sqrt(na) * Math.sqrt(nb);
  return norm === 0 ? 0 : dot / norm;
}
function recencyScore(createdAt: string): number {
  const created = parseUtcMs(createdAt);
  if (created === null) return 0.5;
  const daysAgo = Math.max(0, (NOW_MS - created) / 86400000);
  return Math.exp((-Math.LN2 * daysAgo) / inputs.recency_half_life_days);
}
function reinforcementScore(acc: number, use: number, last: string | null): number {
  const useSignal = Math.min(1, use / 5);
  const retrievalRaw = Math.min(1, Math.log1p(acc) / 3);
  const lastMs = acc > 0 && last ? parseUtcMs(last) : null;
  let sig = retrievalRaw;
  if (lastMs !== null) {
    const days = Math.max(0, (NOW_MS - lastMs) / 86400000);
    sig = retrievalRaw * Math.exp((-Math.LN2 * days) / inputs.reinforcement_decay_days);
  }
  return inputs.reinforcement_use_weight * useSignal + inputs.reinforcement_retrieval_weight * sig;
}
function ftsQuery(q: string): string {
  return q.split(/\s+/).map((w) => w.replace(/"/g, "")).filter(Boolean).map((w) => `"${w}"`).join(" ");
}

type Row = { id: string; created_at: string; last_accessed_at: string | null; use_count: number; relevance_score: number; embedding: Uint8Array };

const db = new DatabaseSync(join(HERE, "real_copy.db"), { readOnly: true });
const allRows = db.prepare("SELECT * FROM memories WHERE embedding IS NOT NULL ORDER BY created_at DESC").all() as unknown as Row[];
const ftsStmt = db.prepare("SELECT m.id FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ? ORDER BY bm25(memories_fts) LIMIT ?");
const accStmt = db.prepare("SELECT COUNT(*) AS cnt FROM memory_access_log WHERE memory_id = ?");

function rank(query: string, qvec: number[]): { id: string; score: number }[] {
  const ftsLookup = new Map<string, number>();
  const safeQ = ftsQuery(query);
  if (safeQ) {
    (ftsStmt.all(safeQ, 100) as { id: string }[]).forEach((r, i) => ftsLookup.set(r.id, 1 / (1 + i)));
  }
  type Cand = { id: string; score: number; emb: Float32Array };
  const cands: Cand[] = [];
  for (const row of allRows) {
    const emb = blobToFloat32(row.embedding);
    const sem = cosine(qvec, emb);
    const rec = recencyScore(row.created_at);
    const acc = (accStmt.get(row.id) as { cnt: number }).cnt;
    const reinf = reinforcementScore(acc, row.use_count, row.last_accessed_at);
    let score = W.semantic * sem + W.recency * rec + W.reinforcement * reinf + W.relevance * row.relevance_score;
    score += (W.lexical ?? 0) * (ftsLookup.get(row.id) ?? 0);
    cands.push({ id: row.id, score, emb });
  }
  cands.sort((a, b) => b.score - a.score);
  const selected: Cand[] = [];
  for (const c of cands) {
    if (selected.some((s) => cosine(s.emb, c.emb) >= inputs.mmr_threshold)) continue;
    selected.push(c);
    if (selected.length >= inputs.limit) break;
  }
  return selected.map((s) => ({ id: s.id, score: s.score }));
}

let allPass = true;
let worstDelta = 0;
let closestCall = Infinity; // smallest adjacent score gap where order still agreed

for (let p = 0; p < inputs.probes.length; p++) {
  const probe = inputs.probes[p];
  const gold = golden.goldens[p].ordered_results as { id: string; score: number }[];
  const ts = rank(probe.query, probe.query_embedding);
  const tsIds = ts.map((r) => r.id);
  const goldIds = gold.map((r) => r.id);
  const match = JSON.stringify(tsIds) === JSON.stringify(goldIds);
  allPass &&= match;

  let delta = 0;
  ts.forEach((r, i) => { if (gold[i]) delta = Math.max(delta, Math.abs(r.score - gold[i].score)); });
  worstDelta = Math.max(worstDelta, delta);
  for (let i = 1; i < ts.length; i++) closestCall = Math.min(closestCall, Math.abs(ts[i - 1].score - ts[i].score));

  console.log(`probe ${probe.probe_id.slice(0, 8)} | n=${tsIds.length} | ${match ? "PASS" : "FAIL"} | maxΔ=${delta.toExponential(2)}`);
  if (!match) {
    console.log("  PY:", goldIds.map((x) => x.slice(0, 8)).join(" "));
    console.log("  TS:", tsIds.map((x) => x.slice(0, 8)).join(" "));
  }
}

console.log("\n=== real-DB parity summary ===");
console.log("probes:", inputs.probes.length, "| memories scored:", allRows.length, "| limit:", inputs.limit);
console.log("worst score delta:", worstDelta.toExponential(3));
console.log("closest agreeing adjacent gap:", closestCall.toExponential(3));
console.log(allPass ? "PARITY: PASS (all probes, identical ranked order)" : "PARITY: FAIL");
process.exit(allPass ? 0 : 1);
