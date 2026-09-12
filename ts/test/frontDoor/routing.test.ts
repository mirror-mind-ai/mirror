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

test("both consult leaves are live by default, each with its own fixture requirement", () => {
  // CV22.DS8.US3: the DS5 external-routes gate is retired. `credits` needs only
  // the credits fixture to replay; `ask` needs the chat fixture too, and with
  // the credits one alone it REFUSES rather than going live for the half
  // nobody configured (CR077's asymmetric family).
  assert.equal(routeMemoryCommand(["consult", "credits"]).engine, "ts");
  assert.equal(routeMemoryCommand(["consult", "openai", "question"]).engine, "ts");

  assert.equal(
    routeMemoryCommand(["consult", "credits"], { MIRROR_TS_CREDITS_REPLAY: "/tmp/c.json" }).engine,
    "ts",
  );
  const halfConfiguredAsk = routeMemoryCommand(["consult", "openai", "question"], {
    MIRROR_TS_CREDITS_REPLAY: "/tmp/c.json",
  });
  assert.equal(halfConfiguredAsk.engine, "python");
  assert.match(halfConfiguredAsk.reason, /incomplete replay fixture/);
  assert.match(halfConfiguredAsk.reason, /MIRROR_TS_CONSULT_LLM_REPLAY missing/);

  assert.equal(
    routeMemoryCommand(["consult", "openai", "question"], {
      MIRROR_TS_CONSULT_LLM_REPLAY: "/tmp/llm.json",
      MIRROR_TS_CREDITS_REPLAY: "/tmp/c.json",
    }).engine,
    "ts",
  );

  // One variable reverts the whole family.
  for (const argv of [
    ["consult", "credits"],
    ["consult", "openai", "q"],
  ]) {
    assert.equal(routeMemoryCommand(argv, { MIRROR_TS_CONSULT: "0" }).engine, "python");
  }
});

