import { createHash } from "node:crypto";

import { loadReplayFixture } from "./replay.ts";

export type LlmRole =
  | "extraction"
  | "task_extraction"
  | "summary"
  | "curation"
  | "consult"
  | "reception"
  | "consolidation"
  | "shadow_scan"
  // CV22.DS7.US10 slice C′ — the close-time metadata surfaces. Role names
  // match Python's `build_llm_logger` roles so the llm_calls ledger agrees.
  | "conversation_title"
  | "conversation_tags"
  | "conversation_summary";

export interface LlmRequest {
  role: LlmRole;
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmResponse {
  content: string;
  model?: string;
  generationId?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
}

export interface LlmProvider {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export interface ReplayLlmFixture {
  kind: "llm";
  responses: Partial<Record<LlmRole, LlmResponse | string>>;
  /**
   * Optional per-role SHA-256 of the fully assembled prompt (CV22.DS7.US10
   * slice C′, ai-engineer plan review — blocking).
   *
   * Replay resolves by `role` alone, so a TS prompt that drifted from the
   * Python oracle would replay happily and the divergence would only surface
   * at the DS8 live cutover, against real users. When a fixture pins a digest,
   * a mismatch is a hard, deterministic failure instead.
   *
   * Optional by design: DS5-era fixtures predate prompt assembly and stay
   * valid, while every fixture that pins a digest is strictly enforced.
   */
  promptDigests?: Partial<Record<LlmRole, string>>;
}

/** SHA-256 of an assembled prompt, as pinned in replay fixtures. */
export function promptDigest(prompt: string): string {
  return createHash("sha256").update(prompt, "utf8").digest("hex");
}

export class ReplayLlmProvider implements LlmProvider {
  private readonly fixture: ReplayLlmFixture;
  readonly calls: LlmRequest[] = [];

  constructor(fixture: ReplayLlmFixture) {
    this.fixture = fixture;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push(request);
    const expectedDigest = this.fixture.promptDigests?.[request.role];
    if (expectedDigest !== undefined) {
      const actualDigest = promptDigest(request.prompt);
      if (actualDigest !== expectedDigest) {
        throw new Error(
          `replay prompt digest mismatch for role '${request.role}': ` +
            `fixture pins ${expectedDigest}, assembled prompt is ${actualDigest}. ` +
            "The TypeScript prompt drifted from the Python oracle; regrade the " +
            "assembled-prompt golden before changing the fixture.",
        );
      }
    }
    const response = this.fixture.responses[request.role];
    if (response === undefined) {
      throw new Error(`missing replay LLM response for role '${request.role}'`);
    }
    return typeof response === "string" ? { content: response } : response;
  }
}

export async function loadReplayLlmProvider(path: string): Promise<ReplayLlmProvider> {
  const fixture = await loadReplayFixture(path);
  assertReplayLlmFixture(fixture);
  return new ReplayLlmProvider(fixture);
}

export function assertReplayLlmFixture(value: unknown): asserts value is ReplayLlmFixture {
  if (!isRecord(value) || value.kind !== "llm") {
    throw new Error("LLM replay fixture must declare kind='llm'");
  }
  if (!isRecord(value.responses)) {
    throw new Error("LLM replay fixture must include responses object");
  }
  if (value.promptDigests !== undefined) {
    if (!isRecord(value.promptDigests)) {
      throw new Error("LLM replay fixture promptDigests must be an object");
    }
    for (const [role, digest] of Object.entries(value.promptDigests)) {
      if (!isLlmRole(role)) {
        throw new Error(`LLM replay fixture pins a digest for unsupported role '${role}'`);
      }
      if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) {
        throw new Error(`LLM replay fixture digest for '${role}' must be a sha256 hex string`);
      }
    }
  }
  for (const [role, response] of Object.entries(value.responses)) {
    if (!isLlmRole(role)) {
      throw new Error(`LLM replay fixture includes unsupported role '${role}'`);
    }
    if (typeof response === "string") continue;
    if (!isRecord(response) || typeof response.content !== "string") {
      throw new Error(`LLM replay fixture response '${role}' must be a string or { content }`);
    }
  }
}

function isLlmRole(value: string): value is LlmRole {
  return (
    value === "extraction" ||
    value === "task_extraction" ||
    value === "summary" ||
    value === "curation" ||
    value === "consult" ||
    value === "reception" ||
    value === "consolidation" ||
    value === "shadow_scan" ||
    value === "conversation_title" ||
    value === "conversation_tags" ||
    value === "conversation_summary"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
