import type { LlmResponse } from "../providers/llm.ts";

export const USD_TO_BRL = 5.7;
export const BALANCE_BAR_WIDTH = 20;

export interface CreditInfo {
  totalCredits: number;
  totalUsage: number;
  balance: number;
}

export function renderCredits(info: CreditInfo): string {
  const balanceBrl = info.balance * USD_TO_BRL;
  const fill =
    info.totalCredits > 0 ? Math.trunc((BALANCE_BAR_WIDTH * info.balance) / info.totalCredits) : 0;
  const bar = "▓".repeat(fill) + "░".repeat(BALANCE_BAR_WIDTH - fill);
  return `Balance: openrouter: ${bar} R$ ${balanceBrl.toFixed(2)}`;
}

export function renderConsultAsk(
  requestedModel: string,
  response: LlmResponse,
  credits: CreditInfo,
  cost: number | null = null,
): string {
  const lines = [
    `Consulting ${requestedModel}...`,
    `--- response via ${response.model ?? requestedModel} ---`,
    response.content,
    "--- end ---",
  ];
  const costParts: string[] = [];
  if (response.promptTokens) costParts.push(`prompt: ${response.promptTokens}`);
  if (response.completionTokens) costParts.push(`completion: ${response.completionTokens}`);
  if (costParts.length > 0) lines.push(`[${costParts.join(", ")}]`);
  if (cost !== null) lines.push(renderCost(cost));
  lines.push(renderCredits(credits));
  return lines.join("\n");
}

export function renderCost(totalCost: number): string {
  const costBrl = totalCost * USD_TO_BRL;
  if (totalCost < 0.01) {
    return `Call cost: $${totalCost.toFixed(6)} (R$ ${costBrl.toFixed(4)})`;
  }
  return `Call cost: $${totalCost.toFixed(4)} (R$ ${costBrl.toFixed(2)})`;
}
