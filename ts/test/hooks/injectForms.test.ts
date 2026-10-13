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

function inject(home: string, sessionId: string, prompt: string): string {
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
    },
    input: JSON.stringify({ session_id: sessionId, prompt }),
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
    test(`${form} in a fresh session injects context`, () => {
      // One fresh session per form: a second prompt in the same session is
      // owed context by case 2 of the hook, which would mask case 1.
      const out = inject(home, `us7-form-${index}`, `${form} should I raise my price?`);
      assert.ok(out.length > 0, "context was returned");
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
