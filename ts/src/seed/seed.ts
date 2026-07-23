// `seed` orchestration — the port of memory.cli.seed.seed(). Scans the
// identity-template YAML tree and upserts core identity, personas, and
// journeys, in that order, reusing the already-ported `setIdentity` write
// primitive. Operates on an already-open `WritableDatabase` and an
// already-resolved `identityRoot`; CLI-level resolution (mirror home, env,
// the header print lines) lives in ../frontDoor/cli.ts, matching how every
// other write in this port keeps CLI argument/env handling out of the pure
// orchestration.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { WritableDatabase } from "../db/database.ts";
import { identityRowExists } from "../identity/identityRead.ts";
import { setIdentity } from "../identity/setIdentity.ts";
import { newId, nowIso } from "../util/pyGenerators.ts";
import {
  loadJourneyContent,
  loadPersonaContent,
  loadYamlContent,
  YamlFileNotFoundError,
} from "./seedYaml.ts";

interface CoreIdentityMapping {
  layer: string;
  key: string;
  yamlPath: string;
  field: string;
}

/** Port of `IDENTITY_MAP`. Order matters: it is the scan/print order. */
const IDENTITY_MAP: readonly CoreIdentityMapping[] = [
  { layer: "self", key: "soul", yamlPath: "self/soul.yaml", field: "soul" },
  { layer: "ego", key: "identity", yamlPath: "ego/identity.yaml", field: "identity" },
  { layer: "ego", key: "behavior", yamlPath: "ego/behavior.yaml", field: "behavior" },
  { layer: "ego", key: "constraints", yamlPath: "ego/constraints.yaml", field: "constraints" },
  { layer: "ego", key: "expression", yamlPath: "ego/expression.yaml", field: "expression" },
  { layer: "user", key: "identity", yamlPath: "user/identity.yaml", field: "user" },
  {
    layer: "organization",
    key: "identity",
    yamlPath: "organization/identity.yaml",
    field: "identity",
  },
  {
    layer: "organization",
    key: "principles",
    yamlPath: "organization/principles.yaml",
    field: "principles",
  },
  { layer: "shadow", key: "profile", yamlPath: "shadow/profile.yaml", field: "profile" },
];

/** Port of `_REQUIRED_IDENTITY_KEYS`: a missing file here is a recorded error;
 * a missing file for any other mapping is a fully silent skip. */
const REQUIRED_IDENTITY_KEYS = new Set([
  "self/soul",
  "ego/identity",
  "ego/behavior",
  "user/identity",
]);

export interface SeedResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  /** One entry per scan-time print line, in Python's exact emission order. */
  lines: string[];
}

function record(
  result: SeedResult,
  existing: boolean,
  force: boolean,
  label: string,
  editHint: string,
): boolean {
  if (existing && !force) {
    result.skipped += 1;
    result.lines.push(`  \u2192 ${label} (skipped \u2014 use '${editHint}' to update)`);
    return false;
  }
  return true;
}

