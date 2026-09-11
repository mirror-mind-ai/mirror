import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The Python-generated assembled-prompt corpus, shared by every surface that
 * grades its prompt bytes against the oracle.
 *
 * One loader rather than one per test file: the corpus is a single artifact
 * (`uv run python ts/parity/generate_prompt_assembly_golden.py`) and the
 * grading rule is the same everywhere — assembled bytes equal, digest equal.
 */

export interface PromptScenario {
  label: string;
  surface: string;
  inputs: Record<string, unknown>;
  prompt: string;
  prompt_sha256: string;
}

export interface PromptAssemblyGolden {
  system_prompts: Record<string, string>;
  scenarios: PromptScenario[];
}

const GOLDEN_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "goldens",
  "prompt-assembly.golden.json",
);

export function promptAssemblyGolden(): PromptAssemblyGolden {
  return JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as PromptAssemblyGolden;
}

export function scenariosFor(surface: string): PromptScenario[] {
  return promptAssemblyGolden().scenarios.filter((scenario) => scenario.surface === surface);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
