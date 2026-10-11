/**
 * Extraction-boundary fencing and sanitization (CR041 / AI-15, AI-16).
 *
 * Ports the deterministic, non-prompt-template half of Python's extraction
 * boundary hardening: conversation content is untrusted (it can be
 * prompt-injected and re-enters future context as a stored memory), so the
 * request is fenced as data and the parsed response is validated before
 * anything is kept.
 *
 * Deliberately NOT ported here: Python's "## Untrusted input" prompt-text
 * guard and the AI-25 title/tags/summary sandwich + worked-example. Those are
 * prompt-template content, and the TS `ReplayLlmProvider` ignores the prompt
 * entirely (canned response by role) -- there is no TS template surface to
 * carry that guard yet. This ships the defense-in-depth half (valid-enum +
 * anti-flood caps + a forward-ready fence); prompt-level resistance is
 * deferred to the live-provider-template story (held until DS5->DS6 is
 * planned).
 */

/**
 * Wrap untrusted, user-derived content in an XML-style data fence (CV22.DS7.US3).
 *
 * Byte-for-byte port of Python's `fence_untrusted(tag, body)`
 * (`intelligence/prompts.py`) -- the shared delimiter convention across
 * extraction (`<transcript>`), scene (`<scene_data>`), and cultivation
 * (`<cluster>`, `<shadow_memories>`). Each fenced block is paired with an
 * "## Untrusted input" instruction in the surrounding prompt telling the
 * model to treat the content as data, not instructions (AI-16/AI-22/AI-23).
 * Ported now as the deterministic half of cultivation's fence boundary; the
 * live prompt-level resistance proof is deferred to DS8 (the replay provider
 * ignores the prompt), same as `fenceTranscript` below.
 */
export function fenceUntrusted(tag: string, body: string): string {
  return `<${tag}>\n${body}\n</${tag}>`;
}

/** Wrap transcript text so the model reads it as fenced, untrusted data (AI-16).
 *
 * Byte-for-byte identical to Python's `_fence_transcript` -- the delimiter
 * shape a live template would eventually be tuned against. Now a thin call
 * through the shared `fenceUntrusted` primitive (CV22.DS7.US3), one fence
 * shape instead of two.
 */
export function fenceTranscript(body: string): string {
  return fenceUntrusted("transcript", body);
}

// Extraction boundary caps (AI-15) -- hard limits on what one conversation may
// write, so a degenerate or prompt-injected response cannot flood the store.
export const MAX_MEMORIES_PER_CONVERSATION = 8;
export const MAX_TASKS_PER_CONVERSATION = 5;

export const VALID_MEMORY_LAYERS: ReadonlySet<string> = new Set(["self", "ego", "shadow"]);
export const VALID_MEMORY_TYPES: ReadonlySet<string> = new Set([
  "decision",
  "insight",
  "idea",
  "tension",
  "learning",
  "pattern",
  "commitment",
  "reflection",
]);

export interface SanitizeDropped {
  invalidLayer: number;
  invalidType: number;
  overCap: number;
}

export interface SanitizeResult<T> {
  kept: T[];
  dropped: SanitizeDropped;
}

/**
 * Drop items with an invalid layer or type and cap the count (AI-15).
 *
 * Mirrors Python's `_sanitize_extracted` exactly: a single ordered pass per
 * item -- layer checked before type, type before the cap -- so an item
 * arriving after the cap is still counted as invalidLayer/invalidType if it
 * fails those checks first, never silently folded into overCap.
 */
export function sanitizeExtracted<T extends { layer: string; memory_type: string }>(
  items: readonly T[],
  maxCount: number,
): SanitizeResult<T> {
  const kept: T[] = [];
  const dropped: SanitizeDropped = { invalidLayer: 0, invalidType: 0, overCap: 0 };
  for (const item of items) {
    if (!VALID_MEMORY_LAYERS.has(item.layer)) {
      dropped.invalidLayer += 1;
      continue;
    }
    if (!VALID_MEMORY_TYPES.has(item.memory_type)) {
      dropped.invalidType += 1;
      continue;
    }
    if (kept.length >= maxCount) {
      dropped.overCap += 1;
      continue;
    }
    kept.push(item);
  }
  return { kept, dropped };
}
