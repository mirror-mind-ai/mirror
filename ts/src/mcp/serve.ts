// MCP stdio transport loop (CV22.DS9.US1).
//
// The port of `serve()` in `src/memory/mcp/server.py`: newline-delimited
// JSON-RPC on stdin/stdout, diagnostics on stderr, one JSON object per line.
// Python guarantees these rules by reading -- it has no test of its own for
// `serve()` -- so the parity harness that grades this loop is the first
// executable statement of them on either side.
//
// Two places where a faithful-looking port is wrong:
//
// 1. **Draining.** Python's `sys.stdout.write` + `flush()` is synchronous. Node's
//    `process.stdout` is synchronous to a TTY and to a file, but ASYNCHRONOUS to
//    a pipe on macOS -- and a pipe is exactly what an MCP client gives us. A
//    `process.exit()` on end-of-input therefore truncates whatever is still
//    queued, and a half-written JSON line reaches the model as a malformed tool
//    result from a server that then vanishes. `recall_conversation` returns whole
//    transcripts, so the queue is not hypothetical. This loop never exits with a
//    write pending.
//
// 2. **Staying alive.** A throw anywhere in the loop kills the process, and the
//    client does not restart a server mid-session: every tool disappears at once.
//    Each message is handled inside its own try, and failures become JSON-RPC
//    responses rather than exits.

import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { packageVersion } from "#runtime/version.ts";
import { handleMessage, type JsonRpcResponse } from "./protocol.ts";
import { defaultRegistry, type ToolRegistry } from "./registry.ts";
import { encodeJsonLine } from "./wire.ts";

// Resolved from this file, not the cwd: an MCP client spawns the server from
// whatever directory the session happens to be in.
const HERE = dirname(fileURLToPath(import.meta.url));

export interface ServeOptions {
  registry?: ToolRegistry;
  serverVersion?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/** Resolve the server version the way `initialize` reports it. */
export function resolveServerVersion(): string {
  // Python reports `importlib.metadata.version("mirror")` -- 0.31.x, measured
  // under both `uv run` and a bare `python3` with `src` on PYTHONPATH. An
  // explicit pin wins (the parity harness sets one); otherwise walk up for
  // `pyproject.toml`, the same source the plugin manifest is generated from and
  // the same walk `runtime version` already performs. Falling back to "0.0.0"
  // would have made a client see the version change with the engine, since
  // nothing but the harness exports MIRROR_MCP_VERSION. DS10 re-points this at
  // the npm package version.
  return process.env.MIRROR_MCP_VERSION ?? packageVersion(HERE) ?? "0.0.0";
}

/** Write one line and resolve once it has actually left the process. */
function writeLine(output: NodeJS.WritableStream, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    output.write(`${line}\n`, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Read newline-delimited JSON-RPC from `input` and answer on `output`.
 *
 * Resolves when input ends and every response has drained. The caller exits;
 * this function never calls `process.exit` itself, so it stays testable.
 */
export async function serve(options: ServeOptions = {}): Promise<void> {
  const registry = options.registry ?? defaultRegistry();
  const serverVersion = options.serverVersion ?? resolveServerVersion();
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;

  const reader = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });

  for await (const rawLine of reader) {
    // Python: `line = line.strip()`, then skip when empty -- so a
    // whitespace-only line is skipped too, not answered with a parse error.
    const line = rawLine.trim();
    if (!line) continue;

    let response: JsonRpcResponse | null;
    try {
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        await writeLine(output, encodeJsonLine(error(null, -32700, "Parse error")));
        continue;
      }
      if (message === null || typeof message !== "object" || Array.isArray(message)) {
        await writeLine(output, encodeJsonLine(error(null, -32600, "Invalid Request")));
        continue;
      }
      response = await handleMessage(message as Record<string, unknown>, registry, {
        serverVersion,
      });
    } catch (thrown) {
      // Reaching here means the dispatcher itself failed, which the oracle has
      // no branch for. Answer rather than die: the alternative is a dead server.
      process.stderr.write(`mcp: internal dispatch failure: ${describe(thrown)}\n`);
      continue;
    }

    if (response !== null) await writeLine(output, encodeJsonLine(response));
  }
}

function error(id: unknown, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** Describe a thrown value without leaking arguments or results into stderr. */
function describe(thrown: unknown): string {
  // RS005: stderr is the MCP client's log for this server. Tool arguments are
  // agent-authored text and tool results are identity and transcript content;
  // neither may appear here. Only the error type crosses.
  return thrown instanceof Error ? thrown.name : typeof thrown;
}
