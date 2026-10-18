#!/usr/bin/env node
// CV21.DS10.US3 — the probe hook, DS12's probe.js in module form (Grok's branch).
//
// Registered under ~/.grok/hooks/ds10-probe.json in a scratch HOME for every
// event Mirror's plugin registers. It captures the payload it was given to
// live/<run>/hooks.jsonl — the same record DS12 wrote, so the two captures
// compare — counts each event, and answers in Grok's own injection shape with
// a canary the model is later asked to quote: CANARY-DS10-<id>-start at
// SessionStart (as a `systemMessage`, which Grok shows on screen, AND as
// `additionalContext`, which Grok ignores — DS12.TS4 L2), and -turn-<n> on
// UserPromptSubmit (`additionalContext`, L3). What the model quotes is what
// reached it; what this file wrote is what was offered.
//
// Test fixture, not product: node:fs only, scratch-only, inert.
import fs from "node:fs";
import path from "node:path";

const [ev] = process.argv.slice(2);
const dir = process.env.DS10_LIVE;
let input = "";
try {
  input = fs.readFileSync(0, "utf8");
} catch {}
const id = fs.readFileSync(path.join(dir, "canary"), "utf8").trim();
const countFile = path.join(dir, `count-${ev}`);
const n = (fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, "utf8")) : 0) + 1;
fs.writeFileSync(countFile, String(n));
const tag = (k) => `CANARY-DS10-${id}-${k}`;
let out = {};
if (ev === "SessionStart") {
  out = {
    systemMessage: tag("start"),
    hookSpecificOutput: { hookEventName: ev, additionalContext: tag("start") },
  };
} else if (ev === "UserPromptSubmit") {
  out = { hookSpecificOutput: { hookEventName: ev, additionalContext: tag(`turn-${n}`) } };
}
fs.appendFileSync(
  path.join(dir, "hooks.jsonl"),
  `${JSON.stringify({ at: new Date().toISOString(), event: ev, n, emitted: out, payload: input })}\n`,
);
process.stdout.write(JSON.stringify(out));
