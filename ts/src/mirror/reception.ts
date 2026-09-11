import { parseJsonResponse } from "#extraction/json.ts";
import type { LlmProvider, LlmResponse } from "#providers/llm.ts";
import { pyFormat } from "#util/pythonText.ts";

export interface ReceptionPersona {
  slug: string;
  description: string;
  routingKeywords: readonly string[];
}

export interface ReceptionJourney {
  slug: string;
  description: string;
}

export interface ReceptionResult {
  personas: string[];
  journey: string | null;
  touchesIdentity: boolean;
  touchesShadow: boolean;
}

export const EMPTY_RECEPTION_RESULT: ReceptionResult = Object.freeze({
  personas: [],
  journey: null,
  touchesIdentity: false,
  touchesShadow: false,
});

/**
 * Byte-identical to Python's `RECEPTION_PROMPT`, doubled braces included.
 *
 * The braces are not cosmetic. Python substitutes through `str.format`, which
 * requires `{{` to emit a literal `{`, so the JSON example in the response
 * format section is doubled at the source. Holding the same bytes here means
 * the template can be compared to the oracle directly, and it forces assembly
 * through `pyFormat` -- which is the point: `String.replace()` with a string
 * pattern treats `$&`, `` $` ``, `$'`, and `$1` in the REPLACEMENT as
 * substitution directives, so a persona described as "Cost: $& per hour"
 * assembled as "Cost: {personas} per hour" (CV22.DS8.US3). Python's `format`
 * has no such behavior, no fixture ever carried a `$` pattern, and replay
 * never reads a prompt -- so only a live call would have shown it.
 */
export const RECEPTION_PROMPT = `You are the reception classifier for Mirror Mind, a Jungian mirror AI.

Your job is to classify a single user message on four axes so the mirror can
compose the right context for its response. Read the message carefully, then
return a JSON object — nothing else.

## Available personas
{personas}

## Active journeys
{journeys}

## Classification rules

**personas** (array of slugs, ordered most-to-least relevant, or [] if none apply)
- Return the personas whose domain clearly covers this message.
- Action verbs dominate topic: "write a post about X" → writer, not the X-domain persona.
- When a single persona's domain covers the message, return only that one.
- When genuinely ambiguous, return the most relevant one only.
- Return [] when the ego should answer alone (open questions, general curiosity,
  meta questions about the mirror itself).

**journey** (slug string or null)
- Return the slug whose description best matches the context of this message.
- Conservative: prefer null over a speculative match.
- Return null if no journey is clearly relevant.

**touches_identity** (boolean)
- true ONLY when the message explicitly invites reflection on personal values,
  life purpose, meaning, or deep self-examination.
- Operational and technical questions are false even if they involve important decisions.
- Default false. The cost of missing a touch is a lighter context load;
  the cost of over-triggering is token waste on every routine turn.

**touches_shadow** (boolean)
- true ONLY when there is explicit evidence of avoidance, internal contradiction,
  or a recurring pattern the user is naming or circling around.
- Requires positive signal. Vague discomfort or uncertainty alone is false.
- Default false. Conservative by design.

## Response format
Return ONLY a JSON object, no markdown:
{{
  "personas": ["slug", ...],
  "journey": "slug" or null,
  "touches_identity": true or false,
  "touches_shadow": true or false
}}

## User message
`;

export async function runReception(
  query: string,
  personas: readonly ReceptionPersona[],
  journeys: readonly ReceptionJourney[],
  provider: LlmProvider,
  onLlmCall?: (response: LlmResponse, prompt: string) => void,
): Promise<ReceptionResult> {
  if (!query.trim()) return { ...EMPTY_RECEPTION_RESULT, personas: [] };
  const prompt = buildReceptionPrompt(query, personas, journeys);
  try {
    const response = await provider.complete({ role: "reception", prompt, temperature: 0.1 });
    onLlmCall?.(response, prompt);
    const parsed = parseJsonResponse(response.content);
    if (!isRecord(parsed)) return { ...EMPTY_RECEPTION_RESULT, personas: [] };
    const personasOut = Array.isArray(parsed.personas)
      ? parsed.personas.filter((item): item is string => typeof item === "string")
      : [];
    return {
      personas: personasOut,
      journey: typeof parsed.journey === "string" ? parsed.journey : null,
      touchesIdentity: pythonTruthy(parsed.touches_identity),
      touchesShadow: pythonTruthy(parsed.touches_shadow),
    };
  } catch {
    return { ...EMPTY_RECEPTION_RESULT, personas: [] };
  }
}

/**
 * Python's assembled reception prompt: the formatted template, then the raw
 * query appended after the `## User message` heading.
 *
 * Pure and exported so the assembled BYTES can be graded against the oracle
 * corpus without a provider (CV22.DS8.US3). Replay resolves a fixture by role
 * alone and never reads the prompt, so a drift here would have surfaced first
 * against a real model.
 */
export function buildReceptionPrompt(
  query: string,
  personas: readonly ReceptionPersona[],
  journeys: readonly ReceptionJourney[],
): string {
  return (
    pyFormat(RECEPTION_PROMPT, {
      personas: formatPersonas(personas),
      journeys: formatJourneys(journeys),
    }) + query
  );
}

export function formatPersonas(personas: readonly ReceptionPersona[]): string {
  if (personas.length === 0) return "(none available)";
  return personas
    .map((persona) => {
      const keywords = persona.routingKeywords.slice(0, 6);
      const suffix = keywords.length > 0 ? ` [keywords: ${keywords.join(", ")}]` : "";
      return `- ${persona.slug}: ${sliceCodePoints(persona.description, 120)}${suffix}`;
    })
    .join("\n");
}

export function formatJourneys(journeys: readonly ReceptionJourney[]): string {
  if (journeys.length === 0) return "(none available)";
  return journeys
    .map((journey) => `- ${journey.slug}: ${sliceCodePoints(journey.description, 120)}`)
    .join("\n");
}

export function sliceCodePoints(value: string, limit: number): string {
  return [...value].slice(0, limit).join("");
}

export function pythonTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string" || Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
