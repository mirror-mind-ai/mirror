// Port of `propose_consolidation` (`intelligence/consolidate.py`) and
// `propose_shadow_observations` (`intelligence/shadow.py`) -- the LLM
// orchestration half of `consolidate scan` / `shadow scan` (CV22.DS7.US3
// Slice B; live since CV22.DS8.TS2).
//
// The prompt sent to the provider is Python's real template
// (`CONSOLIDATION_PROMPT` / `SHADOW_SCAN_PROMPT`: task statement, identity or
// dedup context, the "## Untrusted input" guard, and the JSON output
// contract), assembled through `pyFormat` around the same fenced block Python
// fences. The assembled bytes are graded against a golden captured from the
// real Python builders and digest-pinned, because this file's history is the
// cautionary tale: from DS7.US3 to DS8.TS2 it sent a fenced memory dump with
// no instructions, and replay -- which resolves by role and never reads the
// prompt -- could not tell. Live, the model would have answered prose,
// `parseJsonResponse` would have failed, and every scan would have reported
// "no proposals" while the ledger showed paid calls.

import { fenceUntrusted } from "#extraction/fencing.ts";
import { parseJsonResponse } from "#extraction/json.ts";
import { CONSOLIDATION_PROMPT, SHADOW_SCAN_PROMPT } from "#extraction/prompts.ts";
import { classifyProviderError, type OnProviderCallOutcome } from "#observability/callOutcome.ts";
import type { ChatLedgerHook } from "#observability/ledgerHooks.ts";
import { resolveExtractionModel } from "#providers/config.ts";
import type { LlmProvider } from "#providers/llm.ts";
import { pyFormat } from "#util/pythonText.ts";
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

/**
 * Exactly what `propose_consolidation` sends: `CONSOLIDATION_PROMPT.format(...)`
 * with only the user-derived cluster fenced -- `identity_context` is
 * system-side. One pass, so a `{placeholder}` literal inside memory content
 * is never expanded a second time.
 */
export function buildConsolidationPrompt(
  cluster: readonly CultivationMemory[],
  userName: string,
  identityContext: string,
): string {
  return pyFormat(CONSOLIDATION_PROMPT, {
    user_name: userName,
    identity_context: identityContext,
    cluster_text: fenceUntrusted("cluster", formatCluster(cluster)),
  });
}

/**
 * Exactly what `propose_shadow_observations` sends: `SHADOW_SCAN_PROMPT.format(...)`
 * with only `shadow_memories` fenced -- `shadow_structure` is structural
 * identity content, not user-injected, and Python leaves it unfenced.
 */
export function buildShadowScanPrompt(
  memories: readonly CultivationMemory[],
  shadowEntries: readonly ShadowStructureEntry[],
  userName: string,
): string {
  return pyFormat(SHADOW_SCAN_PROMPT, {
    user_name: userName,
    shadow_structure: formatShadowStructure(shadowEntries),
    shadow_memories: fenceUntrusted("shadow_memories", formatShadowMemories(memories)),
  });
}

export interface ProposeConsolidationOptions {
  id: string;
  nowIso: string;
  /** `cmd_scan`'s `_user_name(mem)`; see `promptContext.ts`. Required: the fallback lives in the resolver, as in Python. */
  userName: string;
  /** `cmd_scan`'s `_identity_context(mem)`; see `promptContext.ts`. */
  identityContext: string;
  /**
   * Python passes `on_llm_call=build_llm_logger(store, role="consolidation")`
   * from `consolidate_cmd`. TypeScript logged nothing, which was accurate
   * while every call was replayed and free, and stops being accurate the
   * moment this reaches a live provider (CV22.DS8.US3).
   */
  onLlmCall?: ChatLedgerHook;
  /**
   * What happened on this call, category only. Every `null` below is Python's
   * swallow, and without this they are indistinguishable from each other and
   * from an honest "no proposal" (CV22.DS8.US3).
   */
  onOutcome?: OnProviderCallOutcome;
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
  const prompt = buildConsolidationPrompt(cluster, options.userName, options.identityContext);
  let content: string;
  try {
    const response = await provider.complete({
      role: "consolidation",
      prompt,
      model: resolveExtractionModel(),
      temperature: 0.1,
    });
    // Python logs AFTER a successful call and BEFORE parsing, so a response
    // the parser rejects still leaves a row: the call was made and paid for.
    options.onLlmCall?.(response, prompt);
    content = response.content;
  } catch (error) {
    options.onOutcome?.({ outcome: "transport_failed", kind: classifyProviderError(error) });
    return null;
  }

  const data = parseJsonResponse(content);
  // A response the parser cannot use is a PROMPT-layer signal, not a transport
  // one: the call succeeded and was paid for.
  if (!isRecord(data)) {
    options.onOutcome?.({ outcome: "parse_failed" });
    return null;
  }

  // The model answered and was understood; we rejected what it proposed. That
  // is "nothing to do", not a failure.
  const action = typeof data.action === "string" ? data.action.toLowerCase() : "";
  if (!CONSOLIDATION_ACTIONS.has(action)) {
    options.onOutcome?.({ outcome: "empty" });
    return null;
  }

  const proposedContent =
    typeof data.proposed_content === "string" ? data.proposed_content.trim() : "";
  if (!proposedContent) {
    options.onOutcome?.({ outcome: "empty" });
    return null;
  }

  options.onOutcome?.({ outcome: "answered" });

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
  /** `cmd_scan`'s `_user_name(mem)`; see `promptContext.ts`. */
  userName: string;
  /** Python's `build_llm_logger(store, role="shadow_scan")`; see above. */
  onLlmCall?: ChatLedgerHook;
  /** What happened on the one call, category only; see `ProposeConsolidationOptions`. */
  onOutcome?: OnProviderCallOutcome;
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

  const prompt = buildShadowScanPrompt(memories, shadowEntries, options.userName);

  let content: string;
  try {
    const response = await provider.complete({
      role: "shadow_scan",
      prompt,
      model: resolveExtractionModel(),
      temperature: 0.1,
    });
    options.onLlmCall?.(response, prompt);
    content = response.content;
  } catch (error) {
    options.onOutcome?.({ outcome: "transport_failed", kind: classifyProviderError(error) });
    return [];
  }

  const data = parseJsonResponse(content);
  if (!Array.isArray(data)) {
    options.onOutcome?.({ outcome: "parse_failed" });
    return [];
  }

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
  options.onOutcome?.({ outcome: results.length > 0 ? "answered" : "empty" });
  return results;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
