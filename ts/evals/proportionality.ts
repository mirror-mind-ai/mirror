/**
 * Proportionality eval (CV22.DS10.TS3, port of `evals/proportionality.py`).
 *
 * The restraint half of extraction quality: a conversation with nothing
 * memorable in it must produce zero memories. Over-extraction is the failure
 * mode that fills a mirror with noise, and it is invisible to any probe that
 * only checks that something WAS extracted.
 *
 * Costs a few cents -- hits the extraction model.
 */

import { capturedMessages } from "#evals/harness/fixture.ts";
import { liveProvider } from "#evals/harness/liveProvider.ts";
import type { EvalProbe } from "#evals/harness/types.ts";
import { extractMemories } from "#extraction/conversation.ts";
import { EXTRACTION_PROMPT } from "#extraction/prompts.ts";
import { resolveExtractionModel } from "#providers/config.ts";

const MODULE = "proportionality";

export const THRESHOLD = 0.8;
export const EVAL_MODEL = resolveExtractionModel();
export const EVAL_PROMPTS = [EXTRACTION_PROMPT];

function nothingMemorable(id: string, description: string): EvalProbe {
  return {
    id,
    description,
    run: async () => {
      const memories = await extractMemories(liveProvider(), capturedMessages(MODULE, id));
      return {
        passed: memories.length === 0,
        notes: `${memories.length} memories extracted (expected 0)`,
      };
    },
  };
}

export const PROBES: EvalProbe[] = [
  nothingMemorable("casual-greeting", "brief social exchange produces 0 memories"),
  nothingMemorable("logistical-question", "logistical travel question produces 0 memories"),
  nothingMemorable("quick-factual", "quick factual lookup produces 0 memories"),
  nothingMemorable("status-check", "vague status check produces 0 memories"),
  nothingMemorable("small-talk", "small talk about weather and plans produces 0 memories"),
];
