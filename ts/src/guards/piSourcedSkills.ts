// Skills with one body in every runtime (CR102).
//
// Most Mirror skills have two authored bodies. `.pi/skills/` serves Pi, and
// through the `.agents/skills/` links Codex and Gemini CLI too. `.claude/skills/`
// serves Claude Code, and `claudePlugin.ts` copies it into the plugin. CR071
// kept the two apart on purpose: Usage sections, example language, and in
// `mm-soul` and `mm-mirror` whole lines that are true for one runtime only.
//
// `mm-build` had no such line, and its two bodies drifted anyway. By 2026-09-27
// the Claude Code copy was 108 lines against Pi's 1093, with no activation
// boundary, no journey binding, and no Ariad. So a skill in this list has one
// body: its Pi copy is the only one anyone edits, and `claudePlugin.ts`
// generates both Claude Code copies from it with this module's transform.
//
// A skill joins the list only when its Pi body is true in every runtime, which
// is a decision to record in `docs/project/decisions.md`, not a refactoring.

export const PI_SKILLS_DIR = ".pi/skills";

/** Skills whose Claude Code copies are generated from the Pi copy. */
export const PI_SOURCED_SKILLS: readonly string[] = ["mm-build"];

const MIRROR_PREFIX = "mm-";

/** The Claude Code name of a Mirror skill: `mm-build` is `mm:build` (CR071). */
export function claudeSkillName(skill: string): string {
  if (!skill.startsWith(MIRROR_PREFIX)) {
    throw new Error(
      `${skill} is not a Mirror skill: its name does not start with ${MIRROR_PREFIX}`,
    );
  }
  return `mm:${skill.slice(MIRROR_PREFIX.length)}`;
}

/**
 * The Claude Code copy of a Pi-sourced skill: the Pi text with its frontmatter
 * `name` line rewritten, and every other byte unchanged.
 *
 * Refuses, naming `sourcePath`, unless the frontmatter holds exactly one `name`
 * line and it names this skill as every Mirror skill does. A transform that
 * guessed would write a wrong name into a file nobody edits by hand.
 */
export function claudeVariant(skill: string, piText: string, sourcePath: string): string {
  const lines = piText.split("\n");
  const close = lines.indexOf("---", 1);
  if (lines[0] !== "---" || close === -1) {
    throw new Error(`${sourcePath}: has no frontmatter`);
  }

  const expected = `name: "${skill}"`;
  const nameLines = lines
    .slice(1, close)
    .map((line, offset) => ({ line, index: offset + 1 }))
    .filter(({ line }) => line.startsWith("name:"));
  if (nameLines.length !== 1 || nameLines[0].line !== expected) {
    throw new Error(
      `${sourcePath}: expected exactly one frontmatter line \`${expected}\`, ` +
        `found ${describeFound(nameLines.map(({ line }) => line))}`,
    );
  }

  lines[nameLines[0].index] = `name: "${claudeSkillName(skill)}"`;
  return lines.join("\n");
}

function describeFound(nameLines: readonly string[]): string {
  if (nameLines.length === 0) return "none";
  if (nameLines.length > 1) return String(nameLines.length);
  return `\`${nameLines[0]}\``;
}
