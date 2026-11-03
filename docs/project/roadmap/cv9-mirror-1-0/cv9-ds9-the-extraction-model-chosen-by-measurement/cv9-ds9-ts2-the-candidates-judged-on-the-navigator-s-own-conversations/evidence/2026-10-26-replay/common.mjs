// Shared by CV9.DS9.TS2's replay scripts. Nothing here is content: paths, arms,
// surfaces, seeds, the seeded shuffle, and file helpers.
//
// Content (transcripts, outputs, traces, verdicts) lives only in SCRATCH, a 0700
// directory outside the repository and outside both Mirror homes. The repository
// is public; what this kit commits is generated from numbers and fixed labels.

import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const KIT = dirname(fileURLToPath(import.meta.url));
export const REPO = join(KIT, "..", "..", "..", "..", "..", "..", "..");
export const SCRATCH = process.env.TS2_SCRATCH ?? join(homedir(), "mirror-ts2-replay");
export const PRODUCTION_HOME = process.env.TS2_HOME ?? join(homedir(), ".mirror-minds", "vinicius");
export const DEVELOPMENT_HOME = join(homedir(), ".mirror-minds", "vinicius-dev");

export const ARMS = {
  flash: { model: "google/gemini-2.5-flash-lite", reasoning: null },
  luna: { model: "openai/gpt-6-luna", reasoning: "none" },
  haiku: { model: "anthropic/claude-haiku-5.5", reasoning: "none" },
};
export const ARM_NAMES = Object.keys(ARMS);
export const JUDGE_MODEL = "moonshotai/kimi-k3.1-pro";
export const PRICES = { flash: [0.1, 0.4], luna: [0.1, 0.5], haiku: [0.1, 0.5] }; // USD per 1M

export const SURFACES_WITH_JOURNEY = ["memories", "tasks", "title", "summary", "tags"];
export const SURFACES_WITHOUT_JOURNEY = ["title", "summary", "tags"];
export const surfacesFor = (transcript) =>
  transcript.journey ? SURFACES_WITH_JOURNEY : SURFACES_WITHOUT_JOURNEY;

/** Which surface a traced call served, from the first words of its prompt. */
export const PROMPT_HEADS = [
  ["memories", "Extract memories"],
  ["tasks", "You are the task management system"],
  ["title", "Write one concise, useful title"],
  ["summary", "Write a 3-4 sentence"],
  ["tags", "You create durable search tags"],
];

export const SEEDS = {
  draw: "CV9.DS9.TS2/draw/2026-10-26",
  labelsPass1: "CV9.DS9.TS2/labels/pass1",
  labelsPass2: "CV9.DS9.TS2/labels/pass2",
  rejudge: "CV9.DS9.TS2/rejudge",
  calibration: "CV9.DS9.TS2/calibration",
};

/** A seeded generator (mulberry32 on the first four bytes of the seed's SHA-256). */
export function rng(seed) {
  let a = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates with a given generator; never mutates its input. */
export function shuffle(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const scratch = (...parts) => join(SCRATCH, ...parts);

export function ensureScratch() {
  mkdirSync(SCRATCH, { recursive: true, mode: 0o700 });
  chmodSync(SCRATCH, 0o700);
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`, { mode: 0o600 });
}

export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
export const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
