import assert from "node:assert/strict";
import { test } from "node:test";
import { routeMemoryCommand } from "../../src/frontDoor/routing.ts";

test("routes DS2 read commands to TS", () => {
  assert.deepEqual(routeMemoryCommand(["detect-persona", "builder"]), {
    command: "detect-persona",
    engine: "ts",
    reason: "DS2 read command ported to TS",
  });
  assert.equal(routeMemoryCommand(["journeys"]).engine, "ts");
  assert.equal(routeMemoryCommand(["memories", "--limit", "5"]).engine, "ts");
});

test("routes DS5 external commands to TS only under replay-safe gate", () => {
  assert.deepEqual(routeMemoryCommand(["memories", "--search", "builder"]), {
    command: "memories",
    engine: "python",
    reason: "fresh semantic search needs DS5 replay/live config for TS route",
  });
  assert.deepEqual(
    routeMemoryCommand(["memories", "--search", "builder"], {
      MIRROR_TS_EXTERNAL_ROUTES: "1",
      MIRROR_TS_SEARCH_EMBEDDING_REPLAY: "/tmp/embedding.json",
    }),
    {
      command: "memories",
      engine: "ts",
      reason: "DS5 fresh semantic search routed to TS under replay-safe config",
    },
  );
  assert.deepEqual(
    routeMemoryCommand(["consult", "credits"], {
      MIRROR_TS_EXTERNAL_ROUTES: "1",
      MIRROR_TS_CREDITS_REPLAY: "/tmp/credits.json",
    }),
    {
      command: "consult",
      engine: "ts",
      reason: "DS5 consult credits routed to TS under replay-safe config",
    },
  );
  assert.deepEqual(
    routeMemoryCommand(["consult", "gemini", "hello"], {
      MIRROR_TS_EXTERNAL_ROUTES: "1",
      MIRROR_TS_CONSULT_LLM_REPLAY: "/tmp/llm.json",
      MIRROR_TS_CREDITS_REPLAY: "/tmp/credits.json",
    }),
    {
      command: "consult",
      engine: "ts",
      reason: "DS5 consult ask routed to TS under replay-safe config",
    },
  );
});

test("keeps unported commands on Python fallback", () => {
  assert.equal(routeMemoryCommand(["build", "load", "mirror-ts-core"]).engine, "python");
  assert.equal(routeMemoryCommand(["journal", "hello"]).engine, "python");
  assert.equal(routeMemoryCommand(["conversation-logger", "extract-pending"]).engine, "python");
});

test("routes `identity set/list/get` to TS but keeps the interactive `edit` on Python", () => {
  assert.deepEqual(routeMemoryCommand(["identity", "set", "ego", "behavior", "--content", "x"]), {
    command: "identity",
    engine: "ts",
    reason: "DS4 identity set write ported to TS",
  });
  assert.deepEqual(routeMemoryCommand(["identity", "list"]), {
    command: "identity",
    engine: "ts",
    reason: "DS7.US1 identity list/get read ported to TS",
  });
  assert.equal(routeMemoryCommand(["identity", "list", "--layer", "ego"]).engine, "ts");
  assert.equal(routeMemoryCommand(["identity", "get", "ego", "behavior"]).engine, "ts");
  assert.equal(routeMemoryCommand(["identity", "edit", "ego", "behavior"]).engine, "python");
});

test("routes `recall` to TS", () => {
  assert.deepEqual(routeMemoryCommand(["recall", "abc1234"]), {
    command: "recall",
    engine: "ts",
    reason: "DS7.US1 recall read ported to TS",
  });
  assert.equal(routeMemoryCommand(["recall", "abc1234", "--limit", "5"]).engine, "ts");
});

test("routes `inspect persona` to TS but keeps other inspect targets on Python", () => {
  assert.deepEqual(routeMemoryCommand(["inspect", "persona", "engineer"]), {
    command: "inspect",
    engine: "ts",
    reason: "DS7.US1 inspect persona read ported to TS",
  });
  assert.equal(routeMemoryCommand(["inspect", "extension", "ext-google-ads"]).engine, "python");
  assert.equal(routeMemoryCommand(["inspect", "runtime-catalog", "pi"]).engine, "python");
  assert.equal(routeMemoryCommand(["inspect", "llm-calls"]).engine, "python");
  assert.equal(routeMemoryCommand(["inspect", "embedding-provenance"]).engine, "python");
});

test("routes `list personas/journeys` to TS but keeps `list extensions/all` on Python", () => {
  assert.deepEqual(routeMemoryCommand(["list", "personas"]), {
    command: "list",
    engine: "ts",
    reason: "DS7.US1 list personas read ported to TS",
  });
  assert.deepEqual(routeMemoryCommand(["list", "journeys"]), {
    command: "list",
    engine: "ts",
    reason: "DS7.US1 list journeys read ported to TS",
  });
  assert.equal(routeMemoryCommand(["list", "personas", "--verbose"]).engine, "ts");
  assert.equal(routeMemoryCommand(["list", "extensions"]).engine, "python");
  assert.equal(routeMemoryCommand(["list", "all"]).engine, "python");
  assert.equal(routeMemoryCommand(["list"]).engine, "python");
});

test("routes `descriptor list` to TS but keeps `descriptor generate` (LLM) on Python", () => {
  assert.deepEqual(routeMemoryCommand(["descriptor", "list"]), {
    command: "descriptor",
    engine: "ts",
    reason: "DS7.US1 descriptor list read ported to TS",
  });
  assert.equal(routeMemoryCommand(["descriptor", "list", "--layer", "persona"]).engine, "ts");
  assert.equal(routeMemoryCommand(["descriptor", "generate"]).engine, "python");
  assert.equal(routeMemoryCommand(["descriptor"]).engine, "python");
});

test("routes `journey set-path` writes to TS but keeps other journey commands on Python", () => {
  assert.deepEqual(routeMemoryCommand(["journey", "set-path", "demo", "/x"]), {
    command: "journey",
    engine: "ts",
    reason: "DS4 journey set-path write ported to TS",
  });
  assert.equal(routeMemoryCommand(["journey", "update", "demo", "text"]).engine, "python");
  assert.equal(routeMemoryCommand(["journey", "status", "demo"]).engine, "python");
  // `journeys` (plural) is the DS2 read route, still TS.
  assert.equal(routeMemoryCommand(["journeys"]).engine, "ts");
});

test("uses Python fallback when no command is present", () => {
  assert.deepEqual(routeMemoryCommand([]), {
    command: null,
    engine: "python",
    reason: "no command",
  });
});
