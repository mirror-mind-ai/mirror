// YAML template parsing for `seed` — the port of the load_* helpers in
// memory.cli.seed. Uses the `yaml` package (safe `parse`, no arbitrary object
// instantiation — the same trust boundary as Python's `yaml.safe_load`).

import { basename } from "node:path";
import { parse as parseYaml } from "yaml";

/** Port of Python's uncaught `FileNotFoundError(f"File not found: {full_path}")`. */
export class YamlFileNotFoundError extends Error {
  readonly path: string;
  constructor(path: string) {
    super(`File not found: ${path}`);
    this.path = path;
  }
}

function asRecord(data: unknown): Record<string, unknown> {
  return data !== null && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

function stringField(data: Record<string, unknown>, field: string): string | null {
  const value = data[field];
  return typeof value === "string" ? value : null;
}

export interface CoreYamlContent {
  content: string;
  version: string;
}

/**
 * Port of `load_yaml_content`: read one field (and `version`) from a YAML
 * file. Throws YamlFileNotFoundError when the file is absent, matching
 * Python's explicit check (not a generic ENOENT from the read itself).
 */
export function loadYamlContent(
  fullPath: string,
  field: string,
  readFile: (path: string) => string,
): CoreYamlContent {
  let raw: string;
  try {
    raw = readFile(fullPath);
  } catch {
    throw new YamlFileNotFoundError(fullPath);
  }
  const data = asRecord(parseYaml(raw));
  return {
    content: stringField(data, field) ?? "",
    version: stringField(data, "version") ?? "1.0.0",
  };
}

export interface PersonaYamlContent {
  personaId: string;
  content: string;
  version: string;
  /** Canonical (plain JSON.stringify) form, per the DS6 identity.metadata
   * decision: byte-mimicking Python's json.dumps spacing was the transition
   * contract only; every reader JSON.parses, so key order (preserved by
   * object-literal insertion order here) is what matters, not whitespace. */
  metadataJson: string;
}

/** Port of `load_persona_content`. */
export function loadPersonaContent(
  fullPath: string,
  readFile: (path: string) => string,
): PersonaYamlContent {
  const data = asRecord(parseYaml(readFile(fullPath)));
  const stem = basename(fullPath, ".yaml");
  const personaId = stringField(data, "persona_id") ?? stem;
  const version = stringField(data, "version") ?? "1.0.0";

  const parts: string[] = [];
  const systemPrompt = stringField(data, "system_prompt");
  if (systemPrompt) parts.push(systemPrompt);
  const briefing = stringField(data, "briefing");
  if (briefing) parts.push(`\n\n# Briefing\n\n${briefing}`);

  const rawKeywords = data.routing_keywords;
  const routingKeywords = Array.isArray(rawKeywords)
    ? rawKeywords.filter((item): item is string => typeof item === "string")
    : [];
  const metadata = {
    persona_id: personaId,
    name: stringField(data, "name"),
    inherits_from: stringField(data, "inherits_from"),
    description: stringField(data, "description"),
    routing_keywords: routingKeywords,
    default_model: stringField(data, "default_model"),
  };

  return {
    personaId,
    content: parts.join(""),
    version,
    metadataJson: JSON.stringify(metadata),
  };
}

export interface JourneyYamlContent {
  journeyId: string;
  content: string;
  version: string;
}

/** Port of `load_journey_content` (`_resolve_journey_id` inlined). */
export function loadJourneyContent(
  fullPath: string,
  readFile: (path: string) => string,
): JourneyYamlContent {
  const data = asRecord(parseYaml(readFile(fullPath)));
  const stem = basename(fullPath, ".yaml");
  const journeyId = stringField(data, "journey_id") || stem;
  const version = stringField(data, "version") ?? "1.0.0";

  const parts: string[] = [];
  const name = stringField(data, "name");
  if (name) parts.push(`# ${name}`);
  const status = stringField(data, "status");
  if (status) parts.push(`**Status:** ${status}`);
  const description = stringField(data, "description");
  if (description) parts.push(`\n## Description\n\n${description}`);
  const briefing = stringField(data, "briefing");
  if (briefing) parts.push(`\n## Briefing\n\n${briefing}`);
  const context = stringField(data, "context");
  if (context) parts.push(`\n## Context\n\n${context}`);

  return { journeyId, content: parts.join("\n"), version };
}
