// Port of `propose_consolidation` (`intelligence/consolidate.py`) and
// `propose_shadow_observations` (`intelligence/shadow.py`) -- the LLM
// orchestration half of `consolidate scan` / `shadow scan` (CV22.DS7.US3
// Slice B). Runs behind the DS5 replay `LlmProvider`; the live call is DS8.
//
// Following the extraction precedent (`extraction/conversation.ts`), the
// PROMPT SENT TO THE PROVIDER is deliberately NOT the full instructive
// Python template (`CONSOLIDATION_PROMPT`/`SHADOW_SCAN_PROMPT`, with their
// baked-in "## Untrusted input" guard) -- under replay the provider ignores
// the prompt entirely (canned response keyed by role), so there is no TS
// template surface to prove injection-resistance against yet. This ports the
// deterministic formatting helpers (`formatCluster`/`formatShadowMemories`/
// `formatShadowStructure`) and fences the user-derived block with
// `fenceUntrusted`, matching the fence Python's real template wraps around
// the same data; the live prompt-level guard text is DS8, per the extraction
// precedent recorded in `fencing.ts`.

import { fenceUntrusted } from "../extraction/fencing.ts";
import { parseJsonResponse } from "../extraction/json.ts";
import { resolveExtractionModel } from "../providers/config.ts";
import type { LlmProvider } from "../providers/llm.ts";
import type { ConsolidationRow, CultivationMemory } from "./consolidationStore.ts";

/** Mirrors Python's action allowlist check in `propose_consolidation`. */
const CONSOLIDATION_ACTIONS: ReadonlySet<string> = new Set([
  "merge",
  "identity_update",
  "shadow_candidate",
]);

/** Port of `_format_cluster`: one Markdown section per memory, in input order. */
export function formatCluster(cluster: readonly CultivationMemory[]): string {
  const lines: string[] = [];
  cluster.forEach((memory, index) => {
    lines.push(`### Memory ${index + 1}`);
    lines.push(`**Type:** ${memory.memory_type} | **Layer:** ${memory.layer}`);
    if (memory.journey) lines.push(`**Journey:** ${memory.journey}`);
    lines.push(`**Created:** ${memory.created_at.slice(0, 10)}`);
    lines.push(`**Title:** ${memory.title}`);
    lines.push(`**Content:** ${memory.content}`);
    if (memory.context) lines.push(`**Context:** ${memory.context}`);
    lines.push("");
  });
  return lines.join("\n");
}