function seedCoreIdentity(
  db: WritableDatabase,
  identityRoot: string,
  force: boolean,
  result: SeedResult,
  readFile: (path: string) => string,
): void {
  for (const mapping of IDENTITY_MAP) {
    const label = `${mapping.layer}/${mapping.key}`;
    try {
      const { content, version } = loadYamlContent(
        join(identityRoot, mapping.yamlPath),
        mapping.field,
        readFile,
      );
      if (!content) {
        result.errors.push(`${label}: empty content`);
        continue;
      }
      const existing = identityRowExists(db, mapping.layer, mapping.key);
      if (
        !record(
          result,
          existing,
          force,
          label,
          `memory identity edit ${mapping.layer} ${mapping.key}`,
        )
      ) {
        continue;
      }
      setIdentity(
        db,
        { id: newId(), layer: mapping.layer, key: mapping.key, content, version },
        nowIso(),
      );
      if (existing) {
        result.updated += 1;
        result.lines.push(`  \u21bb ${label} (updated)`);
      } else {
        result.created += 1;
        result.lines.push(`  \u2713 ${label}`);
      }
    } catch (error) {
      if (error instanceof YamlFileNotFoundError) {
        if (REQUIRED_IDENTITY_KEYS.has(label)) {
          result.errors.push(`${label}: ${error.message}`);
          result.lines.push(`  \u2717 ${label}: ${error.message}`);
        }
        // Else: fully silent skip for a missing, non-required file -- matches
        // Python exactly (no error recorded, no line printed at all).
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${label}: ${message}`);
      result.lines.push(`  \u2717 ${label}: ${message}`);
    }
  }
}

/** `.yaml` filenames directly under `dir`, sorted (mirrors `sorted(dir.glob("*.yaml"))`). */
function yamlFileNames(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yaml"))
    .sort();
}

function seedPersonas(
  db: WritableDatabase,
  identityRoot: string,
  force: boolean,
  result: SeedResult,
  readFile: (path: string) => string,
): void {
  const personasDir = join(identityRoot, "personas");
  for (const fileName of yamlFileNames(personasDir)) {
    const stem = fileName.slice(0, -".yaml".length);
    try {
      const { personaId, content, version, metadataJson } = loadPersonaContent(
        join(personasDir, fileName),
        readFile,
      );
      if (!content) continue;
      const label = `persona/${personaId}`;
      const existing = identityRowExists(db, "persona", personaId);
      if (!record(result, existing, force, label, `memory identity edit persona ${personaId}`)) {
        continue;
      }
      setIdentity(
        db,
        { id: newId(), layer: "persona", key: personaId, content, version, metadata: metadataJson },
        nowIso(),
      );
      if (existing) {
        result.updated += 1;
        result.lines.push(`  \u21bb ${label} (updated)`);
      } else {
        result.created += 1;
        result.lines.push(`  \u2713 ${label}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`persona/${stem}: ${message}`);
      result.lines.push(`  \u2717 persona/${stem}: ${message}`);
    }
  }
}

function seedJourneys(
  db: WritableDatabase,
  identityRoot: string,
  force: boolean,
  result: SeedResult,
  readFile: (path: string) => string,
): void {
  const journeysDir = join(identityRoot, "journeys");
  for (const fileName of yamlFileNames(journeysDir)) {
    const stem = fileName.slice(0, -".yaml".length);
    try {
      const { journeyId, content, version } = loadJourneyContent(
        join(journeysDir, fileName),
        readFile,
      );
      if (!content) continue;
      const label = `journey/${journeyId}`;
      const existing = identityRowExists(db, "journey", journeyId);
      if (!record(result, existing, force, label, `memory identity edit journey ${journeyId}`)) {
        continue;
      }
      setIdentity(
        db,
        { id: newId(), layer: "journey", key: journeyId, content, version },
        nowIso(),
      );
      if (existing) {
        result.updated += 1;
        result.lines.push(`  \u21bb ${label} (updated)`);
      } else {
        result.created += 1;
        result.lines.push(`  \u2713 ${label}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`journey/${stem}: ${message}`);
      result.lines.push(`  \u2717 journey/${stem}: ${message}`);
    }
  }
}

/**
 * Port of `seed()`'s three scan phases (core identity, personas, journeys),
 * in order. Does NOT print the "Mirror home:"/"Identity root:" header lines —
 * those depend on CLI-level resolution and are composed by the caller.
 */
export function runSeed(
  db: WritableDatabase,
  identityRoot: string,
  options: { force?: boolean; readFile?: (path: string) => string } = {},
): SeedResult {
  const force = options.force ?? false;
  const readFile = options.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const result: SeedResult = { created: 0, updated: 0, skipped: 0, errors: [], lines: [] };
  seedCoreIdentity(db, identityRoot, force, result, readFile);
  seedPersonas(db, identityRoot, force, result, readFile);
  seedJourneys(db, identityRoot, force, result, readFile);
  return result;
}
