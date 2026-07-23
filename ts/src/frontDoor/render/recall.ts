// `recall <conv_id>` rendering — the port of memory.cli.recall.main.

import {
  findConversationByIdPrefix,
  getMessagesForConversation,
  pythonTailSliceStart,
} from "../../conversation/recall.ts";
import type { Database } from "../../db/database.ts";

/** Raised when no conversation matches the id prefix. Python prints this to stderr, exit 1. */
export class ConversationNotFoundError extends Error {
  readonly convId: string;
  constructor(convId: string) {
    super(`Conversation '${convId}' not found.`);
    this.convId = convId;
  }
}

/** Render `recall <conv_id> [--limit N]`, or throw ConversationNotFoundError. */
export function renderRecall(db: Database, convId: string, limit: number): string {
  const conv = findConversationByIdPrefix(db, convId);
  if (!conv) throw new ConversationNotFoundError(convId);

  const prints: string[] = [
    `# Conversation: ${conv.title || "(untitled)"}`,
    `**Date:** ${conv.started_at ? conv.started_at.slice(0, 10) : "?"}`,
  ];
  if (conv.persona) prints.push(`**Persona:** ${conv.persona}`);
  if (conv.journey) prints.push(`**Journey:** ${conv.journey}`);
  prints.push(`**ID:** \`${conv.id}\``);
  if (conv.summary) {
    prints.push("");
    prints.push(`**Summary:** ${conv.summary}`);
  }
  prints.push("", "---", "");

  const messages = getMessagesForConversation(db, conv.id);
  if (messages.length === 0) {
    prints.push("(conversation has no messages)");
    return prints.map((line) => `${line}\n`).join("");
  }
  const start = pythonTailSliceStart(messages.length, limit);
  for (const msg of messages.slice(start)) {
    prints.push(msg.role === "user" ? "**User:**" : "**Mirror:**");
    prints.push(msg.content);
    prints.push("");
  }
  return prints.map((line) => `${line}\n`).join("");
}
