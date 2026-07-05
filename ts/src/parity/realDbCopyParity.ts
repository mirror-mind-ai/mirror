import { createHash } from "node:crypto";
import {
  type RankableMemory,
  type RankerConfig,
  rankMemories,
  type SearchWeights,
} from "../search/ranker.ts";

export interface RealDbCopyProbe {
  label: string;
  query_embedding: number[];
  expected_order: string[];
  memories: RankableMemory[];
}

export interface RealDbCopyFixture {
  source_label?: string;
  frozen_now_ms: number;
  limit: number;
  weights: SearchWeights;
  mmr_threshold: number;
  recency_half_life_days: number;
  reinforcement_decay_days: number;
  reinforcement_use_weight: number;
  reinforcement_retrieval_weight: number;
  probes: RealDbCopyProbe[];
}

export interface ProbeParityResult {
  label: string;
  resultCount: number;
  pythonOrderHash: string;
  tsOrderHash: string;
  match: boolean;
  expectedOrder?: string[];
  actualOrder?: string[];
}

export function orderedIdsHash(ids: readonly string[]): string {
  return createHash("sha256").update(ids.join("\u001f"), "utf8").digest("hex");
}

export function evaluateRealDbCopyFixture(
  fixture: RealDbCopyFixture,
  options: { includeSensitiveDebug?: boolean } = {},
): ProbeParityResult[] {
  return fixture.probes.map((probe) => {
    const config: RankerConfig = {
      queryEmbedding: probe.query_embedding,
      frozenNowMs: fixture.frozen_now_ms,
      limit: fixture.limit,
      weights: fixture.weights,
      mmrThreshold: fixture.mmr_threshold,
      recencyHalfLifeDays: fixture.recency_half_life_days,
      reinforcementDecayDays: fixture.reinforcement_decay_days,
      reinforcementUseWeight: fixture.reinforcement_use_weight,
      reinforcementRetrievalWeight: fixture.reinforcement_retrieval_weight,
    };
    const actualOrder = rankMemories(probe.memories, config).map((memory) => memory.id);
    const match = JSON.stringify(actualOrder) === JSON.stringify(probe.expected_order);
    return {
      label: probe.label,
      resultCount: probe.expected_order.length,
      pythonOrderHash: orderedIdsHash(probe.expected_order),
      tsOrderHash: orderedIdsHash(actualOrder),
      match,
      ...(options.includeSensitiveDebug
        ? { expectedOrder: probe.expected_order, actualOrder }
        : {}),
    };
  });
}

export function renderRedactedReport(results: readonly ProbeParityResult[]): string {
  const lines: string[] = [];
  for (const result of results) {
    lines.push(`probe: ${result.label}`);
    lines.push(`result_count: ${result.resultCount}`);
    lines.push(`python_order_hash: ${result.pythonOrderHash}`);
    lines.push(`ts_order_hash: ${result.tsOrderHash}`);
    lines.push(`match: ${result.match ? "true" : "false"}`);
    lines.push("");
  }
  const passed = results.every((result) => result.match);
  lines.push(`overall_match: ${passed ? "true" : "false"}`);
  return `${lines.join("\n")}\n`;
}
