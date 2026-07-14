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
  assert.equal(routeMemoryCommand(["journal", "hello"]).engine, "python");
});

test("routes `identity set` writes to TS but keeps edit/reads and journey writes on Python", () => {
  assert.deepEqual(routeMemoryCommand(["identity", "set", "ego", "behavior", "--content", "x"]), {
    command: "identity",
    engine: "ts",
    reason: "DS4 identity set write ported to TS",
  });
  assert.equal(routeMemoryCommand(["identity", "edit", "ego", "behavior"]).engine, "python");
  assert.equal(routeMemoryCommand(["identity", "get", "ego", "behavior"]).engine, "python");
  assert.equal(routeMemoryCommand(["identity", "list"]).engine, "python");
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
