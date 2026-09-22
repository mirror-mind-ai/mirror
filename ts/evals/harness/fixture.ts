/**
 * Typed access to the captured probe fixtures (CV22.DS10.TS3 plateau 4).
 *
 * `ts/evals/fixtures/captured/<module>.json` holds what the Python probes fed
 * the pipeline, recorded by executing them against stand-ins rather than
 * transcribed by hand. A TS probe reads its inputs from here so both engines
 * ask the model the same thing; the ASSERTION stays in the module, as it does
 * in Python, because an expectation is logic rather than data.
 *
 * `evals/_check_fixture_equality.py` keeps these honest while Python exists.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtractionMessage } from "#extraction/conversation.ts";

const CAPTURED_DIR = join(dirname(dirname(fileURLToPath(import.meta.url))), "fixtures", "captured");

/** A captured pipeline call: the function a probe reached, and its arguments. */
export interface CapturedCall {
  function: string;
  args: unknown[];
  kwargs: Record<string, unknown>;
  redacted?: string[];
}

export interface CapturedProbe {
  id: string;
  description: string;
  blocking: boolean;
  calls: CapturedCall[];
}

export interface CapturedModule {
  provenance: Record<string, string>;
  threshold: number;
  probes: CapturedProbe[];
}

const cache = new Map<string, CapturedModule>();

export function loadCaptured(moduleName: string): CapturedModule {
  const cached = cache.get(moduleName);
  if (cached) return cached;
  const parsed = JSON.parse(
    readFileSync(join(CAPTURED_DIR, `${moduleName}.json`), "utf8"),
  ) as CapturedModule;
  cache.set(moduleName, parsed);
  return parsed;
}

/**
 * The probes of a module, in captured order.
 *
 * Fails loudly on an unknown id rather than returning undefined: a renamed
 * probe must break the port, not silently run against nothing.
 */
export function capturedProbe(moduleName: string, probeId: string): CapturedProbe {
  const probe = loadCaptured(moduleName).probes.find((p) => p.id === probeId);
  if (!probe) throw new Error(`No captured probe '${probeId}' in fixture '${moduleName}'`);
  return probe;
}

export function capturedCall(moduleName: string, probeId: string): CapturedCall {
  const call = capturedProbe(moduleName, probeId).calls[0];
  if (!call) throw new Error(`Captured probe '${moduleName}/${probeId}' recorded no call`);
  return call;
}

interface CapturedMessage {
  role: string;
  content: string;
}

/** Positional argument `index` of a probe's captured call, as a transcript. */
export function capturedMessages(
  moduleName: string,
  probeId: string,
  index = 0,
): ExtractionMessage[] {
  const raw = capturedCall(moduleName, probeId).args[index] as CapturedMessage[];
  return raw.map((message) => ({ role: message.role, content: message.content }));
}

/** Positional argument `index` of a probe's captured call, as a string. */
export function capturedString(moduleName: string, probeId: string, index = 0): string {
  return capturedCall(moduleName, probeId).args[index] as string;
}

/** Positional argument `index` of a probe's captured call, as records. */
export function capturedRecords<T>(moduleName: string, probeId: string, index = 0): T[] {
  return (capturedCall(moduleName, probeId).args[index] ?? []) as T[];
}
