// CV21.DS4.TS3: a prompt that opens with a skill invocation, in any runtime's
// sigil, is a command turn. These cases pin the grammar's edges and the
// relation to its one exception: every Mirror form is also a command turn, so
// the exception sits inside the rule and the two cannot drift apart unnoticed.

import assert from "node:assert/strict";
import test from "node:test";
import { isCommandTurn } from "#conversation/commandTurn.ts";
import { mirrorForm } from "#mirror/mirrorForm.ts";

test("a prompt opening with / is a command turn, whatever follows", () => {
  // Every runtime uses `/` for its own built-ins too, so the slash side skips anything.
  for (const prompt of [
    "/mm-journeys",
    "/help",
    "/mirror-mind:mm:build mirror",
    "/",
    "/ x",
    "/5",
  ]) {
    assert.equal(isCommandTurn(prompt), true, prompt);
  }
});

test("a prompt opening with $ and a skill name is a command turn, on every runtime", () => {
  for (const prompt of [
    "$mm-journeys",
    "$mirror-mind:mm:journeys",
    "$mm-build mirror",
    "$mm-journeys\nand a second line",
    "$my_skill do it",
    "$a",
    "$skill2 go",
  ]) {
    assert.equal(isCommandTurn(prompt), true, prompt);
  }
});

test("a $ that is not a skill name is conversation", () => {
  // `$` is Codex's skill sigil and nothing else; `$5 a month` is English.
  for (const prompt of [
    "$5 a month seems fine",
    "$HOME is set",
    "$1,000",
    "$$",
    "$",
    "$ 10",
    "$mirror-mind:",
    "$mm-Journeys",
    "$-x",
    "$_x",
  ]) {
    assert.equal(isCommandTurn(prompt), false, prompt);
  }
});

test("the form ends at whitespace or the end; a comma is not a boundary, nor is a leading space", () => {
  // The boundary `mirrorForm` draws.
  assert.equal(isCommandTurn("$mm-journeys, please"), false);
  assert.equal(isCommandTurn(" $mm-journeys"), false);
  assert.equal(isCommandTurn(" /help"), false);
  assert.equal(isCommandTurn(""), false);
  assert.equal(isCommandTurn("hello $mm-journeys"), false);
});

test("every Mirror form is a command turn: the exception sits inside the rule", () => {
  for (const form of [
    "/mm:mirror",
    "/mirror-mind:mm-mirror",
    "/mirror-mind:mm:mirror",
    "$mirror-mind:mm:mirror",
    "/mm-mirror",
    "$mm-mirror",
  ]) {
    assert.ok(mirrorForm(form), `${form} is a Mirror form`);
    assert.equal(isCommandTurn(form), true, form);
    assert.equal(isCommandTurn(`${form} what matters today`), true, form);
  }
});
