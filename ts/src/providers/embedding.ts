import { loadReplayFixture } from "./replay.ts";

export interface EmbeddingProvider {
  embed(text: string): Promise<readonly number[]>;
}

export interface ReplayEmbeddingFixture {
  kind: "embedding";
  request?: {
    model?: string;
    input_sha256?: string;
  };
  response: {
    embedding: readonly number[];
  };
}

export class ReplayEmbeddingProvider implements EmbeddingProvider {
  private readonly fixture: ReplayEmbeddingFixture;

  constructor(fixture: ReplayEmbeddingFixture) {
    this.fixture = fixture;
  }

  async embed(_text: string): Promise<readonly number[]> {
    return this.fixture.response.embedding;
  }
}

export async function loadReplayEmbeddingProvider(path: string): Promise<ReplayEmbeddingProvider> {
  const fixture = await loadReplayFixture(path);
  assertReplayEmbeddingFixture(fixture);
  return new ReplayEmbeddingProvider(fixture);
}

export function assertReplayEmbeddingFixture(
  value: unknown,
): asserts value is ReplayEmbeddingFixture {
  if (!isRecord(value) || value.kind !== "embedding") {
    throw new Error("embedding replay fixture must declare kind='embedding'");
  }
  const response = value.response;
  if (!isRecord(response) || !Array.isArray(response.embedding)) {
    throw new Error("embedding replay fixture must include response.embedding[]");
  }
  if (!response.embedding.every((item) => typeof item === "number" && Number.isFinite(item))) {
    throw new Error("embedding replay fixture response.embedding must contain only finite numbers");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
