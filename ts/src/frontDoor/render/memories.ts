// `memories` rendering: read recent summaries, format rows and the
// count-by-type header. Extracted from cli.ts (CR002).

import type { Database } from "../../db/database.ts";
import {
  countMemoriesByType,
  type ListRecentFilters,
  listRecentMemorySummaries,
  type MemorySummary,
} from "../../memory/listing.ts";
import { hasOption, optionValue } from "../args.ts";
import { ICONS } from "./icons.ts";

/** Format a JSON tags string into a comma-joined list, or "" when absent/malformed. */
export function tagsText(tags: string | null): string {
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

/** Format one memory summary into display lines. */
export function renderMemoryRow(memory: MemorySummary): string[] {
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

/** Render the `memories` listing. Throws on `--search` (that route stays on Python). */
export function renderMemories(db: Database, args: readonly string[]): string {
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
