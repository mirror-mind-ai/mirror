// CV9.DS8.TS3 -- the mm-mirror skill's contract with the doorman, and one
// signature rule, held across five surfaces.
//
// Until this story the signature drifted for months without anyone noticing:
// AGENTS.md signed an active persona `◇ persona-name`, the skill's copies said
// `✦ Persona:` and "do not reuse ◇", and the core's banner printed `✦ Persona:`.
// DS8 decision 2 settled the spelling on AGENTS.md's; this guard is what keeps
// it settled. It also holds the other half of TS3: the skill reads the stable
// prefix `doorman.ts` exports to know the runtime delivered Mirror's context for
// this turn, so the skill's copies must quote that prefix byte for byte -- a
// change to the constant must break here, naming the copies that still quote
// the old one.
//
// Three skill copies, not four: Codex reads the Pi body through the
// `.agents/skills/mm-mirror` link, and the plugin copy is generated from the
// Claude body by `buildClaudePlugin.ts`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { DELIVERED_LINE_PREFIX, deliveredLine } from "#mirror/doorman.ts";
import { renderMirrorBanner } from "#mirror/render.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

const SIGNATURE_RULE = "◇ persona-name";
const RETIRED_SIGNATURE = "✦ Persona";

const SKILL_COPIES = [
  ".pi/skills/mm-mirror/SKILL.md",
  ".claude/skills/mm-mirror/SKILL.md",
  "plugins/mirror-mind/skills/mm-mirror/SKILL.md",
] as const;

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

test("AGENTS.md states the signature rule ◇ persona-name", () => {
  const agents = read("AGENTS.md");
  assert.match(agents, /^◇ persona-name$/m, "AGENTS.md: the fenced signature line");
});

for (const copy of SKILL_COPIES) {
  test(`${copy} quotes the delivered prefix on one line and follows the signature rule`, () => {
    const text = read(copy);
    const quoted = text.split("\n").some((line) => line.includes(`\`${DELIVERED_LINE_PREFIX}\``));
    assert.ok(
      quoted,
      `${copy}: must quote \`${DELIVERED_LINE_PREFIX}\` on one line, in backticks -- the prefix doorman.ts exports`,
    );
    assert.ok(
      text.includes(`\`${SIGNATURE_RULE}\``),
      `${copy}: must state the signature rule \`${SIGNATURE_RULE}\` as AGENTS.md does`,
    );
    assert.ok(
      !text.includes(RETIRED_SIGNATURE),
      `${copy}: still says ${RETIRED_SIGNATURE}; the signature is ${SIGNATURE_RULE} (DS8 decision 2)`,
    );
    assert.doesNotMatch(
      text,
      /do not reuse/i,
      `${copy}: still forbids ◇ for personas; the signature is ${SIGNATURE_RULE}`,
    );
  });
}

test("the core's banner signs ◇ <persona>", () => {
  const banner = renderMirrorBanner("engineer");
  assert.ok(banner.includes("◇ engineer"), "renderMirrorBanner: must sign ◇ engineer");
  assert.ok(!banner.includes("✦"), "renderMirrorBanner: still prints ✦");
  assert.ok(
    !renderMirrorBanner(null).includes("◇"),
    "renderMirrorBanner: no signature without a persona",
  );
});

test("the doorman's delivered line signs ◇ <persona>", () => {
  const line = deliveredLine({ kind: "full", persona: "engineer", journey: null });
  assert.ok(
    line.startsWith(DELIVERED_LINE_PREFIX),
    "deliveredLine: opens with the exported prefix",
  );
  assert.ok(line.includes("sign ◇ engineer"), "deliveredLine: must say sign ◇ engineer");
});
