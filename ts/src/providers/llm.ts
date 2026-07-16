import { loadReplayFixture } from "./replay.ts";

export type LlmRole = "extraction" | "task_extraction" | "summary" | "curation" | "consult";

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
}

export class ReplayLlmProvider implements LlmProvider {
  private readonly fixture: ReplayLlmFixture;
  readonly calls: LlmRequest[] = [];

  constructor(fixture: ReplayLlmFixture) {
    this.fixture = fixture;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push(request);
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
    value === "consult"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
