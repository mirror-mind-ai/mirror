// MCP JSON-RPC dispatch (CV22.DS9.US1).
//
// A faithful port of `handle_message` in `src/memory/mcp/server.py`. Pure over
// the message and the registry -- no I/O, no database, no stdio -- which is what
// makes it gradeable against a golden. `serve.ts` is the thin loop around it.
//
// Key-insertion order matters here. Responses are serialized with
// `JSON.stringify`, which emits keys in insertion order, and the parity golden
// compares the resulting bytes against Python's `json.dumps`. Every object
// literal below is written in the oracle's field order for that reason.

import type { ToolRegistry } from "./registry.ts";

export const PROTOCOL_VERSION = "2025-06-18";
export const SERVER_NAME = "mirror-mind";

/** A JSON-RPC id: any JSON value, including `0`, `""`, and `null`. */
export type JsonRpcId = unknown;

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface HandleOptions {
  /** Injectable so the parity test can freeze what `importlib.metadata` returns. */
  serverVersion: string;
}

function result(id: JsonRpcId, value: Record<string, unknown>): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result: value };
}

function error(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/**
 * Render a value the way Python's f-string `str()` would, for the one place the
 * oracle interpolates an arbitrary argument into a message: `Unknown tool: {name}`.
 * A missing name is `None` in Python, not `undefined`; `True`/`False` are
 * capitalized. Getting this wrong is invisible until a client logs the string.
 */
function pythonStr(value: unknown): string {
  if (value === undefined || value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

/**
 * Python's `x or {}`: falsy values (None, {}, [], "", 0, False) become `{}`.
 * Used for `params` and `arguments`, where the oracle relies on that coercion.
 */
function orEmptyObject(value: unknown): unknown {
  if (value === undefined || value === null || value === false || value === 0 || value === "") {
    return {};
  }
  if (Array.isArray(value)) return value.length === 0 ? {} : value;
  if (typeof value === "object" && Object.keys(value as object).length === 0) return {};
  return value;
}

/** Extract the error text the way Python's `str(exc)` would. */
function errorText(thrown: unknown): string {
  if (thrown instanceof Error) return thrown.message;
  return String(thrown);
}

/**
 * Dispatch one JSON-RPC message. Returns a response, or `null` for notifications.
 *
 * Request-vs-notification is decided by KEY PRESENCE (`"id" in message`), exactly
 * as the oracle does -- so `{"id": 0}`, `{"id": ""}` and `{"id": null}` are all
 * requests whose id must be echoed. Deciding on truthiness instead leaves those
 * clients waiting forever for a response that is never written.
 */
export async function handleMessage(
  message: Record<string, unknown>,
  registry: ToolRegistry,
  options: HandleOptions,
): Promise<JsonRpcResponse | null> {
  const method = message.method;
  const isNotification = !("id" in message);
  const id = message.id;

  if (typeof method !== "string") {
    return isNotification ? null : error(id, -32600, "Invalid Request");
  }

  if (method === "initialize") {
    const params = orEmptyObject(message.params) as Record<string, unknown>;
    const requested = params.protocolVersion;
    return result(id, {
      protocolVersion: typeof requested === "string" ? requested : PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: options.serverVersion },
    });
  }

  if (method === "notifications/initialized") return null;

  if (method === "ping") return result(id, {});

  if (method === "tools/list") {
    return result(id, {
      tools: registry.list.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    });
  }

  if (method === "tools/call") {
    const params = orEmptyObject(message.params) as Record<string, unknown>;
    const name = params.name;
    const args = orEmptyObject(params.arguments);
    const tool = typeof name === "string" ? registry.byName.get(name) : undefined;
    if (tool === undefined) return error(id, -32602, `Unknown tool: ${pythonStr(name)}`);
    try {
      const text = await tool.handler(args);
      return result(id, { content: [{ type: "text", text }], isError: false });
    } catch (thrown) {
      // Tool errors are results, not protocol errors: the client sees a readable
      // failure and the session continues. A protocol error here would look to
      // the client like a broken server.
      return result(id, {
        content: [{ type: "text", text: `Error: ${errorText(thrown)}` }],
        isError: true,
      });
    }
  }

  // Unknown notifications are ignored; unknown requests get an error. Same
  // method string, different outcome, decided only by the presence of `id`.
  return isNotification ? null : error(id, -32601, `Method not found: ${method}`);
}