/** Port of `_format_shadow_memories`. */
export function formatShadowMemories(memories: readonly CultivationMemory[]): string {
  if (memories.length === 0) return "(no shadow-candidate memories found)";
  const lines: string[] = [];
  for (const memory of memories) {
    lines.push(`### [${memory.id.slice(0, 8)}] ${memory.title}`);
    lines.push(
      `**Type:** ${memory.memory_type} | **Layer:** ${memory.layer} | ` +
        `**State:** ${memory.readiness_state} | **Date:** ${memory.created_at.slice(0, 10)}`,
    );
    lines.push(`**Content:** ${memory.content}`);
    if (memory.context) lines.push(`**Context:** ${memory.context}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** A structural shadow identity entry, the minimal projection `_format_shadow_structure` needs. */
export interface ShadowStructureEntry {
  key: string;
  content: string;
}

/** Port of `_format_shadow_structure`. */
export function formatShadowStructure(entries: readonly ShadowStructureEntry[]): string {
  if (entries.length === 0) return "(no structural shadow content yet)";
  return entries.map((entry) => `### ${entry.key}\n${entry.content}`).join("\n\n");
}

export interface ProposeConsolidationOptions {
  id: string;
  nowIso: string;
}

/**
 * Port of `propose_consolidation`: fence the cluster, call the LLM
 * (role `'consolidation'`), and parse the response into a pending
 * `ConsolidationRow`, or `null` on any failure (provider rejection, unparsable
 * JSON, an action outside the allowlist, or empty proposed content) --
 * mirroring Python's `except Exception: return None` / `return None` branches
 * exactly. Deliberately does NOT gate `target_layer`/`target_key` here --
 * this only stores the proposal as `pending`; the identity-write allowlist
 * gate runs later, at `apply` time (`applyIdentityUpdate`), which is the
 * adversarial-containment property this story proves.
 */
export async function proposeConsolidation(
  provider: LlmProvider,
  cluster: readonly CultivationMemory[],
  options: ProposeConsolidationOptions,
): Promise<ConsolidationRow | null> {
  const prompt = fenceUntrusted("cluster", formatCluster(cluster));
  let content: string;
  try {
    const response = await provider.complete({
      role: "consolidation",
      prompt,
      model: resolveExtractionModel(),
      temperature: 0.1,
    });
    content = response.content;
  } catch {
    return null;
  }

  const data = parseJsonResponse(content);
  if (!isRecord(data)) return null;

  const action = typeof data.action === "string" ? data.action.toLowerCase() : "";
  if (!CONSOLIDATION_ACTIONS.has(action)) return null;

  const proposedContent =
    typeof data.proposed_content === "string" ? data.proposed_content.trim() : "";
  if (!proposedContent) return null;

  const targetLayer =
    typeof data.target_layer === "string" && data.target_layer ? data.target_layer : null;
  const targetKey = typeof data.target_key === "string" && data.target_key ? data.target_key : null;
  const rationaleRaw = typeof data.rationale === "string" ? data.rationale.trim() : "";

  return {
    id: options.id,
    action,
    proposal: proposedContent,
    result: null,
    source_memory_ids: JSON.stringify(cluster.map((memory) => memory.id)),
    target_layer: targetLayer,
    target_key: targetKey,
    rationale: rationaleRaw || null,
    status: "pending",
    created_at: options.nowIso,
    reviewed_at: null,
  };
}

export interface ProposeShadowObservationsOptions {
  /** Called once per emitted observation, matching Python's per-item `_uuid()`/`_now()`. */
  id: () => string;
  nowIso: () => string;
}

/**
 * Port of `propose_shadow_observations`: a single LLM call over the FULL
 * candidate pool (not per-cluster) so cross-cluster patterns can surface,
 * fenced under `'shadow_memories'`. Returns `[]` on any failure (no
 * memories, provider rejection, unparsable JSON, or a non-array response) --
 * mirroring Python's early-return branches exactly. Each valid item becomes
 * its own pending `Consolidation` with `action: 'shadow_observation'`,
 * `target_layer: 'shadow'`, `target_key: 'profile'` -- ALWAYS this pair,
 * never read from the LLM response (Python's `Consolidation(...,
 * target_layer="shadow", target_key="profile", ...)` is a hardcoded literal,
 * not derived from `item`).
 */
export async function proposeShadowObservations(
  provider: LlmProvider,
  memories: readonly CultivationMemory[],
  shadowEntries: readonly ShadowStructureEntry[],
  options: ProposeShadowObservationsOptions,
): Promise<ConsolidationRow[]> {
  if (memories.length === 0) return [];

  // `shadow_structure` is system-side identity content, not user-injected --
  // Python fences only the `shadow_memories` block, not this one. Both parts
  // travel in the prompt (dedup context + the fenced candidate pool), even
  // though replay ignores prompt content entirely; this keeps the shape ready
  // for DS8's live template to reuse verbatim.
  const prompt =
    `## Current structural shadow layer\n${formatShadowStructure(shadowEntries)}\n\n` +
    fenceUntrusted("shadow_memories", formatShadowMemories(memories));

  let content: string;
  try {
    const response = await provider.complete({
      role: "shadow_scan",
      prompt,
      model: resolveExtractionModel(),
      temperature: 0.1,
    });
    content = response.content;
  } catch {
    return [];
  }

  const data = parseJsonResponse(content);
  if (!Array.isArray(data)) return [];

  const results: ConsolidationRow[] = [];
  for (const item of data) {
    if (!isRecord(item)) continue;
    const observation = typeof item.observation === "string" ? item.observation.trim() : "";
    if (!observation) continue;
    const title = typeof item.title === "string" ? item.title.trim() : "Shadow observation";
    const memoryIds = Array.isArray(item.memory_ids)
      ? item.memory_ids.map((value) => String(value))
      : [];
    const evidenceNote = typeof item.evidence_note === "string" ? item.evidence_note.trim() : "";

    const parts = [`**${title}**\n\n${observation}`];
    if (evidenceNote) parts.push(`*Evidence: ${evidenceNote}*`);

    results.push({
      id: options.id(),
      action: "shadow_observation",
      proposal: parts.join("\n\n"),
      result: null,
      source_memory_ids: JSON.stringify(memoryIds),
      target_layer: "shadow",
      target_key: "profile",
      rationale: title,
      status: "pending",
      created_at: options.nowIso(),
      reviewed_at: null,
    });
  }
  return results;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
