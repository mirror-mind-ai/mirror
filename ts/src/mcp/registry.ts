// MCP tool registry (CV22.DS9.US1).
//
// A faithful port of `src/memory/mcp/tools.py`'s declarations: the seven tool
// names, descriptions, and JSON Schemas that `tools/list` serializes. These
// bytes are the client contract -- some clients cache them across sessions, and
// the descriptions are prompt text the model reads every time it decides
// whether to call a tool -- so US2 may fill in behavior but must not disturb
// the declarations.
//
// The absence of `annotations` is deliberate, not an omission. The 2025-06-18
// protocol lets a server declare `readOnlyHint`, and clients use it to skip the
// per-call permission prompt. Every tool here IS read-only, so the hint would be
// truthful -- and it would remove the only human-in-the-loop gate on what the
// DS9 threat model calls a read oracle over private memory: the caller is the
// model, and the model is driven by anything in its context. Parity and security
// agree here; the golden's byte-identical `tools/list` enforces it.
//
// US1 shipped declarations over stub handlers so the protocol could be graded
// without a database; US2 wires them to the TS capabilities that already exist
// (`loadMirrorContext`, journey listing/status, `searchMemories`, conversation
// listing/recall, `detectPersona`).

import type { Database } from "#db/database.ts";
import {
  detectPersonaTool,
  journeyStatusTool,
  listConversationsTool,
  listJourneysTool,
  recallConversationTool,
} from "./tools/deterministic.ts";
import {
  mirrorContextTool,
  searchMemoriesTool,
  type ToolRuntime,
} from "./tools/providerCrossing.ts";

/** JSON Schema as the tool declares it; shape is opaque to the protocol layer. */
export type JsonSchema = Record<string, unknown>;

/** A tool handler: receives the raw `arguments` value and returns text content. */
export type ToolHandler = (args: unknown) => string | Promise<string>;

/** An MCP tool: name, description, schema, handler -- mirroring Python's `Tool`. */
export interface Tool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  handler: ToolHandler;
}

/** The registry the protocol layer dispatches against. */
export interface ToolRegistry {
  /** Declaration order, as `tools/list` serializes it. */
  list: readonly Tool[];
  /** Dispatch map for `tools/call`. May hold entries absent from `list`. */
  byName: ReadonlyMap<string, Tool>;
}

function notImplemented(name: string): ToolHandler {
  return () => {
    throw new Error(`Tool '${name}' is not wired yet (CV22.DS9.US2 owns tool behavior)`);
  };
}

/** What the wired handlers need from the process. */
export interface ToolContext {
  db: Database;
  runtime: ToolRuntime;
}

/**
 * The registry with real handlers, in Python's declaration order.
 *
 * Declarations stay exactly as `TOOL_DECLARATIONS` has them -- `tools/list` is
 * the client contract and must not shift when behavior arrives.
 */
export function wiredRegistry(context: ToolContext): ToolRegistry {
  const handlers: Record<string, ToolHandler> = {
    mirror_context: (args) => mirrorContextTool(context.db, args, context.runtime),
    list_journeys: (args) => listJourneysTool(context.db, args),
    journey_status: (args) => journeyStatusTool(context.db, args),
    search_memories: (args) => searchMemoriesTool(context.db, args, context.runtime),
    list_conversations: (args) => listConversationsTool(context.db, args),
    recall_conversation: (args) => recallConversationTool(context.db, args),
    detect_persona: (args) => detectPersonaTool(context.db, args),
  };
  return buildRegistry(
    TOOL_DECLARATIONS.map((declaration) => {
      const handler = handlers[declaration.name];
      if (!handler) throw new Error(`no handler wired for tool '${declaration.name}'`);
      return { ...declaration, handler };
    }),
  );
}

/**
 * The seven tools, in Python's declaration order. Descriptions and schemas are
 * byte-for-byte the strings in `tools.py`; changing one is a client-visible
 * contract change, and the parity golden fails on it.
 */
export const TOOL_DECLARATIONS: readonly Omit<Tool, "handler">[] = [
  {
    name: "mirror_context",
    description:
      "Load Mirror identity context on demand (side-effect-free). Optionally " +
      "scope by persona and journey; pass the user query for attachment search.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "User query for attachment search." },
        persona: { type: "string", description: "Persona id to scope context." },
        journey: { type: "string", description: "Journey slug to scope context." },
      },
    },
  },
  {
    name: "list_journeys",
    description: "List active journeys with status, stage, and description.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "journey_status",
    description: "Get status for one journey, or overall status when no slug is given.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "Journey slug." } },
    },
  },
  {
    name: "search_memories",
    description: "Search memories by query, or list by type/layer/journey filter.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        type: { type: "string", description: "Memory type filter." },
        layer: { type: "string", description: "Jungian layer filter." },
        journey: { type: "string", description: "Journey slug filter." },
        limit: { type: "integer", default: 5 },
      },
    },
  },
  {
    name: "list_conversations",
    description: "List recent conversations with optional journey/persona filters.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", default: 20 },
        journey: { type: "string" },
        persona: { type: "string" },
      },
    },
  },
  {
    name: "recall_conversation",
    description: "Load messages from a previous conversation by id (prefix accepted).",
    inputSchema: {
      type: "object",
      properties: {
        conversation_id: { type: "string" },
        limit: { type: "integer", default: 50 },
      },
      required: ["conversation_id"],
    },
  },
  {
    name: "detect_persona",
    description: "Show persona routing matches for a query.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
];

/** Build a registry from tools, optionally adding dispatch-only entries. */
export function buildRegistry(
  list: readonly Tool[],
  dispatchOnly: readonly Tool[] = [],
): ToolRegistry {
  const byName = new Map<string, Tool>();
  for (const tool of [...list, ...dispatchOnly]) byName.set(tool.name, tool);
  return { list, byName };
}

/**
 * The seven declarations over handlers that refuse.
 *
 * Kept for the protocol tests, which grade dispatch without a database. The
 * server uses `wiredRegistry`.
 */
export function defaultRegistry(): ToolRegistry {
  return buildRegistry(
    TOOL_DECLARATIONS.map((declaration) => ({
      ...declaration,
      handler: notImplemented(declaration.name),
    })),
  );
}
