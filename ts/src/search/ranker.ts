import { blobToFloat32, parseUtcMs } from "../parity/decode.ts";

export interface SearchWeights {
  semantic: number;
  recency: number;
  reinforcement: number;
  relevance: number;
  lexical?: number;
}

export interface RankerConfig {
  queryEmbedding: readonly number[];
  frozenNowMs: number;
  limit: number;
  weights: SearchWeights;
  mmrThreshold: number;
  recencyHalfLifeDays: number;
  reinforcementDecayDays: number;
  reinforcementUseWeight: number;
  reinforcementRetrievalWeight: number;
}

export interface RankableMemory {
  id: string;
  created_at: string;
  last_accessed_at?: string | null;
  use_count: number;
  relevance_score: number;
  access_count: number;
  lexical_score?: number;
  embedding_b64: string;
}

export interface RankedMemory {
  id: string;
  score: number;
}

interface Candidate {
  id: string;
  score: number;
  embedding: Float32Array;
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const norm = Math.sqrt(normA) * Math.sqrt(normB);
  return norm === 0 ? 0 : dot / norm;
}

export function recencyScore(
  createdAt: string,
  config: Pick<RankerConfig, "frozenNowMs" | "recencyHalfLifeDays">,
): number {
  const createdMs = parseUtcMs(createdAt);
  if (createdMs === null) return 0.5;
  const daysAgo = Math.max(0, (config.frozenNowMs - createdMs) / 86_400_000);
  return Math.exp((-Math.LN2 * daysAgo) / config.recencyHalfLifeDays);
}

export function reinforcementScore(
  accessCount: number,
  useCount: number,
  lastAccessedAt: string | null | undefined,
  config: Pick<
    RankerConfig,
    | "frozenNowMs"
    | "reinforcementDecayDays"
    | "reinforcementUseWeight"
    | "reinforcementRetrievalWeight"
  >,
): number {
  const useSignal = Math.min(1, useCount / 5);
  const retrievalRaw = Math.min(1, Math.log1p(accessCount) / 3);
  const lastMs = accessCount > 0 && lastAccessedAt ? parseUtcMs(lastAccessedAt) : null;
  let retrievalSignal = retrievalRaw;
  if (lastMs !== null) {
    const days = Math.max(0, (config.frozenNowMs - lastMs) / 86_400_000);
    retrievalSignal = retrievalRaw * Math.exp((-Math.LN2 * days) / config.reinforcementDecayDays);
  }
  return (
    config.reinforcementUseWeight * useSignal +
    config.reinforcementRetrievalWeight * retrievalSignal
  );
}

export function hybridScore(args: {
  semantic: number;
  recency: number;
  reinforcement: number;
  relevance: number;
  lexical: number;
  weights: SearchWeights;
}): number {
  return (
    args.weights.semantic * args.semantic +
    args.weights.recency * args.recency +
    args.weights.reinforcement * args.reinforcement +
    args.weights.relevance * args.relevance +
    (args.weights.lexical ?? 0) * args.lexical
  );
}

export function rankMemories(
  memories: readonly RankableMemory[],
  config: RankerConfig,
): RankedMemory[] {
  const candidates: Candidate[] = memories.map((memory) => {
    const embedding = blobToFloat32(Buffer.from(memory.embedding_b64, "base64"));
    const semantic = cosineSimilarity(config.queryEmbedding, embedding);
    const recency = recencyScore(memory.created_at, config);
    const reinforcement = reinforcementScore(
      memory.access_count,
      memory.use_count,
      memory.last_accessed_at,
      config,
    );
    const score = hybridScore({
      semantic,
      recency,
      reinforcement,
      relevance: memory.relevance_score,
      lexical: memory.lexical_score ?? 0,
      weights: config.weights,
    });
    return { id: memory.id, score, embedding };
  });

  candidates.sort((a, b) => b.score - a.score);

  const selected: Candidate[] = [];
  for (const candidate of candidates) {
    if (
      selected.some(
        (existing) =>
          cosineSimilarity(candidate.embedding, existing.embedding) >= config.mmrThreshold,
      )
    ) {
      continue;
    }
    selected.push(candidate);
    if (selected.length >= config.limit) break;
  }

  return selected.map((candidate) => ({ id: candidate.id, score: candidate.score }));
}
