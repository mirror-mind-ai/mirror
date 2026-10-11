/**
 * Journal classification eval: layer criteria contract (CV22.DS10.TS3, port of
 * `evals/journal.py`; originally CV9.E2.S25 / AI-11).
 *
 * Tests journal classification against the Jungian layer criteria stated in
 * `JOURNAL_CLASSIFICATION_PROMPT`. Layer classification (self/ego/shadow) is
 * the delicate quality surface: the three layer probes are pre-registered
 * n=10, not sampled.
 *
 * Python called a single `classify_journal_entry`. TypeScript has no such
 * function -- the journal route composes prompt, completion, and
 * interpretation inline -- so this module composes the same three steps. That
 * is deliberate: the eval measures the path production actually takes,
 * including `interpretJournalClassification`'s AI-24 coercion of an invalid
 * layer to `ego`, which is exactly the TS-side behavior the Python harness
 * could not see.
 *
 * Costs a few cents -- hits the extraction model.
 */

import { capturedString } from "#evals/harness/fixture.ts";
import { liveProvider } from "#evals/harness/liveProvider.ts";
import type { EvalProbe, ProbeOutcome } from "#evals/harness/types.ts";
import { parseJsonResponse } from "#extraction/json.ts";
import { JOURNAL_CLASSIFICATION_PROMPT } from "#extraction/prompts.ts";
import { interpretJournalClassification, type JournalClassification } from "#memory/journal.ts";
import { buildJournalClassificationPrompt, JOURNAL_TEMPERATURE } from "#planning/promptAssembly.ts";
import { resolveExtractionModel } from "#providers/config.ts";

const MODULE = "journal";

export const THRESHOLD = 0.8;
export const EVAL_MODEL = resolveExtractionModel();
export const EVAL_PROMPTS = [JOURNAL_CLASSIFICATION_PROMPT];

/** Python's `VALID_MEMORY_LAYERS`, the single source of truth for the contract. */
const VALID_MEMORY_LAYERS = ["self", "ego", "shadow"];

async function classify(content: string): Promise<JournalClassification> {
  const response = await liveProvider().complete({
    role: "journal_classification",
    prompt: buildJournalClassificationPrompt(content),
    temperature: JOURNAL_TEMPERATURE,
  });
  return interpretJournalClassification(response.content, content, parseJsonResponse);
}

function layerProbe(id: string, description: string, expected: string): EvalProbe {
  return {
    id,
    description,
    run: async (): Promise<ProbeOutcome> => {
      const result = await classify(capturedString(MODULE, id));
      return {
        passed: result.layer === expected,
        notes: `layer=${JSON.stringify(result.layer)} (expected ${JSON.stringify(expected)})`,
      };
    },
  };
}

export const PROBES: EvalProbe[] = [
  layerProbe("journal-layer-self", "deep identity / core values → self layer", "self"),
  layerProbe(
    "journal-layer-ego",
    "day-to-day operational / practical frustrations → ego layer",
    "ego",
  ),
  layerProbe("journal-layer-shadow", "unresolved tension / avoided theme → shadow layer", "shadow"),
  {
    id: "journal-layer-valid",
    description: "layer ∈ VALID_MEMORY_LAYERS (AI-24 invariant)",
    run: async () => {
      const result = await classify(capturedString(MODULE, "journal-layer-valid"));
      const passed = VALID_MEMORY_LAYERS.includes(result.layer);
      return { passed, notes: `layer=${JSON.stringify(result.layer)} valid=${passed}` };
    },
  },
  {
    id: "journal-well-formed",
    description: "dict with title/layer/tags, title bounded",
    run: async () => {
      const result = await classify(capturedString(MODULE, "journal-well-formed"));
      const hasKeys = ["title", "layer", "tags"].every((key) => key in result);
      const title = typeof result.title === "string" ? result.title : "";
      const passed = hasKeys && title.length <= 100;
      return {
        passed,
        notes: `keys=[${Object.keys(result).join(", ")}] title_len=${title.length}`,
      };
    },
  },
];
