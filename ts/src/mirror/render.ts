const WIDTH = 56;

export function renderMirrorModeTransition(input: {
  identity: string;
  journey?: string | null;
  personas?: readonly string[];
}): string {
  const rows: [string, string][] = [["identity", input.identity]];
  if (input.journey) rows.push(["active journey", input.journey]);
  rows.push([
    "what this mode is",
    "Identity lens. Mirror reflects from memory, values, journeys, tensions, and personas.",
  ]);
  rows.push(["persona routing", personaRoutingLine([...(input.personas ?? [])].sort())]);
  rows.push(["available lenses", "◌ Mirror Mode · ■ Builder Mode · △ Explorer Mode · ☾ Soul Mode"]);
  return box("◌  MIRROR MODE ACTIVE", rows);
}

export function renderMirrorBanner(persona: string | null): string {
  const first = "\u001b[38;5;183m⏺ Mirror Mode active\u001b[0m\n";
  return persona
    ? `${first}\u001b[38;5;183m  ✦ Persona: ${persona}\u001b[0m\n`
    : `${first}\u001b[38;5;183m  Ego responding without persona\u001b[0m\n`;
}

export function renderJourneyDetected(match: [string, number, string]): string {
  return `\u001b[38;5;183m  🧭 Journey detected: ${match[0]} (${match[2]}, score: ${match[1].toFixed(2)})\u001b[0m\n`;
}

export function renderMirrorJourneys(
  journeys: readonly { id: string; name: string; description: string }[],
): string {
  return journeys
    .map((journey) => `- **${journey.id}** — ${journey.name}: ${journey.description}\n`)
    .join("");
}

function personaRoutingLine(personas: string[]): string {
  if (personas.length === 0) return "when the topic asks: personas route naturally";
  const shown = personas.slice(0, 3);
  const remaining = personas.length - shown.length;
  return `when the topic asks: ${shown.join(", ")}${remaining > 0 ? ` and ${remaining} more available` : ""}`;
}

function box(title: string, rows: readonly [string, string][]): string {
  const lines = ["Mirror", `╭${"─".repeat(WIDTH)}╮`, line(`        ${title}`)];
  for (const [label, value] of rows) {
    lines.push(line(""));
    lines.push(line(`  ${label}`));
    for (const wrapped of wrap(value)) lines.push(line(`  ${wrapped}`));
  }
  lines.push(`╰${"─".repeat(WIDTH)}╯`);
  return lines.join("\n");
}

function line(text: string): string {
  const content = [...text].slice(0, WIDTH).join("");
  return `│${content}${" ".repeat(Math.max(0, WIDTH - [...content].length))}│`;
}

function wrap(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = words[0] ?? "";
  for (const word of words.slice(1)) {
    if ([...current].length + [...word].length + 1 <= WIDTH - 2) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}
