#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { Database, Row } from "../db/database.ts";
import { openDatabaseForWrite } from "../db/database.ts";
import {
  type JourneyIdentityRow,
  type JourneyOption,
  listJourneyOptions,
} from "../journey/journeyOptions.ts";
import {
  countMemoriesByType,
  type ListRecentFilters,
  listRecentMemorySummaries,
  type MemorySummary,
} from "../memory/listing.ts";
import { detectPersona, type PersonaRoutingRow } from "../persona/detectPersona.ts";
import { expandHome } from "../util/paths.ts";
import { newId, nowIso } from "../util/pyIdentifiers.ts";
import { hasOption, optionValue, stripOptionWithValue } from "./args.ts";
import { MirrorHomeNotConfiguredError, resolveDbPath } from "./dbPath.ts";
import { applyIdentitySet } from "./identityWrite.ts";
import { applyJourneySetPath } from "./journeyWriteRoute.ts";
import { ensureBackup } from "./liveBackup.ts";
import { routeMemoryCommand } from "./routing.ts";

const ICONS: Record<string, string> = {
  decision: "⚖️",
  insight: "💡",
  idea: "🌱",
  journal: "📓",
  tension: "⚡",
  learning: "📚",
  pattern: "🔄",
  commitment: "🤝",
  reflection: "🪞",
};

/**
 * Resolve the database path for a CLI invocation, mapping a configuration
 * failure (no home/env resolvable) to a printed error and null — callers
 * translate null into exit code 2.
 */
function resolveDbPathForCli(args: readonly string[]): string | null {
  try {
    return resolveDbPath(args);
  } catch (error) {
    if (error instanceof MirrorHomeNotConfiguredError) {
      console.error(`Mirror TS front door: ${error.message}`);
      return null;
    }
    throw error;
  }
}

function identityRows(db: Database, layer: string): Row[] {
  return db
    .prepare("SELECT key, content, metadata FROM identity WHERE layer = ? ORDER BY key")
    .all(layer);
}

function routingRows(db: Database): PersonaRoutingRow[] {
  return identityRows(db, "persona").map((row) => {
    let keywords: string[] = [];
    const metadata = row.metadata;
    if (typeof metadata === "string" && metadata) {
      try {
        const parsed = JSON.parse(metadata) as Record<string, unknown>;
        if (Array.isArray(parsed.routing_keywords)) {
          keywords = parsed.routing_keywords.filter(
            (item): item is string => typeof item === "string",
          );
        }
      } catch {
        keywords = [];
      }
    }
    return { key: row.key as string, routing_keywords: keywords };
  });
}