test("keeps unported commands on Python fallback", () => {
  assert.equal(routeMemoryCommand(["build", "load", "mirror-ts-core"]).engine, "python");
  assert.equal(routeMemoryCommand(["conversation-logger", "extract-pending"]).engine, "python");
  // `journal` left this list in CV22.DS8.US3; it is live by default now.
  assert.equal(routeMemoryCommand(["journal", "hello"]).engine, "ts");
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

test("all week leaves answer from TS; the revert covers save and plan, never view", () => {
  for (const argv of [["week"], ["week", "view"], ["week", "save"], ["week", "plan", "text"]]) {
    assert.equal(routeMemoryCommand(argv).engine, "ts", `${argv.join(" ")} is live by default`);
  }
  for (const argv of [
    ["week", "save"],
    ["week", "plan", "text"],
  ]) {
    assert.equal(routeMemoryCommand(argv, { MIRROR_TS_WEEK: "0" }).engine, "python");
  }
  // `view` deliberately sits OUTSIDE its family gate: it was flipped ungated in
  // US2, and reverting a bad `plan` or `save` must not drag a previously
  // unrevertible read back to Python (US11 Plan review, quality-assurance).
  // US3 does not change that -- `view` crosses no provider seam.
  assert.equal(routeMemoryCommand(["week", "view"], { MIRROR_TS_WEEK: "0" }).engine, "ts");
  assert.equal(
    routeMemoryCommand(["week", "plan", "t"], { MIRROR_TS_WEEK_LLM_REPLAY: "/tmp/w.json" }).engine,
    "ts",
    "a fixture still selects replay",
  );
  assert.equal(routeMemoryCommand(["week", "unknown"]).engine, "python");
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

test("descriptor list and generate both answer from TS, with generate revertible", () => {
  assert.equal(routeMemoryCommand(["descriptor", "list"]).engine, "ts");
  assert.equal(routeMemoryCommand(["descriptor", "generate"]).engine, "ts");
  assert.equal(
    routeMemoryCommand(["descriptor", "generate"], { MIRROR_TS_DESCRIPTOR: "0" }).engine,
    "python",
  );
  assert.equal(routeMemoryCommand(["descriptor", "unknown"]).engine, "python");
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

test("consolidate apply is live, scan waits for DS8.TS2, and one variable reverts the tail", () => {
  for (const sub of ["list", "reject"]) {
    assert.equal(routeMemoryCommand(["consolidate", sub, "abc"]).engine, "ts");
  }

  // `apply` sends NO prompt -- a merge only embeds -- so it is not blocked by
  // TS2 and goes live with group B.
  assert.equal(routeMemoryCommand(["consolidate", "apply", "abc"]).engine, "ts");

  // `scan` sends a prompt TypeScript never ported, so live is blocked by name
  // rather than silently allowed.
  const scan = routeMemoryCommand(["consolidate", "scan"]);
  assert.equal(scan.engine, "python");
  assert.match(scan.reason, /live blocked by DS8\.TS2/);
  // ...but replay still reaches TS, which is what the goldens and the parity
  // harness use.
  assert.equal(
    routeMemoryCommand(["consolidate", "scan"], {
      MIRROR_TS_CULTIVATION_LLM_REPLAY: "/tmp/llm.json",
    }).engine,
    "ts",
  );

  // Tail-only revert: the deterministic leaves stay on TypeScript.
  assert.equal(
    routeMemoryCommand(["consolidate", "apply", "abc"], { MIRROR_TS_CULTIVATION: "0" }).engine,
    "python",
  );
  assert.equal(
    routeMemoryCommand(["consolidate", "list"], { MIRROR_TS_CULTIVATION: "0" }).engine,
    "ts",
  );

  assert.deepEqual(routeMemoryCommand(["consolidate", "unknown-sub"]), {
    command: "consolidate",
    engine: "python",
    reason: "command not ported to TS",
  });
});

test("shadow reads stay on TS, and `shadow scan` waits for DS8.TS2 with the others", () => {
  for (const sub of ["list", "show", "reject", "apply"]) {
    assert.deepEqual(routeMemoryCommand(["shadow", sub, "abc"]), {
      command: "shadow",
      engine: "ts",
      reason: "DS7.US3 shadow list/show/reject/apply ported to TS",
    });
  }

  const scan = routeMemoryCommand(["shadow", "scan"]);
  assert.equal(scan.engine, "python");
  assert.match(scan.reason, /live blocked by DS8\.TS2/);
  assert.equal(
    routeMemoryCommand(["shadow", "scan"], { MIRROR_TS_CULTIVATION_LLM_REPLAY: "/tmp/llm.json" })
      .engine,
    "ts",
  );

  assert.deepEqual(routeMemoryCommand(["shadow", "unknown-sub"]), {
    command: "shadow",
    engine: "python",
    reason: "command not ported to TS",
  });
});

test("mirror load --query is live, revertible on its own, and MEMORY_RECEPTION=0 drops the chat half", () => {
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

  assert.equal(routeMemoryCommand(["mirror", "load", "--query", "hello"]).engine, "ts");

  // Its own revert: the deterministic `mirror load` is the most-used read in
  // the product and must not be dragged back by a query-path scare.
  assert.equal(
    routeMemoryCommand(["mirror", "load", "--query", "hello"], { MIRROR_TS_MIRROR_QUERY: "0" })
      .engine,
    "python",
  );
  assert.equal(
    routeMemoryCommand(["mirror", "load"], { MIRROR_TS_MIRROR_QUERY: "0" }).engine,
    "ts",
  );

  // Replay needs both fixtures...
  assert.equal(
    routeMemoryCommand(["mirror", "load", "--query", "hello"], {
      MIRROR_TS_MIRROR_EMBEDDING_REPLAY: "/tmp/embedding.json",
      MIRROR_TS_MIRROR_LLM_REPLAY: "/tmp/llm.json",
    }).engine,
    "ts",
  );
  const halfConfigured = routeMemoryCommand(["mirror", "load", "--query", "hello"], {
    MIRROR_TS_MIRROR_EMBEDDING_REPLAY: "/tmp/embedding.json",
  });
  assert.equal(halfConfigured.engine, "python");
  assert.match(halfConfigured.reason, /incomplete replay fixture/);

  // ...unless MEMORY_RECEPTION=0 removes the classifier on both engines, in
  // which case the embedding fixture alone is a COMPLETE replay setup.
  assert.equal(
    routeMemoryCommand(["mirror", "load", "--query", "hello"], {
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
  MIRROR_TS_CONVERSATION_LLM_REPLAY: "/tmp/llm.json",
  MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY: "/tmp/embedding.json",
};

test("the LLM-tail subcommands no longer require the replay transport (CV22.DS8.US2)", () => {
  // This test previously asserted the DS7.US10 contract: replay or Python,
  // never live. US2 is the story that changes it, so the contract it encodes
  // has to change with it -- staged, group 1 first.
  for (const sub of ["switch", "session-end-pi", "session-end"]) {
    const replayed = routeMemoryCommand(["conversation-logger", sub], CONVERSATION_REPLAY_ENV);
    assert.equal(replayed.engine, "ts", sub);
    assert.match(replayed.reason, /replay/, sub);

    // Unconfigured now means LIVE for group 1 -- the cutover itself.
    const live = routeMemoryCommand(["conversation-logger", sub], {});
    assert.equal(live.engine, "ts", sub);
    assert.match(live.reason, /DS8\.US2 conversation close tail live/, sub);
  }

  // Group 2 followed on the same day, after group 1 was observed live.
  for (const sub of ["session-start", "session-maintenance"]) {
    assert.equal(routeMemoryCommand(["conversation-logger", sub], {}).engine, "ts", sub);
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

test("session-start --fast stays ungated even when the close tail is reverted", () => {
  // `--fast` makes no model call at all, so it is not part of the close-tail
  // family's risk and must not follow its revert. The full run does: it was
  // gated on the replay transport under DS7.US10 and is live under DS8.US2.
  const reverted = { MIRROR_TS_CONVERSATION_LLM_TAIL: "0" };
  assert.equal(
    routeMemoryCommand(["conversation-logger", "session-start", "--fast"], {}).engine,
    "ts",
  );
  assert.equal(
    routeMemoryCommand(["conversation-logger", "session-start", "--fast"], reverted).engine,
    "ts",
    "a close-tail revert must not drag back a subcommand that never calls a model",
  );
  assert.equal(routeMemoryCommand(["conversation-logger", "session-start"], {}).engine, "ts");
  assert.equal(
    routeMemoryCommand(["conversation-logger", "session-start"], reverted).engine,
    "python",
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

test("no week reason mislabels `save` as LLM-gated (CR068 stays corrected)", () => {
  // DS8.US3 flipped `plan` live, so the old assertion (plan routes to Python)
  // is gone. What CR068 established must survive the flip: a reason is about
  // the leaf it describes, and `save` is never called LLM-gated -- it reads the
  // pending file and calls add_task, crossing no provider seam.
  const plan = routeMemoryCommand(["week", "plan", "some text"], {});
  assert.equal(plan.engine, "ts");
  assert.doesNotMatch(plan.reason, /save/);

  const save = routeMemoryCommand(["week", "save"], {});
  assert.equal(save.engine, "ts");
  assert.doesNotMatch(save.reason, /LLM-gated/, "save is deterministic; CR068 corrected this");

  const reverted = routeMemoryCommand(["week", "save"], { MIRROR_TS_WEEK: "0" });
  assert.match(reverted.reason, /MIRROR_TS_WEEK=0/, "a reason must describe the state that exists");
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

test("journal is live by default and refuses a half-configured replay pair", () => {
  // CV22.DS8.US3: journal crosses the seam TWICE (classification + embedding),
  // so its family declares two fixtures. Live needs neither; replay needs both.
  assert.equal(routeMemoryCommand(["journal", "x"], {}).engine, "ts");
  assert.equal(
    routeMemoryCommand(["journal", "x"], {
      MIRROR_TS_JOURNAL_LLM_REPLAY: "fixture.json",
      MIRROR_TS_JOURNAL_EMBEDDING_REPLAY: "fixture.json",
    }).engine,
    "ts",
  );
  const half = routeMemoryCommand(["journal", "x"], {
    MIRROR_TS_JOURNAL_LLM_REPLAY: "fixture.json",
  });
  assert.equal(half.engine, "python", "half a fixture must never become a live call");
  assert.match(half.reason, /MIRROR_TS_JOURNAL_EMBEDDING_REPLAY missing/);
});

test("MIRROR_TS_JOURNAL=0 wins over a configured replay transport", () => {
  const decision = routeMemoryCommand(["journal", "x"], {
    MIRROR_TS_JOURNAL: "0",
    MIRROR_TS_JOURNAL_LLM_REPLAY: "fixture.json",
    MIRROR_TS_JOURNAL_EMBEDDING_REPLAY: "fixture.json",
  });
  assert.equal(decision.engine, "python");
  assert.match(decision.reason, /MIRROR_TS_JOURNAL=0 revert/);
});

test("the journal route's reason describes the state that exists", () => {
  // The plateau-1 lesson: a reason must describe reality. An unconfigured
  // install is now LIVE, so the reason says live -- not "needs replay config",
  // which was true before the cutover and false after it.
  const reason = routeMemoryCommand(["journal", "x"], {}).reason;
  assert.match(reason, /DS8\.US3 journal live/);
  assert.doesNotMatch(reason, /=0/);
  assert.doesNotMatch(reason, /replay config/);
});

test("the week leaves' requirements collapse to one live default", () => {
  // Before DS8 they carried three different requirements. After the cutover
  // `view` and `save` make no provider call, `plan` makes one, and all three
  // answer from TypeScript -- with `save` and `plan` revertible together and
  // `view` deliberately outside the gate.
  for (const argv of [
    ["week", "view"],
    ["week", "save"],
    ["week", "plan", "x"],
  ]) {
    assert.equal(routeMemoryCommand(argv, {}).engine, "ts");
  }
  assert.equal(
    routeMemoryCommand(["week", "plan", "x"], { MIRROR_TS_WEEK_LLM_REPLAY: "fixture.json" }).engine,
    "ts",
    "only `plan` has a fixture to replay",
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

// --- CV22.DS8.US1: the fresh-semantic-search live cutover -------------------

test("memories --search reaches the live provider with nothing configured", () => {
  // The cutover itself: before this story an unconfigured install answered
  // this leaf from Python, which is what kept the Python core alive for the
  // highest-volume role in the ledger.
  const decision = routeMemoryCommand(["memories", "--search", "builder"], {});

  assert.equal(decision.engine, "ts");
  assert.equal(decision.reason, "DS8.US1 fresh semantic search live");
});

test("MIRROR_TS_SEARCH=0 reverts the search leaf to Python with no code change", () => {
  const decision = routeMemoryCommand(["memories", "--search", "builder"], {
    MIRROR_TS_SEARCH: "0",
  });

  assert.equal(decision.engine, "python");
  assert.match(decision.reason, /revert/i);
});

test("the revert wins over a replay fixture left in the same shell", () => {
  const decision = routeMemoryCommand(["memories", "--search", "builder"], {
    MIRROR_TS_SEARCH: "0",
    MIRROR_TS_SEARCH_EMBEDDING_REPLAY: "/tmp/embedding.json",
  });

  assert.equal(decision.engine, "python");
});

test("a replay fixture no longer needs MIRROR_TS_EXTERNAL_ROUTES for search", () => {
  // That gate was DS5's safety catch while replay was this leaf's PRODUCTION
  // transport. After the cutover replay is a test transport, so requiring the
  // gate would only make CI and the parity harness depend on it.
  const decision = routeMemoryCommand(["memories", "--search", "builder"], {
    MIRROR_TS_SEARCH_EMBEDDING_REPLAY: "/tmp/embedding.json",
  });

  assert.equal(decision.engine, "ts");
  assert.match(decision.reason, /replay/);
});

test("plain memory listing is unaffected by the search transport gates", () => {
  const decision = routeMemoryCommand(["memories", "--limit", "5"], { MIRROR_TS_SEARCH: "0" });

  assert.equal(decision.engine, "ts");
  assert.equal(decision.reason, "DS2 memory listing read ported to TS");
});

// --- CV22.DS8.US2: the close-tail cutover, group 1 -------------------------

const GROUP_1 = ["switch", "session-end-pi", "session-end"];
const GROUP_2 = ["session-start", "session-maintenance"];

test("group 1 close-tail subcommands reach the live provider with nothing configured", () => {
  // The hook path first: `session-end` is what fires unattended when a Pi
  // session closes, so it is the one validated on a copy before the real home.
  for (const sub of GROUP_1) {
    const decision = routeMemoryCommand(["conversation-logger", sub], {});
    assert.equal(decision.engine, "ts", sub);
    assert.equal(decision.reason, `DS8.US2 conversation close tail live (${sub})`, sub);
  }
});

test("group 2 is live once group 1 has been observed on the real home", () => {
  // The staging existed to put the unattended hook path in front of the
  // multi-conversation path, not to keep them apart permanently. Group 1 ran
  // a full live close tail on the real home on 2026-09-11 (extraction ok, six
  // memories at full dimension, every row priced), so both groups now share
  // one decision.
  for (const sub of GROUP_2) {
    const decision = routeMemoryCommand(["conversation-logger", sub], {});
    assert.equal(decision.engine, "ts", sub);
    assert.match(decision.reason, /DS8\.US2 conversation close tail live/, sub);
  }
});

test("MIRROR_TS_CONVERSATION_LLM_TAIL=0 reverts the tail without touching the rest", () => {
  const reverted = { MIRROR_TS_CONVERSATION_LLM_TAIL: "0" };
  for (const sub of GROUP_1) {
    assert.equal(routeMemoryCommand(["conversation-logger", sub], reverted).engine, "python", sub);
  }
  // The seven deterministic subcommands have answered from TS since
  // 2026-09-02; a live-provider scare must not drag them back.
  for (const sub of ["status", "log-user", "log-assistant", "mute", "discard-current"]) {
    assert.equal(routeMemoryCommand(["conversation-logger", sub], reverted).engine, "ts", sub);
  }
});

test("MIRROR_TS_CONVERSATION_LOGGER=0 still reverts the whole family", () => {
  const off = { MIRROR_TS_CONVERSATION_LOGGER: "0" };
  for (const sub of [...GROUP_1, ...GROUP_2, "status", "log-user"]) {
    assert.equal(routeMemoryCommand(["conversation-logger", sub], off).engine, "python", sub);
  }
});

test("a replay fixture keeps group 1 on TS without MIRROR_TS_EXTERNAL_ROUTES", () => {
  const replay = {
    MIRROR_TS_CONVERSATION_LLM_REPLAY: "/replay/llm.json",
    MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY: "/replay/embedding.json",
  };
  for (const sub of GROUP_1) {
    const decision = routeMemoryCommand(["conversation-logger", sub], replay);
    assert.equal(decision.engine, "ts", sub);
    assert.match(decision.reason, /replay/, sub);
  }
});

test("the revert wins over replay fixtures left in the same shell", () => {
  const decision = routeMemoryCommand(["conversation-logger", "session-end"], {
    MIRROR_TS_CONVERSATION_LLM_TAIL: "0",
    MIRROR_TS_CONVERSATION_LLM_REPLAY: "/replay/llm.json",
    MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY: "/replay/embedding.json",
  });

  assert.equal(decision.engine, "python");
});

test("the subcommand is read after option stripping, as Python's main() does", () => {
  const decision = routeMemoryCommand(
    ["conversation-logger", "--mirror-home", "/tmp/home", "--session-id", "s1", "session-end"],
    {},
  );

  assert.equal(decision.engine, "ts");
  assert.match(decision.reason, /session-end/);
});

// --- CV22.DS8.US3: the retired DS5 gate --------------------------------------

test("a stale MIRROR_TS_EXTERNAL_ROUTES is inert, in both directions", () => {
  // The gate is GONE, not merely unused. It was DS5's safety catch while replay
  // was the PRODUCTION route for these leaves; after the cutover replay is a
  // test transport, so the gate would only be a second thing to set in CI and a
  // stale value to trip over in a shell that once ran the parity harness.
  //
  // `=1` must not enable anything, and `=0` must not disable anything: an
  // operator who exported it months ago should see no difference at all.
  const leaves = [
    ["consult", "credits"],
    ["consult", "openai", "question"],
    ["mirror", "load", "--query", "hello"],
    ["journal", "an entry"],
    ["week", "plan", "text"],
    ["descriptor", "generate"],
    ["soul", "harvest", "save"],
    ["consolidate", "apply", "abc"],
    ["consolidate", "scan"],
    ["shadow", "scan"],
    ["memories", "--search", "q"],
  ];

  for (const argv of leaves) {
    const clean = routeMemoryCommand(argv, {});
    for (const value of ["1", "0"]) {
      const stale = routeMemoryCommand(argv, {
        MIRROR_TS_EXTERNAL_ROUTES: value,
      } as Record<string, string>);
      assert.deepEqual(stale, clean, `${argv.join(" ")} changed with the stale gate at ${value}`);
    }
  }
});

test("every provider-backed family has exactly one variable that reverts it", () => {
  // The DS8 done condition: "every family keeps a single-variable revert to
  // Python until DS10 deletes it". A leaf with no revert is a leaf an operator
  // cannot get out of at 2am.
  const reverts: [string[], string][] = [
    [["consult", "credits"], "MIRROR_TS_CONSULT"],
    [["consult", "openai", "question"], "MIRROR_TS_CONSULT"],
    [["mirror", "load", "--query", "hello"], "MIRROR_TS_MIRROR_QUERY"],
    [["journal", "an entry"], "MIRROR_TS_JOURNAL"],
    [["week", "plan", "text"], "MIRROR_TS_WEEK"],
    [["descriptor", "generate"], "MIRROR_TS_DESCRIPTOR"],
    [["soul", "harvest", "save"], "MIRROR_TS_SOUL"],
    [["consolidate", "apply", "abc"], "MIRROR_TS_CULTIVATION"],
    [["memories", "--search", "q"], "MIRROR_TS_SEARCH"],
  ];

  for (const [argv, variable] of reverts) {
    assert.equal(routeMemoryCommand(argv, {}).engine, "ts", `${argv.join(" ")} answers from TS`);
    const decision = routeMemoryCommand(argv, { [variable]: "0" } as Record<string, string>);
    assert.equal(decision.engine, "python", `${variable}=0 must revert ${argv.join(" ")}`);
    assert.match(decision.reason, new RegExp(`${variable}=0`));
  }
});
