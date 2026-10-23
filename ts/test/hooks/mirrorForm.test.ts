// The explicit Mirror Mode form, in every runtime's skill syntax (CV21.DS2.US7).
//
// DS12 measured what each runtime hands the inject hook when a person invokes
// the Mirror skill: Claude Code's plugin sends `/mirror-mind:mm-mirror …`
// (TS1 L4), its menu shows `/mirror-mind:mm:mirror` (TS1 static 6), Codex's
// plugin sends `$mirror-mind:mm:mirror …` (TS2 L10), Grok sends `/mm-mirror …`
// (TS4 L5), and the standalone Claude wiring sends `/mm:mirror …`. The hook
// matched only the last, so on every plugin install the explicit inject path
// was dead and Mirror Mode came from the skill alone.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mirrorForm } from "#mirror/mirrorForm.ts";

describe("the explicit Mirror Mode form", () => {
  const recognized: [string, string][] = [
    // what the runtimes send, and the query that remains
    ["/mm:mirror should I raise my price?", "should I raise my price?"],
    ["/mirror-mind:mm-mirror should I raise my price?", "should I raise my price?"],
    ["/mirror-mind:mm:mirror should I raise my price?", "should I raise my price?"],
    ["$mirror-mind:mm:mirror should I raise my price?", "should I raise my price?"],
    ["/mm-mirror should I raise my price?", "should I raise my price?"],
    ["$mm-mirror should I raise my price?", "should I raise my price?"],
    // the grammar is sigil × namespace × separator, so the other combinations hold too
    ["$mirror-mind:mm-mirror a question", "a question"],
    ["$mm:mirror a question", "a question"],
    // a bare form: Mirror Mode with no question yet
    ["/mm:mirror", ""],
    ["/mirror-mind:mm-mirror", ""],
    ["/mm-mirror   ", ""],
    // whitespace and newlines after the form are not part of the query
    ["/mm-mirror\n\nwhat about this?", "what about this?"],
    ["/mm:mirror\ttabbed", "tabbed"],
    // Pi's own command for the skill, which its menu sends (CR160; CR159 measured it)
    ["/skill:mm-mirror should I raise my price?", "should I raise my price?"],
    ["/skill:mm-mirror", ""],
  ];

  for (const [prompt, query] of recognized) {
    test(`recognizes ${JSON.stringify(prompt)}`, () => {
      const form = mirrorForm(prompt);
      assert.ok(form, "recognized");
      assert.equal(form.query, query);
      assert.equal(prompt.startsWith(form.form), true, "the form is the prompt's prefix");
    });
  }

  const notRecognized = [
    "/mm-mirrors should I raise my price?", // a longer skill name
    "/mm:mirrorx", // a longer skill name, no space
    "/mm-mirror-extra question", // a longer skill name with a hyphen
    "/mirror-mind:mm-mirrorx", // the namespace does not loosen the name
    "hello /mm:mirror should I?", // not at the start
    " /mm:mirror leading space", // not at the start either
    "mm:mirror no sigil", // no sigil
    "//mm:mirror doubled sigil",
    "/mm:journeys", // another skill
    "/skill:mm-mirrors a question", // Pi's command does not loosen the name either
    "/skill:mm-journeys", // Pi's command for another skill
    "/skill:mm:mirror a question", // Pi names the skill by its directory, never with a colon
    "/skill:mirror-mind:mm-mirror a question", // Pi has no plugin namespace
    "/mirror-mind:mm-journeys", // another plugin skill
    "$497 is too much", // Codex's sigil on an ordinary prompt
    "/MM:MIRROR shouting", // skill names are lowercase
    "", // nothing
  ];

  for (const prompt of notRecognized) {
    test(`does not recognize ${JSON.stringify(prompt)}`, () => {
      assert.equal(mirrorForm(prompt), null);
    });
  }
});