function renderDetectPersona(db: Database, args: readonly string[]): string {
  const query = stripOptionWithValue(args, "--mirror-home").join(" ").trim();
  const matches = detectPersona(query, routingRows(db));
  const lines = [`query: ${query}`];
  if (matches.length === 0) {
    lines.push("  (no persona match)");
  } else {
    for (const match of matches) {
      lines.push(`  ${match.key} score=${match.score} match=${match.matchType}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function journeyRows(db: Database): Array<JourneyOption & { stage: string; description: string }> {
  const options = listJourneyOptions(
    identityRows(db, "journey") as unknown as JourneyIdentityRow[],
  );
  return options.map((option) => {
    const ident = db
      .prepare("SELECT content FROM identity WHERE layer = ? AND key = ?")
      .get("journey", option.id);
    const content = typeof ident?.content === "string" ? ident.content : "";
    const desc = content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#") && !line.startsWith("**"));
    const journeyPath = db
      .prepare("SELECT content FROM identity WHERE layer = ? AND key = ?")
      .get("journey_path", option.id);
    const pathContent = typeof journeyPath?.content === "string" ? journeyPath.content : "";
    const stage =
      pathContent.match(/\*\*(?:Current stage|Etapa atual):\*\*\s*(.+)/)?.[1]?.trim() ?? "—";
    return { ...option, stage, description: (desc ?? "").slice(0, 80) };
  });
}

function renderJourney(
  row: JourneyOption & { stage: string; description: string },
  child = false,
): string[] {
  const icon = { active: "🚧", completed: "✅", paused: "⏸" }[row.status] ?? "•";
  const prefix = child ? "  └─ " : "";
  const detailIndent = child ? "       " : "  ";
  const lines = [
    `${prefix}${icon} **${row.id}** (${row.status})`,
    `${detailIndent}Stage: ${row.stage}`,
  ];
  if (row.description) lines.push(`${detailIndent}${row.description}`);
  lines.push("");
  return lines;
}

function renderJourneys(db: Database): string {
  const rows = journeyRows(db);
  if (rows.length === 0) return "No journeys found.\n";
  const known = new Set(rows.map((row) => row.id));
  const children = new Map<string, typeof rows>();
  const roots: typeof rows = [];
  for (const row of rows) {
    if (row.parent_journey && known.has(row.parent_journey)) {
      const bucket = children.get(row.parent_journey);
      if (bucket) bucket.push(row);
      else children.set(row.parent_journey, [row]);
    } else {
      roots.push(row);
    }
  }
  const lines: string[] = [];
  for (const row of roots) {
    lines.push(...renderJourney(row));
    for (const child of children.get(row.id) ?? []) lines.push(...renderJourney(child, true));
  }
  return lines.join("\n");
}

function tagsText(tags: string | null): string {
  if (!tags) return "";
  try {
    const parsed = JSON.parse(tags) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string").join(", ")
      : "";
  } catch {
    return "";
  }
}

function renderMemoryRow(memory: MemorySummary): string[] {
  const icon = ICONS[memory.memory_type] ?? "•";
  const date = memory.created_at ? memory.created_at.slice(0, 10) : "?";
  const journey = memory.journey ? ` 🧭 ${memory.journey}` : "";
  const persona = memory.persona ? ` ◇ ${memory.persona}` : "";
  const tags = tagsText(memory.tags);
  const lines = [
    `${icon} **${memory.title}**`,
    `  ${date} | \`${memory.id.slice(0, 8)}\` | ${memory.memory_type} [${memory.layer}]${journey}${persona}`,
    `  ${memory.content.slice(0, 200)}`,
  ];
  if (tags) lines.push(`  🏷 ${tags}`);
  lines.push("");
  return lines;
}

function renderMemories(db: Database, args: readonly string[]): string {
  if (hasOption(args, "--search")) throw new Error("search route must fallback to Python");
  const filters: ListRecentFilters = {
    limit: Number(optionValue(args, "--limit") ?? 20),
    memoryType: optionValue(args, "--type"),
    layer: optionValue(args, "--layer"),
    journey: optionValue(args, "--journey"),
  };
  const memories = listRecentMemorySummaries(db, filters);
  if (memories.length === 0) return "No memories found.\n";
  const filterParts = [];
  if (filters.memoryType) filterParts.push(`type=${filters.memoryType}`);
  if (filters.layer) filterParts.push(`layer=${filters.layer}`);
  if (filters.journey) filterParts.push(`journey=${filters.journey}`);
  const filterText = filterParts.length ? ` (${filterParts.join(", ")})` : "";
  const totals = countMemoriesByType(db)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([type, count]) => `${ICONS[type] ?? "•"} ${type}: ${count}`)
    .join(" | ");
  const lines = [`📦 Memories${filterText} — ${memories.length} shown`, totals, ""];
  for (const memory of memories) lines.push(...renderMemoryRow(memory));
  return lines.join("\n");
}

function fallbackPython(argv: readonly string[]): number {
  const explicitDbPath = optionValue(argv, "--db-path");
  const pythonArgv = stripOptionWithValue(argv, "--db-path");
  const result = spawnSync("uv", ["run", "python", "-m", "memory", ...pythonArgv], {
    cwd: process.cwd(),
    env: explicitDbPath ? { ...process.env, DB_PATH: expandHome(explicitDbPath) } : process.env,
    stdio: "inherit",
  });
  return typeof result.status === "number" ? result.status : 1;
}

async function runTs(argv: readonly string[]): Promise<number> {
  const command = argv[0];
  const args = argv.slice(1);
  const dbPath = resolveDbPathForCli(args);
  if (dbPath === null) return 2;
  if (!existsSync(dbPath)) {
    console.error(`Mirror TS front door could not find database: ${dbPath}`);
    return 2;
  }
  process.on("warning", (warning) => {
    if (warning.name === "ExperimentalWarning" && warning.message.includes("SQLite")) return;
    console.warn(warning);
  });
  const { openDatabaseReadOnly } = await import("../db/database.ts");
  const db = openDatabaseReadOnly(dbPath);
  try {
    if (command === "detect-persona") process.stdout.write(renderDetectPersona(db, args));
    else if (command === "journeys") process.stdout.write(renderJourneys(db));
    else if (command === "memories") process.stdout.write(renderMemories(db, args));
    else throw new Error(`Unsupported TS route: ${command}`);
    return 0;
  } finally {
    db.close();
  }
}

function readStdinContent(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function isIdentityWrite(argv: readonly string[]): boolean {
  return argv[0] === "identity" && argv[1] === "set";
}

/**
 * Route `identity set <layer> <key> --content ... | stdin` to the TS core. Mirrors
 * the Python `identity set` interface and output, but writes through the sanctioned
 * live-write seam after a backup, reusing the ported `setIdentity`.
 */
async function runIdentityWrite(argv: readonly string[]): Promise<number> {
  const args = argv.slice(2);
  const positionals = stripOptionWithValue(
    stripOptionWithValue(stripOptionWithValue(args, "--content"), "--db-path"),
    "--mirror-home",
  );
  const layer = positionals[0];
  const key = positionals[1];
  if (!layer || !key) {
    console.error("identity set requires <layer> <key>");
    return 2;
  }
  const content = optionValue(args, "--content") ?? readStdinContent();
  if (!content.trim()) {
    console.error("Error: content is empty.");
    return 1;
  }
  const dbPath = resolveDbPathForCli(args);
  if (dbPath === null) return 2;
  if (!existsSync(dbPath)) {
    console.error(`Mirror TS front door could not find database: ${dbPath}`);
    return 2;
  }
  const db = openDatabaseForWrite(dbPath, ensureBackup(dbPath));
  try {
    const outcome = applyIdentitySet(db, { layer, key, content, id: newId(), nowIso: nowIso() });
    process.stdout.write(`\u2713 ${outcome.layer}/${outcome.key} ${outcome.action}\n`);
    return 0;
  } finally {
    db.close();
  }
}

function isJourneyWrite(argv: readonly string[]): boolean {
  return argv[0] === "journey" && argv[1] === "set-path";
}

/**
 * Route `journey set-path <slug> <path>` to the TS core. Normalizes the path like
 * Python (`Path.expanduser().resolve()`), writes through the live-write seam after a
 * backup via the ported setProjectPath, and mirrors Python's output: the resolved
 * path on stdout, a status line on stderr, and a not-found error + exit 1.
 */
async function runJourneyWrite(argv: readonly string[]): Promise<number> {
  const args = argv.slice(2);
  const positionals = stripOptionWithValue(
    stripOptionWithValue(args, "--db-path"),
    "--mirror-home",
  );
  const slug = positionals[0];
  const rawPath = positionals[1];
  if (!slug || !rawPath) {
    console.error("Usage: journey set-path <slug> <path>");
    return 2;
  }
  const dbPath = resolveDbPathForCli(args);
  if (dbPath === null) return 2;
  if (!existsSync(dbPath)) {
    console.error(`Mirror TS front door could not find database: ${dbPath}`);
    return 2;
  }
  const db = openDatabaseForWrite(dbPath, ensureBackup(dbPath));
  try {
    const resolved = applyJourneySetPath(db, slug, rawPath, nowIso());
    console.error(`project_path set for '${slug}': ${resolved}`);
    process.stdout.write(`${resolved}\n`);
    return 0;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("journey not found")) {
      console.error(`Error: journey '${slug}' not found.`);
      return 1;
    }
    throw error;
  } finally {
    db.close();
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const decision = routeMemoryCommand(argv);
  if (decision.engine === "python") return fallbackPython(argv);
  if (isIdentityWrite(argv)) return runIdentityWrite(argv);
  if (isJourneyWrite(argv)) return runJourneyWrite(argv);
  return runTs(argv);
}

process.exitCode = await main();
