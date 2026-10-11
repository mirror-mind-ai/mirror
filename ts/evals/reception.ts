/**
 * Reception eval (CV22.DS10.TS3, port of `evals/reception.py`).
 *
 * Tests the LLM turn classifier on canned queries against the **production**
 * persona and journey catalogue. Four probe families: clear domain matching,
 * ambiguous intent-wins-over-topic, identity-touch detection, and shadow-touch
 * detection.
 *
 * The catalogue is environment, not fixture: only the queries were captured
 * (the Navigator's persona and journey text is theirs, and it drifts), so both
 * engines read the catalogue at runtime exactly as Python's `_load_metadata`
 * did. Two consequences worth stating:
 *
 * 1. This module needs a configured mirror home and a seeded database, not
 *    just a key.
 * 2. Its results move when the catalogue moves. That is the same exposure
 *    D-005 recorded for `routing`, and it is why two of these probes have
 *    failed in both recorded Python runs.
 *
 * Metadata loading deliberately mirrors the Python EVAL's loader --
 * `content[:200]` plus `routing_keywords` -- rather than TypeScript's
 * production path in `resolveMirrorDefaults`, which prefers a generated
 * descriptor when one exists. Matching the eval keeps the plateau-5 diff
 * meaningful; the divergence between the two is recorded in the story package.
 *
 * Costs a few cents -- hits the extraction model.
 */

import { openDatabaseReadOnly } from "#db/database.ts";
import { capturedString } from "#evals/harness/fixture.ts";
import { liveProvider } from "#evals/harness/liveProvider.ts";
import type { EvalProbe } from "#evals/harness/types.ts";
import { resolveDbPath } from "#frontDoor/dbPath.ts";
import {
  RECEPTION_PROMPT,
  type ReceptionJourney,
  type ReceptionPersona,
  type ReceptionResult,
  runReception,
  sliceCodePoints,
} from "#mirror/reception.ts";
import { resolveExtractionModel } from "#providers/config.ts";

const MODULE = "reception";

export const THRESHOLD = 0.8;
export const EVAL_MODEL = resolveExtractionModel();
export const EVAL_PROMPTS = [RECEPTION_PROMPT];

interface Catalogue {
  personas: ReceptionPersona[];
  journeys: ReceptionJourney[];
}

let catalogue: Catalogue | null = null;

/** Port of the Python eval's `_load_metadata`, read once and reused. */
function loadCatalogue(): Catalogue {
  if (catalogue) return catalogue;
  const db = openDatabaseReadOnly(resolveDbPath([], process.env));
  try {
    const rows = (layer: string) =>
      db
        .prepare("SELECT key, content, metadata FROM identity WHERE layer = ? ORDER BY key")
        .all(layer)
        .map((row) => ({
          key: String(row.key),
          content: row.content === null ? "" : String(row.content),
          metadata: typeof row.metadata === "string" ? row.metadata : null,
        }));

    const routingKeywords = (metadata: string | null): string[] => {
      if (!metadata) return [];
      try {
        const parsed = JSON.parse(metadata);
        if (parsed === null || typeof parsed !== "object") return [];
        const keywords = (parsed as Record<string, unknown>).routing_keywords;
        return Array.isArray(keywords)
          ? keywords.filter((k): k is string => typeof k === "string")
          : [];
      } catch {
        return [];
      }
    };

    catalogue = {
      personas: rows("persona").map((row) => ({
        slug: row.key,
        description: sliceCodePoints(row.content, 200),
        routingKeywords: routingKeywords(row.metadata),
      })),
      journeys: rows("journey").map((row) => ({
        slug: row.key,
        description: sliceCodePoints(row.content, 200),
      })),
    };
    return catalogue;
  } finally {
    db.close();
  }
}

async function classify(probeId: string): Promise<ReceptionResult> {
  const { personas, journeys } = loadCatalogue();
  return runReception(capturedString(MODULE, probeId), personas, journeys, liveProvider());
}

function personaProbe(id: string, description: string, expected: string | null): EvalProbe {
  return {
    id,
    description,
    run: async () => {
      const result = await classify(id);
      const got = result.personas.length > 0 ? result.personas[0] : null;
      return {
        passed: got === expected,
        notes: `expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`,
      };
    },
  };
}

function noPersonaProbe(id: string, description: string): EvalProbe {
  return {
    id,
    description,
    run: async () => {
      const result = await classify(id);
      return {
        passed: result.personas.length === 0,
        notes: `expected [], got [${result.personas.join(", ")}]`,
      };
    },
  };
}

function touchProbe(
  id: string,
  description: string,
  field: "touchesIdentity" | "touchesShadow",
  expected: boolean,
): EvalProbe {
  const label = field === "touchesIdentity" ? "touches_identity" : "touches_shadow";
  return {
    id,
    description,
    run: async () => {
      const result = await classify(id);
      return {
        passed: result[field] === expected,
        notes: `${label}: expected ${expected}, got ${result[field]}`,
      };
    },
  };
}

export const PROBES: EvalProbe[] = [
  // --- Clear domain: persona match ---
  personaProbe("clear-engineer", "code/software query → engineer", "engineer"),
  personaProbe("clear-writer", "article/writing query → writer", "writer"),
  personaProbe("clear-doctor", "health/symptom query → doctor", "doctor"),
  personaProbe("clear-traveler", "trip planning query → traveler", "traveler"),
  // --- Ambiguous: intent and action verb dominate topic ---
  personaProbe(
    "action-verb-writer",
    "'write a post about X' → writer, not X-domain persona",
    "writer",
  ),
  personaProbe(
    "action-verb-engineer",
    "'help me think through this code structure' → engineer over thinker",
    "engineer",
  ),
  noPersonaProbe("open-existential-no-persona", "open existential question → ego responds alone"),
  // --- Identity touch ---
  touchProbe(
    "identity-touch-purpose",
    "explicit purpose/values reflection → touches_identity=True",
    "touchesIdentity",
    true,
  ),
  touchProbe(
    "identity-touch-operational",
    "operational task → touches_identity=False",
    "touchesIdentity",
    false,
  ),
  // --- Shadow touch ---
  touchProbe(
    "shadow-touch-avoidance",
    "explicit avoidance pattern → touches_shadow=True",
    "touchesShadow",
    true,
  ),
  touchProbe(
    "shadow-touch-vague-discomfort",
    "vague discomfort without named pattern → touches_shadow=False",
    "touchesShadow",
    false,
  ),
  // --- Journey detection ---
  personaProbe(
    "mirror-journey-context",
    "mirror/infrastructure query → engineer (journey detection secondary check)",
    "engineer",
  ),
];
