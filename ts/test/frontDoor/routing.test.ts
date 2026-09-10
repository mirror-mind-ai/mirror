import assert from "node:assert/strict";
import { test } from "node:test";
import { routeMemoryCommand } from "#frontDoor/routing.ts";

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

test("routes `week` view/save to TS and keeps plan on Python until its replay config exists", () => {
  // An EXPLICIT empty env: these assertions must not depend on whatever
  // MIRROR_TS_* the developer running the suite happens to export.
  assert.deepEqual(routeMemoryCommand(["week"], {}), {
    command: "week",
    engine: "ts",
    reason: "DS7.US2 week view read ported to TS",
  });
  assert.equal(routeMemoryCommand(["week", "view"], {}).engine, "ts");
  // Flipped 2026-09-09: `save` is deterministic and default ON; `plan` needs
  // the replay transport, so an unconfigured install keeps Python until DS8.
  assert.equal(routeMemoryCommand(["week", "save"], {}).engine, "ts");
  assert.equal(routeMemoryCommand(["week", "plan", "text"], {}).engine, "python");
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

test("routes `conversations` listing and the two lifecycle READ faces to TS", () => {
  assert.deepEqual(routeMemoryCommand(["conversations"], {}), {
    command: "conversations",
    engine: "ts",
    reason: "DS7.US1 conversations listing read ported to TS",
  });
  assert.equal(
    routeMemoryCommand(["conversations", "--journey", "demo", "--limit", "5"], {}).engine,
    "ts",
  );
  // Flipped 2026-09-09: the two deterministic reads answer from TS.
  for (const flag of ["--metadata-lifecycle-dry-run", "--metadata-lifecycle-preview-at-message"]) {
    assert.equal(routeMemoryCommand(["conversations", flag, "x"], {}).engine, "ts", flag);
  }
  // The writes and the backfills stay on Python, each refused BY NAME with its
  // own owner (DS7.TS4 and DS10 respectively).
  for (const flag of [
    "--metadata-lifecycle-apply",
    "--metadata-lifecycle-demo",
    "--metadata-backfill-preview",
    "--metadata-backfill-apply",
  ]) {
    assert.equal(routeMemoryCommand(["conversations", flag, "x"], {}).engine, "python", flag);
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

test("routes `consolidate list`/`reject` to TS unconditionally, gates `apply`/`scan` on the DS7.US3 replay config", () => {
  assert.deepEqual(routeMemoryCommand(["consolidate", "list"]), {
    command: "consolidate",
    engine: "ts",
    reason: "DS7.US3 consolidate list/reject ported to TS",
  });
  assert.equal(routeMemoryCommand(["consolidate", "reject", "abc"]).engine, "ts");

  assert.deepEqual(routeMemoryCommand(["consolidate", "apply", "abc"]), {
    command: "consolidate",
    engine: "python",
    reason: "consolidate apply needs DS7.US3 replay/live config for TS route (merge embedding)",
  });
  assert.deepEqual(
    routeMemoryCommand(["consolidate", "apply", "abc"], {
      MIRROR_TS_EXTERNAL_ROUTES: "1",
      MIRROR_TS_CULTIVATION_EMBEDDING_REPLAY: "/tmp/embedding.json",
    }),
    {
      command: "consolidate",
      engine: "ts",
      reason:
        "DS7.US3 consolidate apply routed to TS under replay-safe config (merge needs embedding)",
    },
  );
  // The external-routes gate alone (no fixture path) is not enough.
  assert.equal(
    routeMemoryCommand(["consolidate", "apply", "abc"], { MIRROR_TS_EXTERNAL_ROUTES: "1" }).engine,
    "python",
  );

  assert.deepEqual(routeMemoryCommand(["consolidate", "scan"]), {
    command: "consolidate",
    engine: "python",
    reason: "consolidate scan needs DS7.US3 replay/live config for TS route",
  });
  assert.deepEqual(
    routeMemoryCommand(["consolidate", "scan"], {
      MIRROR_TS_EXTERNAL_ROUTES: "1",
      MIRROR_TS_CULTIVATION_LLM_REPLAY: "/tmp/llm.json",
    }),
    {
      command: "consolidate",
      engine: "ts",
      reason: "DS7.US3 consolidate scan routed to TS under replay-safe config",
    },
  );

  assert.deepEqual(routeMemoryCommand(["consolidate", "unknown-sub"]), {
    command: "consolidate",
    engine: "python",
    reason: "command not ported to TS",
  });
});

test("routes `shadow list`/`show`/`reject`/`apply` to TS unconditionally, gates `scan` on the DS7.US3 replay config", () => {
  for (const sub of ["list", "show", "reject", "apply"]) {
    assert.deepEqual(routeMemoryCommand(["shadow", sub, "abc"]), {
      command: "shadow",
      engine: "ts",
      reason: "DS7.US3 shadow list/show/reject/apply ported to TS",
    });
  }

  assert.deepEqual(routeMemoryCommand(["shadow", "scan"]), {
    command: "shadow",
    engine: "python",
    reason: "shadow scan needs DS7.US3 replay/live config for TS route",
  });
  assert.deepEqual(
    routeMemoryCommand(["shadow", "scan"], {
      MIRROR_TS_EXTERNAL_ROUTES: "1",
      MIRROR_TS_CULTIVATION_LLM_REPLAY: "/tmp/llm.json",
    }),
    {
      command: "shadow",
      engine: "ts",
      reason: "DS7.US3 shadow scan routed to TS under replay-safe config",
    },
  );

  assert.deepEqual(routeMemoryCommand(["shadow", "unknown-sub"]), {
    command: "shadow",
    engine: "python",
    reason: "command not ported to TS",
  });
});

test("routes Mirror Mode core commands to TS and gates query orchestration on replay", () => {
  for (const argv of [
    ["mirror", "load"],
    ["mirror", "deactivate"],
    ["mirror", "log", "summary"],
    ["mirror", "journeys"],
    ["mode", "activate", "Builder Mode"],
    ["mode", "deactivate"],
    ["mode", "status"],
  ]) {
    assert.equal(routeMemoryCommand(argv).engine, "ts");
  }
  assert.equal(routeMemoryCommand(["mirror", "load", "--query", "hello"]).engine, "python");
  assert.equal(
    routeMemoryCommand(["mirror", "load", "--query", "hello"], {
      MIRROR_TS_EXTERNAL_ROUTES: "1",
      MIRROR_TS_MIRROR_EMBEDDING_REPLAY: "/tmp/embedding.json",
      MIRROR_TS_MIRROR_LLM_REPLAY: "/tmp/llm.json",
    }).engine,
    "ts",
  );
  assert.equal(
    routeMemoryCommand(["mirror", "load", "--query", "hello"], {
      MIRROR_TS_EXTERNAL_ROUTES: "1",
      MIRROR_TS_MIRROR_EMBEDDING_REPLAY: "/tmp/embedding.json",
      MEMORY_RECEPTION: "0",
    }).engine,
    "ts",
  );
});

test("uses Python fallback when no command is present", () => {
  assert.deepEqual(routeMemoryCommand([]), {
    command: null,
    engine: "python",
    reason: "no command",
  });
});

// --- CV22.DS7.US5 conversation-logger (gated, not yet flipped) ---

test("conversation-logger routes its deterministic subcommands to TS by default", () => {
  for (const sub of ["mute", "status", "log-user", "user-prompt", "discard-current"]) {
    assert.equal(routeMemoryCommand(["conversation-logger", sub], {}).engine, "ts");
  }
});

test("MIRROR_TS_CONVERSATION_LOGGER=0 reverts the whole family to Python", () => {
  const env = { MIRROR_TS_CONVERSATION_LOGGER: "0" };
  for (const sub of ["mute", "status", "log-user", "user-prompt", "discard-current"]) {
    const decision = routeMemoryCommand(["conversation-logger", sub], env);
    assert.equal(decision.engine, "python", `${sub} must revert to Python`);
    assert.match(decision.reason, /disabled by MIRROR_TS_CONVERSATION_LOGGER=0/);
  }
});

test("conversation-logger routes deterministic subcommands to TS", () => {
  const env = {};
  for (const sub of [
    "mute",
    "unmute",
    "status",
    "log-user",
    "log-assistant",
    "user-prompt",
    "discard-current",
  ]) {
    assert.equal(
      routeMemoryCommand(["conversation-logger", sub], env).engine,
      "ts",
      `${sub} should route to TS under the gate`,
    );
  }
});

// --- CV22.DS7.US10 slice F: the LLM-tail flips, in the plan's dependency order ---

const CONVERSATION_REPLAY_ENV = {
  MIRROR_TS_EXTERNAL_ROUTES: "1",
  MIRROR_TS_CONVERSATION_LLM_REPLAY: "/tmp/llm.json",
  MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY: "/tmp/embedding.json",
};

test("the LLM-tail subcommands route to TS only under the replay transport", () => {
  for (const sub of [
    "switch",
    "session-end-pi",
    "session-end",
    "session-start",
    "session-maintenance",
  ]) {
    const ts = routeMemoryCommand(["conversation-logger", sub], CONVERSATION_REPLAY_ENV);
    assert.equal(ts.engine, "ts", sub);
    assert.match(ts.reason, /DS7\.US10 .* replay-safe config/);

    // Unconfigured, half-configured, and gate-less installs all keep Python:
    // the live LLM call stays Python's until DS8.
    for (const env of [
      {},
      { MIRROR_TS_CONVERSATION_LLM_REPLAY: "/tmp/llm.json" },
      { MIRROR_TS_EXTERNAL_ROUTES: "1", MIRROR_TS_CONVERSATION_LLM_REPLAY: "/tmp/llm.json" },
      {
        MIRROR_TS_CONVERSATION_LLM_REPLAY: "/tmp/llm.json",
        MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY: "/tmp/embedding.json",
      },
    ]) {
      const decision = routeMemoryCommand(["conversation-logger", sub], env);
      assert.equal(decision.engine, "python", `${sub} under ${JSON.stringify(env)}`);
      assert.match(decision.reason, /needs DS7\.US10 replay config/);
    }
  }
});

test("the family switch reverts the flipped LLM-tail subcommands too", () => {
  const env = { ...CONVERSATION_REPLAY_ENV, MIRROR_TS_CONVERSATION_LOGGER: "0" };
  for (const sub of [
    "switch",
    "session-end-pi",
    "session-end",
    "session-start",
    "session-maintenance",
  ]) {
    assert.equal(routeMemoryCommand(["conversation-logger", sub], env).engine, "python", sub);
  }
  assert.equal(
    routeMemoryCommand(["conversation-logger", "session-start", "--fast"], env).engine,
    "python",
  );
});

test("session-start --fast routes to TS without the gate; full session-start needs it", () => {
  assert.equal(
    routeMemoryCommand(["conversation-logger", "session-start", "--fast"], {}).engine,
    "ts",
  );
  assert.equal(routeMemoryCommand(["conversation-logger", "session-start"], {}).engine, "python");
  assert.equal(
    routeMemoryCommand(["conversation-logger", "session-start"], CONVERSATION_REPLAY_ENV).engine,
    "ts",
  );
});

test("the subcommand is found after --mirror-home and --session-id, as Python's main() strips them", () => {
  const decision = routeMemoryCommand(
    ["conversation-logger", "--mirror-home", "/home/x", "--session-id", "s1", "switch"],
    CONVERSATION_REPLAY_ENV,
  );
  assert.equal(decision.engine, "ts");
  assert.match(decision.reason, /switch/);
  assert.equal(
    routeMemoryCommand(["conversation-logger", "--mirror-home", "/home/x", "status"], {}).engine,
    "ts",
  );
});

test("diagnose-journeys, dry-run repair-journeys, and backfill-codex-session route to TS without any gate", () => {
  for (const argv of [
    ["diagnose-journeys"],
    ["diagnose-journeys", "--limit", "5"],
    ["repair-journeys"],
    ["repair-journeys", "--limit", "5"],
    ["backfill-codex-session", "/tmp/session.jsonl", "--interface", "codex-cli"],
  ]) {
    const decision = routeMemoryCommand(["conversation-logger", ...argv], {});
    assert.equal(decision.engine, "ts", argv.join(" "));
  }
  assert.equal(
    routeMemoryCommand(["conversation-logger", "diagnose-journeys"], {
      MIRROR_TS_CONVERSATION_LOGGER: "0",
    }).engine,
    "python",
  );
});

// CV22.DS7.TS1: the DB safety tools, flipped 2026-09-07. Their gates default
// ON; `=0` is the per-command revert control, and the backup gate carries
// `repair-journeys --apply` with it.
const APPLY_ARGVS = [
  ["repair-journeys", "--apply"],
  ["repair-journeys", "--limit", "2", "--apply"],
  ["--mirror-home", "/home/x", "repair-journeys", "--apply"],
];

test("repair-journeys --apply routes to TS by default and follows MIRROR_TS_BACKUP=0 back to Python", () => {
  for (const argv of APPLY_ARGVS) {
    const byDefault = routeMemoryCommand(["conversation-logger", ...argv], {});
    assert.equal(byDefault.engine, "ts", argv.join(" "));
    assert.match(byDefault.reason, /DS7\.TS1/);
    assert.equal(
      routeMemoryCommand(["conversation-logger", ...argv], { MIRROR_TS_BACKUP: "1" }).engine,
      "ts",
    );
    const off = routeMemoryCommand(["conversation-logger", ...argv], { MIRROR_TS_BACKUP: "0" });
    assert.equal(off.engine, "python", argv.join(" "));
    assert.match(off.reason, /MIRROR_TS_BACKUP=0/);
  }
  // The family switch still wins: it is the whole-family escape hatch.
  assert.equal(
    routeMemoryCommand(["conversation-logger", "repair-journeys", "--apply"], {
      MIRROR_TS_CONVERSATION_LOGGER: "0",
    }).engine,
    "python",
  );
});

test("backup routes to TS by default; MIRROR_TS_BACKUP=0 is the revert control", () => {
  for (const argv of [
    ["backup"],
    ["backup", "--silent"],
    ["backup", "--mirror-home", "/home/x", "--backup-dir", "/x"],
  ]) {
    assert.deepEqual(routeMemoryCommand(argv, {}), {
      command: "backup",
      engine: "ts",
      reason: "DS7.TS1 backup ported to TS",
    });
    assert.equal(routeMemoryCommand(argv, { MIRROR_TS_BACKUP: "1" }).engine, "ts");
    const off = routeMemoryCommand(argv, { MIRROR_TS_BACKUP: "0" });
    assert.equal(off.engine, "python", argv.join(" "));
    assert.match(off.reason, /MIRROR_TS_BACKUP=0/);
  }
});

test("repair-encoding routes to TS by default; MIRROR_TS_REPAIR_ENCODING=0 is the revert control", () => {
  for (const argv of [
    ["repair-encoding"],
    ["repair-encoding", "--apply"],
    ["repair-encoding", "--mirror-home", "/home/x", "--apply", "--no-backup", "--limit", "3"],
  ]) {
    assert.deepEqual(routeMemoryCommand(argv, {}), {
      command: "repair-encoding",
      engine: "ts",
      reason: "DS7.TS1 repair-encoding ported to TS",
    });
    const off = routeMemoryCommand(argv, { MIRROR_TS_REPAIR_ENCODING: "0" });
    assert.equal(off.engine, "python", argv.join(" "));
    assert.match(off.reason, /MIRROR_TS_REPAIR_ENCODING=0/);
  }
  // The gates are independent: reverting one must not drag the other.
  assert.equal(routeMemoryCommand(["repair-encoding"], { MIRROR_TS_BACKUP: "0" }).engine, "ts");
  assert.equal(routeMemoryCommand(["backup"], { MIRROR_TS_REPAIR_ENCODING: "0" }).engine, "ts");
});

test("an unknown conversation-logger subcommand stays on Python", () => {
  const decision = routeMemoryCommand(
    ["conversation-logger", "extract-pending"],
    CONVERSATION_REPLAY_ENV,
  );
  assert.equal(decision.engine, "python");
});

// --- conversations append must not inherit DS7.US1's listing route ---

test("conversations append routes on its own entry, never by inheritance", () => {
  // Regression: v0.31.13 added `append` under a command DS7.US1 had already
  // claimed, so the request routed to TS, printed a listing, exited 0, and
  // dropped the caller's messages. `append` now serves from TS (DS7.US10), but
  // the guard that matters is unchanged -- it must resolve through its OWN
  // entry, so it can never again be answered by the listing handler.
  const decision = routeMemoryCommand(["conversations", "append", "--format", "json"], {});
  assert.equal(decision.engine, "ts");
  assert.match(decision.reason, /append boundary ported to TS/);
  assert.notEqual(decision.reason, routeMemoryCommand(["conversations"], {}).reason);
});

test("MIRROR_TS_CONVERSATION_APPEND=0 reverts append to Python", () => {
  // The published external-shell write contract keeps an operational escape
  // hatch: no code change, no data migration, no release.
  const decision = routeMemoryCommand(["conversations", "append", "--format", "json"], {
    MIRROR_TS_CONVERSATION_APPEND: "0",
  });
  assert.equal(decision.engine, "python");
  assert.match(decision.reason, /MIRROR_TS_CONVERSATION_APPEND=0/);
  // The gate is scoped: it must not drag the listing back with it.
  assert.equal(
    routeMemoryCommand(["conversations"], { MIRROR_TS_CONVERSATION_APPEND: "0" }).engine,
    "ts",
  );
});

test("conversations listing still routes to TS", () => {
  assert.equal(routeMemoryCommand(["conversations"], {}).engine, "ts");
  assert.equal(routeMemoryCommand(["conversations", "--limit", "5"], {}).engine, "ts");
});

// --- CV22.DS7.TS3: the daily-visible tail ---------------------------------

test("welcome routes to TS by default; MIRROR_TS_WELCOME=0 is the revert control", () => {
  for (const argv of [
    ["welcome"],
    ["welcome", "--status-line", "--session-id", "s1"],
    ["welcome", "--mirror-home", "/home/x"],
  ]) {
    assert.deepEqual(routeMemoryCommand(argv, {}), {
      command: "welcome",
      engine: "ts",
      reason: "DS7.TS3 welcome ported to TS",
    });
    assert.equal(routeMemoryCommand(argv, { MIRROR_TS_WELCOME: "1" }).engine, "ts");
    const off = routeMemoryCommand(argv, { MIRROR_TS_WELCOME: "0" });
    assert.equal(off.engine, "python", argv.join(" "));
    assert.match(off.reason, /MIRROR_TS_WELCOME=0/);
  }
});

test("the four runtime reads route to TS by default and revert independently", () => {
  for (const sub of ["status", "version", "diagnose", "release-notes"]) {
    const on = routeMemoryCommand(["runtime", sub], {});
    assert.equal(on.engine, "ts", sub);
    assert.equal(on.reason, `DS7.TS3 runtime ${sub} ported to TS`);
    const off = routeMemoryCommand(["runtime", sub], { MIRROR_TS_RUNTIME_READS: "0" });
    assert.equal(off.engine, "python", sub);
    assert.match(off.reason, /MIRROR_TS_RUNTIME_READS=0/);
  }
});

test("the two tail gates revert independently of each other", () => {
  // They fail differently -- a bad `welcome` is wrong on every turn, a bad
  // `runtime diagnose` only when asked -- so reverting one must not drag the
  // other back to Python with it.
  const welcomeOff = { MIRROR_TS_WELCOME: "0" };
  assert.equal(routeMemoryCommand(["welcome"], welcomeOff).engine, "python");
  assert.equal(routeMemoryCommand(["runtime", "status"], welcomeOff).engine, "ts");

  const readsOff = { MIRROR_TS_RUNTIME_READS: "0" };
  assert.equal(routeMemoryCommand(["runtime", "status"], readsOff).engine, "python");
  assert.equal(routeMemoryCommand(["welcome"], readsOff).engine, "ts");
});

test("release-notes ARGUMENTS are not subcommands", () => {
  // The 2026-09-07 decision text and the burn-down ledger's table listed
  // `latest` and `pending` as subcommands. They are positionals of
  // `release-notes`, and this story corrects that -- so they must ride the
  // release-notes route, not be refused as unknown subcommands.
  for (const argv of [
    ["runtime", "release-notes", "latest"],
    ["runtime", "release-notes", "pending"],
    ["runtime", "release-notes", "v0.31.0"],
    ["runtime", "release-notes", "pending", "--no-fetch"],
  ]) {
    const decision = routeMemoryCommand(argv, {});
    assert.equal(decision.engine, "ts", argv.join(" "));
    assert.equal(decision.reason, "DS7.TS3 runtime release-notes ported to TS");
  }
});

test("the DS10 updater and release machinery are refused by name, even with the gate on", () => {
  for (const sub of ["update", "pull", "stable", "backup", "release-doctor", "release-promote"]) {
    const decision = routeMemoryCommand(["runtime", sub], { MIRROR_TS_BACKUP: "1" });
    assert.equal(decision.engine, "python", sub);
    assert.match(decision.reason, /DS10/, sub);
  }
  // `runtime backup` must not inherit the top-level `backup` command's route.
  assert.equal(routeMemoryCommand(["backup"], { MIRROR_TS_BACKUP: "1" }).engine, "ts");
  assert.equal(
    routeMemoryCommand(["runtime", "backup"], { MIRROR_TS_BACKUP: "1" }).engine,
    "python",
  );
});

test("an unknown runtime subcommand is refused, not inherited", () => {
  // The allowlist's whole purpose: a subcommand Python grows later must not
  // acquire a TS route because `runtime` already has one.
  for (const sub of ["", "doctor", "publish", "--help"]) {
    const argv = sub ? ["runtime", sub] : ["runtime"];
    const decision = routeMemoryCommand(argv, {});
    assert.equal(decision.engine, "python", sub);
    assert.match(decision.reason, /not ported to TS/, sub);
  }
});

// --- CV22.DS7.US11 plateau 1: `week save` -----------------------------------
//
// CR068 found this family's refusal reason claiming BOTH `plan` and `save`
// were "LLM-gated". `save` crosses no provider seam, so it carries an ordinary
// gate and flips ungated at the plateau-6 flip. `view` was flipped UNGATED in
// US2 and must NOT join the gate: reverting a bad `save` cannot be allowed to
// drag a previously-unrevertible read back to Python.

test("week save answers from TS by default, and never drags `view` with its gate", () => {
  // Flipped 2026-09-09: default ON, `=0` is the revert control.
  assert.equal(routeMemoryCommand(["week", "save"], {}).engine, "ts");
  assert.equal(routeMemoryCommand(["week", "save"], { MIRROR_TS_WEEK: "1" }).engine, "ts");
  assert.equal(routeMemoryCommand(["week", "save"], { MIRROR_TS_WEEK: "0" }).engine, "python");

  // `view` ignores the gate in both directions.
  assert.equal(routeMemoryCommand(["week", "view"], { MIRROR_TS_WEEK: "0" }).engine, "ts");
  assert.equal(routeMemoryCommand(["week"], { MIRROR_TS_WEEK: "0" }).engine, "ts");
});

test("week plan stays on Python, and its refusal reason no longer mislabels `save`", () => {
  // Plateau 4 gave `plan` its own replay requirement, so the reason now names
  // the replay config rather than the model. What must stay true is that the
  // reason is about `plan` alone and never mislabels `save`.
  const plan = routeMemoryCommand(["week", "plan", "some text"], { MIRROR_TS_WEEK: "1" });
  assert.equal(plan.engine, "python");
  assert.match(plan.reason, /week plan/);
  assert.doesNotMatch(plan.reason, /save/);

  const save = routeMemoryCommand(["week", "save"], {});
  assert.doesNotMatch(save.reason, /LLM-gated/, "save is deterministic; CR068 corrected this");
  assert.doesNotMatch(save.reason, /=0/, "the gate is default-off, so '=0' would be untrue");
});

test("an unknown week subcommand is refused by name, never inherited", () => {
  const unknown = routeMemoryCommand(["week", "bogus"], { MIRROR_TS_WEEK: "1" });
  assert.equal(unknown.engine, "python");
  assert.match(unknown.reason, /bogus/);
});

// --- CV22.DS7.US11 plateau 3: `journal` ------------------------------------
//
// journal crosses the seam TWICE (classification + embedding), so it needs the
// replay transport as well as its family gate. CR068 found it reported as
// burned down while no TS module existed at all.

test("journal reaches TS only with both the family gate and the replay config", () => {
  const replay = {
    MIRROR_TS_EXTERNAL_ROUTES: "1",
    MIRROR_TS_JOURNAL_LLM_REPLAY: "fixture.json",
    MIRROR_TS_JOURNAL_EMBEDDING_REPLAY: "fixture.json",
  };
  // The family gate is ON by default since the flip, but the replay config is
  // absent on a real install -- so journal still answers from Python in
  // production until DS8. That is the DS7/DS8 boundary, not an oversight.
  assert.equal(routeMemoryCommand(["journal", "x"], {}).engine, "python");
  assert.equal(routeMemoryCommand(["journal", "x"], { MIRROR_TS_JOURNAL: "1" }).engine, "python");
  assert.equal(routeMemoryCommand(["journal", "x"], replay).engine, "ts");
  assert.equal(
    routeMemoryCommand(["journal", "x"], { MIRROR_TS_JOURNAL: "1", ...replay }).engine,
    "ts",
  );
});

test("MIRROR_TS_JOURNAL=0 wins over a configured replay transport", () => {
  const decision = routeMemoryCommand(["journal", "x"], {
    MIRROR_TS_JOURNAL: "0",
    MIRROR_TS_EXTERNAL_ROUTES: "1",
    MIRROR_TS_JOURNAL_LLM_REPLAY: "fixture.json",
    MIRROR_TS_JOURNAL_EMBEDDING_REPLAY: "fixture.json",
  });
  assert.equal(decision.engine, "python");
  assert.match(decision.reason, /disabled by MIRROR_TS_JOURNAL=0/);
});

test("an unconfigured journal route names the replay config, not a false '=0'", () => {
  // After the flip the family gate is ON, so the honest reason for falling
  // back is the missing replay transport. A reason must describe the state
  // that exists (the plateau-1 lesson).
  const reason = routeMemoryCommand(["journal", "x"], {}).reason;
  assert.match(reason, /replay config/);
  assert.doesNotMatch(reason, /=0/);
});

test("the three week leaves carry three different requirements", () => {
  const replay = { MIRROR_TS_EXTERNAL_ROUTES: "1", MIRROR_TS_WEEK_LLM_REPLAY: "fixture.json" };
  // `view`: ungated since US2.
  assert.equal(routeMemoryCommand(["week", "view"], {}).engine, "ts");
  // `save`: deterministic — the family gate alone is enough.
  assert.equal(routeMemoryCommand(["week", "save"], { MIRROR_TS_WEEK: "1" }).engine, "ts");
  // `plan`: one model call — gate AND replay.
  assert.equal(routeMemoryCommand(["week", "plan", "x"], { MIRROR_TS_WEEK: "1" }).engine, "python");
  assert.equal(
    routeMemoryCommand(["week", "plan", "x"], { MIRROR_TS_WEEK: "1", ...replay }).engine,
    "ts",
  );
});

// --- CV22.DS7.US11 plateau 5b: the ES-001 lifecycle flags -------------------
//
// CR068 found the family unowned. US11 splits it by what each flag needs:
// two pure reads port here, the two writes need the unported
// apply_metadata_lifecycle and go to TS4, the two backfills retire in DS10.
// Each is refused BY NAME so none can inherit another's route (CR055).

test("lifecycle READ flags route to TS under their own gate", () => {
  const gate = { MIRROR_TS_CONVERSATIONS_LIFECYCLE: "1" };
  for (const flag of ["--metadata-lifecycle-dry-run", "--metadata-lifecycle-preview-at-message"]) {
    // Flipped 2026-09-09: deterministic reads, so default ON with no replay.
    assert.equal(routeMemoryCommand(["conversations", flag, "x"], {}).engine, "ts");
    assert.equal(routeMemoryCommand(["conversations", flag, "x"], gate).engine, "ts");
    assert.equal(
      routeMemoryCommand(["conversations", flag, "x"], {
        MIRROR_TS_CONVERSATIONS_LIFECYCLE: "0",
      }).engine,
      "python",
    );
  }
});

test("lifecycle WRITE flags are refused by name and name DS7.TS4 as their owner", () => {
  const gate = { MIRROR_TS_CONVERSATIONS_LIFECYCLE: "1" };
  for (const flag of ["--metadata-lifecycle-apply", "--metadata-lifecycle-demo"]) {
    const decision = routeMemoryCommand(["conversations", flag, "x"], gate);
    assert.equal(decision.engine, "python", `${flag} must not inherit the read route`);
    assert.match(decision.reason, /DS7\.TS4/);
    assert.match(decision.reason, new RegExp(flag.replace(/-/g, "\\-")));
  }
});

test("backfill flags are refused by name and name DS10", () => {
  const gate = { MIRROR_TS_CONVERSATIONS_LIFECYCLE: "1" };
  for (const flag of ["--metadata-backfill-preview", "--metadata-backfill-apply"]) {
    const decision = routeMemoryCommand(["conversations", flag, "x"], gate);
    assert.equal(decision.engine, "python");
    assert.match(decision.reason, /DS10/);
  }
});

test("the plain conversations listing is unaffected by the lifecycle split", () => {
  assert.equal(routeMemoryCommand(["conversations"], {}).engine, "ts");
  assert.equal(
    routeMemoryCommand(["conversations"], { MIRROR_TS_CONVERSATIONS_LIFECYCLE: "1" }).engine,
    "ts",
  );
});
