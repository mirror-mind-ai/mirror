// CR102: the Claude Code copy of a Pi-sourced skill is its Pi copy with one
// line changed.
//
// `mm-build` had two hand-written bodies. By 2026-09-27 the Claude Code one was
// 108 lines against Pi's 1093: every Builder rule written since June reached
// Pi, Codex, and Gemini CLI and never Claude Code. Its body serves every
// runtime, so it now has one. These cases pin the transform that turns the Pi
// copy into the Claude Code copy, and its refusals: a transform that guessed
// would write a wrong skill name into a file nobody edits by hand.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { claudeSkillName, claudeVariant } from "#guards/piSourcedSkills.ts";

const SOURCE = ".pi/skills/mm-build/SKILL.md";
const FRONTMATTER = 'name: "mm-build"\ndescription: Activates Builder Mode\nuser-invocable: true';

function piSkill(frontmatter: string, body = "# Builder Mode\n\nBody.\n"): string {
  return `---\n${frontmatter}\n---\n\n${body}`;
}

describe("claudeSkillName", () => {
  test("writes a Mirror skill's prefix the Claude Code way", () => {
    assert.equal(claudeSkillName("mm-build"), "mm:build");
    assert.equal(claudeSkillName("mm-release-notes"), "mm:release-notes");
  });

  test("refuses a name that is not a Mirror skill", () => {
    assert.throws(() => claudeSkillName("build"), /not a Mirror skill/);
  });
});

describe("claudeVariant", () => {
  test("changes the frontmatter name and nothing else", () => {
    const pi = piSkill(
      FRONTMATTER,
      "# Builder Mode\n\nPi: `/mm-build`. Claude Code: `/mm:build`.\n",
    );

    const claude = claudeVariant("mm-build", pi, SOURCE);

    assert.equal(claude, pi.replace('name: "mm-build"', 'name: "mm:build"'));
  });

  test("leaves the same line alone when it appears in the body", () => {
    const body = '# Builder Mode\n\n```yaml\nname: "mm-build"\n```\n';

    const claude = claudeVariant("mm-build", piSkill(FRONTMATTER, body), SOURCE);

    assert.equal(claude.split("\n")[1], 'name: "mm:build"');
    assert.ok(claude.endsWith(body));
  });

  const refusals: [string, string, string][] = [
    ["no frontmatter", "# Builder Mode\n", "has no frontmatter"],
    [
      "a frontmatter that never closes",
      '---\nname: "mm-build"\n# Builder Mode\n',
      "has no frontmatter",
    ],
    ["no name line", piSkill("description: Activates Builder Mode"), "found none"],
    ["two name lines", piSkill('name: "mm-build"\nname: "mm-build"'), "found 2"],
    ["another skill's name", piSkill('name: "mm-explore"'), 'found `name: "mm-explore"`'],
    ["an unquoted name", piSkill("name: mm-build"), "found `name: mm-build`"],
  ];
  for (const [label, text, finding] of refusals) {
    test(`refuses ${label}, naming the file`, () => {
      assert.throws(
        () => claudeVariant("mm-build", text, SOURCE),
        (error: Error) => {
          assert.ok(error.message.startsWith(`${SOURCE}: `), error.message);
          assert.ok(error.message.includes(finding), error.message);
          return true;
        },
      );
    });
  }

  test("names the one line it expected", () => {
    assert.throws(
      () => claudeVariant("mm-build", piSkill("description: x"), SOURCE),
      /expected exactly one frontmatter line `name: "mm-build"`/,
    );
  });
});
