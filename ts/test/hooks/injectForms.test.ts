// The inject hook, end to end, fed each runtime's explicit Mirror form
// (CV21.DS2.US7).
//
// `mirrorForm.test.ts` pins the grammar. This pins what a person loses when
// the grammar and the hook disagree: the context. DS12.TS1 static 6 measured
// the hook before this story: `/mm:mirror` returned 7,067 bytes of context
// and `/mirror-mind:mm:mirror` returned 0, in a fresh session each.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, test } from "node:test";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const roots: string[] = [];

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function inject(
  home: string,
  sessionId: string,
  prompt: string,
  shape: Record<string, string> = {},
  extraEnv: Record<string, string> = {},
): string {
  return execFileSync("bash", [join(REPO_ROOT, ".claude/hooks/mirror-inject.sh")], {
    encoding: "utf8",
    env: {
      ...process.env,
      DB_PATH: join(home, "memory.db"),
      MEMORY_ENV: "production",
      MIRROR_HOME: home,
      MIRROR_USER: "",
      MIRROR_NODE: process.execPath,
      OPENROUTER_API_KEY: "",
      ...extraEnv,
    },
    input: JSON.stringify({ session_id: sessionId, prompt, ...shape }),
    timeout: 60_000,
  });
}

describe("the inject hook, fed each runtime's explicit form", () => {
  const home = mkdtempSync(join(tmpdir(), "mirror-inject-forms-"));
  roots.push(home);
  mkdirSync(home, { recursive: true });

  const forms = [
    "/mm:mirror",
    "/mirror-mind:mm-mirror",
    "/mirror-mind:mm:mirror",
    "$mirror-mind:mm:mirror",
    "/mm-mirror",
    "$mm-mirror",
  ];

  for (const [index, form] of forms.entries()) {
    test(`${form} in a fresh session injects context, opened by the delivered line`, () => {
      // One fresh session per form, so each spelling is seen on an explicit
      // turn and not as a delta of the previous one.
      const out = inject(home, `us7-form-${index}`, `${form} should I raise my price?`);
      assert.ok(out.length > 0, "context was returned");
      // CV9.DS8.US4: the hook delivers through the doorman, so the block opens
      // with the line the mm-mirror skill reads to know it must not load again.
      assert.match(out, /^=== mirror context delivered by the runtime for this turn: full — /);
      assert.match(out, /MIRROR MODE/);
    });
  }

  test("a longer skill name, or a mention, injects nothing in a fresh session", () => {
    for (const [index, prompt] of [
      "/mm-mirrors should I raise my price?",
      "I typed /mm:mirror yesterday and it worked",
      "/mm:journeys",
    ].entries()) {
      assert.equal(inject(home, `us7-none-${index}`, prompt), "", prompt);
    }
  });
});

// CR143 (CV21.DS10.TS4). Grok runs the same hook and discards what it returns:
// a UserPromptSubmit hook's additionalContext never reaches Grok's model
// (DS12.TS4 L3; US3's canary on 1.0.62). The loads it made — on the explicit
// form, and once when Mirror Mode is active — held a Grok turn 2.3–2.6 s for
// nothing. On a payload shaped as Grok sends it, the hook returns before any
// load; the same prompt shaped as Claude Code or Codex sends it still loads.
describe("the inject hook on a runtime that discards prompt context", () => {
  const home = mkdtempSync(join(tmpdir(), "mirror-inject-grok-"));
  roots.push(home);

  test("a Grok-shaped payload (camelCase hookEventName, promptId) loads nothing and prints nothing", () => {
    const out = inject(home, "cr143-grok-1", "/mm-mirror should I raise my price?", {
      hookEventName: "UserPromptSubmit",
      promptId: "p-1",
    });
    assert.equal(out, "");
  });

  test("Grok's environment marks alone (GROK_HOOK_EVENT, GROK_SESSION_ID) are enough", () => {
    const out = inject(
      home,
      "cr143-grok-2",
      "/mm-mirror should I raise my price?",
      {},
      { GROK_HOOK_EVENT: "UserPromptSubmit", GROK_SESSION_ID: "cr143-grok-2" },
    );
    assert.equal(out, "");
  });

  test("the same prompt shaped as Codex (turn_id) still loads context", () => {
    const out = inject(home, "cr143-codex", "/mm-mirror should I raise my price?", {
      turn_id: "t-1",
    });
    assert.match(out, /MIRROR MODE/);
  });
});
