import { loadReplayFixture } from "./replay.ts";

export interface CreditInfo {
  totalCredits: number;
  totalUsage: number;
  balance: number;
}

export interface CreditProvider {
  getCredits(): Promise<CreditInfo>;
  fetchGenerationCost(generationId: string): Promise<number | null>;
}

export interface ReplayCreditFixture {
  kind: "credits";
  credits: CreditInfo;
  generationCosts?: Record<string, number | null>;
}

export class ReplayCreditProvider implements CreditProvider {
  private readonly fixture: ReplayCreditFixture;

  constructor(fixture: ReplayCreditFixture) {
    this.fixture = fixture;
  }

  async getCredits(): Promise<CreditInfo> {
    return this.fixture.credits;
  }

  async fetchGenerationCost(generationId: string): Promise<number | null> {
    return this.fixture.generationCosts?.[generationId] ?? null;
  }
}

export async function loadReplayCreditProvider(path: string): Promise<ReplayCreditProvider> {
  const fixture = await loadReplayFixture(path);
  assertReplayCreditFixture(fixture);
  return new ReplayCreditProvider(fixture);
}

export function assertReplayCreditFixture(value: unknown): asserts value is ReplayCreditFixture {
  if (!isRecord(value) || value.kind !== "credits") {
    throw new Error("credits replay fixture must declare kind='credits'");
  }
  if (!isCreditInfo(value.credits)) {
    throw new Error("credits replay fixture must include numeric credits");
  }
  if (value.generationCosts !== undefined && !isRecord(value.generationCosts)) {
    throw new Error("credits replay fixture generationCosts must be an object");
  }
}

function isCreditInfo(value: unknown): value is CreditInfo {
  return (
    isRecord(value) &&
    typeof value.totalCredits === "number" &&
    typeof value.totalUsage === "number" &&
    typeof value.balance === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
