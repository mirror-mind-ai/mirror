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

test("keeps fresh semantic search and unported commands on Python fallback", () => {
  assert.deepEqual(routeMemoryCommand(["memories", "--search", "builder"]), {
    command: "memories",
    engine: "python",
    reason: "fresh semantic search remains Python until CV22.DS5",
  });
  assert.equal(routeMemoryCommand(["build", "load", "mirror-ts-core"]).engine, "python");
  assert.equal(routeMemoryCommand(["identity", "set", "ego", "x"]).engine, "python");
  assert.equal(routeMemoryCommand(["journal", "hello"]).engine, "python");
});

test("uses Python fallback when no command is present", () => {
  assert.deepEqual(routeMemoryCommand([]), {
    command: null,
    engine: "python",
    reason: "no command",
  });
});
