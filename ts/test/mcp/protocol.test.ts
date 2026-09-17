import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { handleMessage } from "#mcp/protocol.ts";
import { buildRegistry, defaultRegistry, TOOL_DECLARATIONS, type Tool } from "#mcp/registry.ts";
import { encodeJsonLine } from "#mcp/wire.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = JSON.parse(
  readFileSync(join(HERE, "..", "goldens", "mcp-protocol.golden.json"), "utf-8"),
) as {
  protocol_version: string;
  server_name: string;
  frozen_version: string;
  dispatch: { name: string; request: Record<string, unknown>; response: unknown }[];
  framing: { stdout_lines: string[] };
};

const GOLDEN_FRAMING = GOLDEN.framing.stdout_lines;

// The generator installs these in TOOLS_BY_NAME only -- never in TOOLS -- so
// tools/call is graded without a database while tools/list still records the
// seven real declarations. The registry mirrors that split exactly.
const stubOk: Tool = {
  name: "__stub_ok",
  description: "Stub tool that returns text.",
  inputSchema: { type: "object", properties: {} },
  handler: (args) => `stub ok: ${pythonJson(args)}`,
};

const stubRaise: Tool = {
  name: "__stub_raise",
  description: "Stub tool that raises.",
  inputSchema: { type: "object", properties: {} },
  handler: () => {
    throw new Error("stub failure");
  },
};

/** `json.dumps(args, ensure_ascii=False, sort_keys=True)` for the stub's text. */
function pythonJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(pythonJson).join(", ")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}: ${pythonJson(v)}`).join(", ")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function registry() {
  return buildRegistry(defaultRegistry().list, [stubOk, stubRaise]);
}

for (const testCase of GOLDEN.dispatch) {
  test(`dispatch parity: ${testCase.name}`, async () => {
    const response = await handleMessage(testCase.request, registry(), {
      serverVersion: GOLDEN.frozen_version,
    });
    assert.deepEqual(response, testCase.response ?? null);
  });
}

test("dispatch parity is byte-exact, not just structurally equal", async () => {
  // deepEqual ignores key order; the wire format does not. Python emits
  // {jsonrpc, id, result} and Node's JSON.stringify follows insertion order,
  // so comparing serialized bytes is what actually proves the contract.
  for (const testCase of GOLDEN.dispatch) {
    if (testCase.response === null) continue;
    const response = await handleMessage(testCase.request, registry(), {
      serverVersion: GOLDEN.frozen_version,
    });
    assert.equal(
      JSON.stringify(response),
      JSON.stringify(testCase.response),
      `byte mismatch in ${testCase.name}`,
    );
  }
});

test("tools/list serializes the seven real declarations in Python's order", async () => {
  const response = await handleMessage(
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    registry(),
    { serverVersion: GOLDEN.frozen_version },
  );
  const tools = (response?.result as { tools: { name: string }[] }).tools;
  assert.deepEqual(
    tools.map((t) => t.name),
    [
      "mirror_context",
      "list_journeys",
      "journey_status",
      "search_memories",
      "list_conversations",
      "recall_conversation",
      "detect_persona",
    ],
  );
  // The stubs are dispatchable but must never be advertised.
  assert.equal(
    tools.some((t) => t.name.startsWith("__stub")),
    false,
  );
});

test("no tool declares annotations, so clients keep prompting per call", () => {
  // DS9 threat model: the caller is the model, driven by anything in its
  // context; the client's per-call permission prompt is the only human gate on
  // a read oracle over private memory. A truthful `readOnlyHint: true` would
  // let clients skip it. Parity and security agree -- this asserts both.
  for (const declaration of TOOL_DECLARATIONS) {
    assert.equal(
      "annotations" in declaration,
      false,
      `${declaration.name} must not declare annotations`,
    );
  }
});

test("constants match the oracle", () => {
  assert.equal(GOLDEN.protocol_version, "2025-06-18");
  assert.equal(GOLDEN.server_name, "mirror-mind");
});

test("default registry handlers refuse until US2 wires them", async () => {
  const response = await handleMessage(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_memories" } },
    defaultRegistry(),
    { serverVersion: GOLDEN.frozen_version },
  );
  const payload = response?.result as { content: { text: string }[]; isError: boolean };
  assert.equal(payload.isError, true);
  assert.match(payload.content[0].text, /^Error: Tool 'search_memories' is not wired yet/);
});

test("the wire encoder reproduces Python's json.dumps separators", () => {
  // Python: json.dumps(obj) -> '{"a": 1, "b": [1, 2]}'
  // JS:     JSON.stringify(obj) -> '{"a":1,"b":[1,2]}'
  // Clients parse either, but a byte-identical wire keeps the parity claim from
  // needing an asterisk at DS10 (see ts/src/mcp/wire.ts).
  assert.equal(encodeJsonLine({ a: 1, b: [1, 2] }), '{"a": 1, "b": [1, 2]}');
  assert.equal(encodeJsonLine({}), "{}");
  assert.equal(encodeJsonLine([]), "[]");
  assert.equal(
    encodeJsonLine({ nested: { empty: {}, list: [] } }),
    '{"nested": {"empty": {}, "list": []}}',
  );
  assert.equal(encodeJsonLine(null), "null");
  // ensure_ascii=False on the Python side: non-ASCII travels unescaped.
  assert.equal(encodeJsonLine({ t: "não ✳" }), '{"t": "não ✳"}');
  // Control characters keep JSON.stringify's escaping, which matches Python's.
  assert.equal(encodeJsonLine({ t: "a\nb\tc" }), '{"t": "a\\nb\\tc"}');
});

test("every golden dispatch response re-encodes to the oracle's exact bytes", async () => {
  const framing = GOLDEN_FRAMING;
  assert.ok(framing.length > 0);
  for (const testCase of GOLDEN.dispatch) {
    if (testCase.response === null) continue;
    const response = await handleMessage(testCase.request, registry(), {
      serverVersion: GOLDEN.frozen_version,
    });
    assert.equal(
      encodeJsonLine(response),
      encodeJsonLine(testCase.response),
      `wire mismatch in ${testCase.name}`,
    );
  }
});
