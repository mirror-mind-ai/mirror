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

test("routes `tasks` list/default to TS", () => {
  assert.deepEqual(routeMemoryCommand(["tasks"]), {
    command: "tasks",
    engine: "ts",
    reason: "DS7.US2 tasks list read ported to TS",
  });
  assert.equal(routeMemoryCommand(["tasks", "list"]).engine, "ts");
  assert.equal(routeMemoryCommand(["tasks", "--journey", "cv22"]).engine, "ts");
});

test("routes every `tasks` write subcommand (add/done/doing/block/delete/import/sync/sync-config) to TS", () => {
  for (const sub of ["add", "done", "doing", "block", "delete", "import", "sync", "sync-config"]) {
    assert.deepEqual(routeMemoryCommand(["tasks", sub, "t-1"]), {
      command: "tasks",
      engine: "ts",
      reason: "DS7.US2 tasks write ported to TS",
    });
  }
});

test("routes `week` view/default to TS but keeps plan/save on Python (LLM-gated, reassigned to US5)", () => {
  assert.deepEqual(routeMemoryCommand(["week"]), {
    command: "week",
    engine: "ts",
    reason: "DS7.US2 week view read ported to TS",
  });
  assert.equal(routeMemoryCommand(["week", "view"]).engine, "ts");
  assert.equal(routeMemoryCommand(["week", "plan", "text"]).engine, "python");
  assert.equal(routeMemoryCommand(["week", "save"]).engine, "python");
});

test("routes `init` to TS", () => {
  assert.deepEqual(routeMemoryCommand(["init", "someuser"]), {
    command: "init",
    engine: "ts",
    reason: "DS7.US1 Slice B init (filesystem bootstrap) ported to TS",
  });
});

test("routes `seed` to TS", () => {
  assert.deepEqual(routeMemoryCommand(["seed", "--force"]), {
    command: "seed",
    engine: "ts",
    reason: "DS7.US1 Slice B seed write ported to TS",
  });
});

test("routes `recall` to TS", () => {
  assert.deepEqual(routeMemoryCommand(["recall", "abc1234"]), {
    command: "recall",
    engine: "ts",
    reason: "DS7.US1 recall read ported to TS",
  });
  assert.equal(routeMemoryCommand(["recall", "abc1234", "--limit", "5"]).engine, "ts");
});

test("routes `conversations` listing to TS but keeps metadata-lifecycle/backfill flags on Python", () => {
  assert.deepEqual(routeMemoryCommand(["conversations"]), {
    command: "conversations",
    engine: "ts",
    reason: "DS7.US1 conversations listing read ported to TS",
  });
  assert.equal(
    routeMemoryCommand(["conversations", "--journey", "demo", "--limit", "5"]).engine,
    "ts",
  );
  for (const flag of [
    "--metadata-lifecycle-dry-run",
    "--metadata-lifecycle-apply",
    "--metadata-lifecycle-demo",
    "--metadata-lifecycle-preview-at-message",
    "--metadata-backfill-preview",
    "--metadata-backfill-apply",
  ]) {
    assert.equal(routeMemoryCommand(["conversations", flag]).engine, "python");
  }
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

test("routes `journey set-path`/`update`/status reads all to TS", () => {
  assert.deepEqual(routeMemoryCommand(["journey", "set-path", "demo", "/x"]), {
    command: "journey",
    engine: "ts",
    reason: "DS4 journey set-path write ported to TS",
  });
  assert.deepEqual(routeMemoryCommand(["journey", "update", "demo", "text"]), {
    command: "journey",
    engine: "ts",
    reason: "DS7.US1 Slice B journey update write ported to TS",
  });
  assert.deepEqual(routeMemoryCommand(["journey", "status", "demo"]), {
    command: "journey",
    engine: "ts",
    reason: "DS7.US1 journey status read ported to TS",
  });
  assert.equal(routeMemoryCommand(["journey", "demo"]).engine, "ts");
  assert.equal(routeMemoryCommand(["journey"]).engine, "ts");
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
