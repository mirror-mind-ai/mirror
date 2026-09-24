import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalArgv } from "#frontDoor/argvShape.ts";
import { routeMemoryCommand } from "#frontDoor/routing.ts";
import { RETIRED_REVERT_GATES } from "#runtime/diagnose.ts";

/**
 * CV22.DS10.TS5 (D2): what a family answers for a name it does not route --
 * the front door's own usage answer, where Python used to answer.
 */
function familyUsage(argv: readonly string[]): { program: string; given: string } | null {
  const decision = routeMemoryCommand(argv, {});
  return decision.engine === "usage" && decision.request.scope === "family"
    ? { program: decision.request.program, given: decision.request.given }
    : null;
}

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
  // Half a pair reaches TypeScript, which refuses it by name before any
  // provider is built -- never Python any more, which had no replay transport
  // and would have called the live provider (CV22.DS10.TS5).
  const halfConfiguredAsk = routeMemoryCommand(["consult", "openai", "question"], {
    MIRROR_TS_CREDITS_REPLAY: "/tmp/c.json",
  });
  assert.equal(halfConfiguredAsk.engine, "ts");
  assert.match(halfConfiguredAsk.reason, /incomplete replay fixture/);
  assert.match(halfConfiguredAsk.reason, /MIRROR_TS_CONSULT_LLM_REPLAY missing/);

  assert.equal(
    routeMemoryCommand(["consult", "openai", "question"], {
      MIRROR_TS_CONSULT_LLM_REPLAY: "/tmp/llm.json",
      MIRROR_TS_CREDITS_REPLAY: "/tmp/c.json",
    }).engine,
    "ts",
  );
});

test("nothing the oracle answered falls through to it any more", () => {
  // `build` left the unported list in CV22.DS7.US8; its Workbench leaves left
  // it in CV22.DS10.TS4, which retired them (see retiredSurfaces.test.ts); the
  // unknown names left it in CV22.DS10.TS5, which answers them itself (D2).
  assert.equal(routeMemoryCommand(["build", "load", "mirror-ts-core"]).engine, "ts");
  assert.equal(routeMemoryCommand(["build", "change-request", "capture"]).engine, "retired");
  assert.deepEqual(familyUsage(["conversation-logger", "extract-pending"]), {
    program: "conversation-logger",
    given: "extract-pending",
  });
  // `journal` left this list in CV22.DS8.US3; it is live by default now.
  assert.equal(routeMemoryCommand(["journal", "hello"]).engine, "ts");
});

test("routes every `identity` leaf to TS", () => {
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
  // Flipped 2026-09-16 (CV22.DS7.TS4 plateau 8) on accepted Navigator
  // validation: the editor seam answers from TS.
  assert.equal(routeMemoryCommand(["identity", "edit", "ego", "behavior"]).engine, "ts");
  // A leaf `identity` never had is answered by the family, by name (D2).
  assert.deepEqual(familyUsage(["identity", "something-new"]), {
    program: "identity",
    given: "something-new",
  });
});

test("routes `tasks` list/default to TS", () => {
  assert.deepEqual(routeMemoryCommand(["tasks"]), {
    command: "tasks",
    engine: "ts",
    reason: "DS7.US2 tasks list read ported to TS",
  });
  assert.equal(routeMemoryCommand(["tasks", "list"]).engine, "ts");
  // Leading options reach routing already moved after the subcommand: the
  // front door applies `canonicalArgv` first (CV22.DS10.TS5, F5).
  assert.equal(routeMemoryCommand(canonicalArgv(["tasks", "--journey", "cv22"])).engine, "ts");
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

test("all week leaves answer from TS", () => {
  for (const argv of [["week"], ["week", "view"], ["week", "save"], ["week", "plan", "text"]]) {
    assert.equal(routeMemoryCommand(argv).engine, "ts", `${argv.join(" ")} is live by default`);
  }
  assert.equal(
    routeMemoryCommand(["week", "plan", "t"], { MIRROR_TS_WEEK_LLM_REPLAY: "/tmp/w.json" }).engine,
    "ts",
    "a fixture still selects replay",
  );
  assert.equal(routeMemoryCommand(["week", "unknown"]).engine, "usage");
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
  // The two WRITE faces joined them at CV22.DS7.TS4 plateau 8.
  for (const flag of ["--metadata-lifecycle-apply", "--metadata-lifecycle-demo"]) {
    assert.equal(routeMemoryCommand(["conversations", flag, "x"], {}).engine, "ts", flag);
  }
  // The backfills were refused BY NAME to Python; CV22.DS10.TS4 deleted them,
  // so the same names are now retired.
  for (const flag of ["--metadata-backfill-preview", "--metadata-backfill-apply"]) {
    assert.equal(routeMemoryCommand(["conversations", flag, "x"], {}).engine, "retired", flag);
  }
});

test("routes every ported `inspect` target to TS, and refuses an unknown one by name", () => {
  assert.deepEqual(routeMemoryCommand(["inspect", "persona", "engineer"]), {
    command: "inspect",
    engine: "ts",
    reason: "DS7.US1 inspect persona read ported to TS",
  });
  // CV22.DS7.TS4 plateau 8: the catalog pair and the ledger pair flipped
  // together.
  for (const target of [
    ["extension", "ext-google-ads"],
    ["runtime-catalog", "pi"],
    ["llm-calls"],
    ["embedding-provenance"],
  ]) {
    assert.equal(routeMemoryCommand(["inspect", ...target]).engine, "ts", target.join(" "));
  }
  assert.deepEqual(familyUsage(["inspect", "something-new"]), {
    program: "inspect",
    given: "something-new",
  });
});

test("routes every ported `list` target to TS, and refuses an unknown one by name", () => {
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
  // CV22.DS7.TS4 plateau 8: `extensions` and `all` (the no-target default)
  // flipped; `all` is the composition of three ported renderers.
  for (const argv of [["list", "extensions"], ["list", "all"], ["list"]]) {
    assert.equal(routeMemoryCommand(argv).engine, "ts", argv.join(" "));
  }
  assert.deepEqual(familyUsage(["list", "something-new"]), {
    program: "list",
    given: "something-new",
  });
});

test("descriptor list and generate both answer from TS", () => {
  assert.equal(routeMemoryCommand(["descriptor", "list"]).engine, "ts");
  assert.equal(routeMemoryCommand(["descriptor", "generate"]).engine, "ts");
  assert.deepEqual(familyUsage(["descriptor", "unknown"]), {
    program: "descriptor",
    given: "unknown",
  });
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

test("consolidate apply and scan are live", () => {
  for (const sub of ["list", "reject"]) {
    assert.equal(routeMemoryCommand(["consolidate", sub, "abc"]).engine, "ts");
  }

  // `apply` sends NO prompt -- a merge only embeds -- so it went live with
  // US3's group B, ahead of scan.
  assert.equal(routeMemoryCommand(["consolidate", "apply", "abc"]).engine, "ts");

  // `scan` sends a prompt; it was refused by name (`live blocked by DS8.TS2`)
  // until the templates were ported and digest-pinned, and is live since.
  const scan = routeMemoryCommand(["consolidate", "scan"]);
  assert.equal(scan.engine, "ts");
  assert.match(scan.reason, /DS8\.TS2 cultivation scan live/);
  assert.doesNotMatch(scan.reason, /blocked/);
  // Replay still reaches TS, which is what the goldens and the parity
  // harness use.
  assert.equal(
    routeMemoryCommand(["consolidate", "scan"], {
      MIRROR_TS_CULTIVATION_LLM_REPLAY: "/tmp/llm.json",
    }).engine,
    "ts",
  );

  assert.deepEqual(familyUsage(["consolidate", "unknown-sub"]), {
    program: "consolidate",
    given: "unknown-sub",
  });
});

test("shadow reads stay on TS, and `shadow scan` is live with its cultivation sibling", () => {
  for (const sub of ["list", "show", "reject", "apply"]) {
    assert.deepEqual(routeMemoryCommand(["shadow", sub, "abc"]), {
      command: "shadow",
      engine: "ts",
      reason: "DS7.US3 shadow list/show/reject/apply ported to TS",
    });
  }

  const scan = routeMemoryCommand(["shadow", "scan"]);
  assert.equal(scan.engine, "ts");
  assert.match(scan.reason, /DS8\.TS2 cultivation scan live \(shadow scan\)/);
  assert.equal(
    routeMemoryCommand(["shadow", "scan"], { MIRROR_TS_CULTIVATION_LLM_REPLAY: "/tmp/llm.json" })
      .engine,
    "ts",
  );

  assert.deepEqual(familyUsage(["shadow", "unknown-sub"]), {
    program: "shadow",
    given: "unknown-sub",
  });
});

test("mirror load --query is live, and MEMORY_RECEPTION=0 drops the chat half", () => {
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
  assert.equal(halfConfigured.engine, "ts", "the route refuses it by name");
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

test("no command at all is the front door's top-level usage answer", () => {
  assert.deepEqual(routeMemoryCommand([]), {
    command: null,
    engine: "usage",
    reason: "no command",
    request: { scope: "top-level", given: null },
  });
});

// --- CV22.DS7.US5 / US10: conversation-logger ---------------------------------

test("conversation-logger routes its deterministic subcommands to TS", () => {
  for (const sub of [
    "mute",
    "unmute",
    "status",
    "log-user",
    "log-assistant",
    "user-prompt",
    "discard-current",
  ]) {
    assert.equal(routeMemoryCommand(["conversation-logger", sub], {}).engine, "ts", sub);
  }
});

const CONVERSATION_REPLAY_ENV = {
  MIRROR_TS_CONVERSATION_LLM_REPLAY: "/tmp/llm.json",
  MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY: "/tmp/embedding.json",
};

const GROUP_1 = ["switch", "session-end-pi", "session-end"];
const GROUP_2 = ["session-start", "session-maintenance"];

test("the close-tail subcommands are live with nothing configured, and replay under a fixture", () => {
  // CV22.DS8.US2 staged the cutover -- group 1, the unattended hook path, first
  // -- and group 2 followed once group 1 had run live on the real home.
  for (const sub of [...GROUP_1, ...GROUP_2]) {
    const live = routeMemoryCommand(["conversation-logger", sub], {});
    assert.equal(live.engine, "ts", sub);
    assert.equal(live.reason, `DS8.US2 conversation close tail live (${sub})`, sub);

    const replayed = routeMemoryCommand(["conversation-logger", sub], CONVERSATION_REPLAY_ENV);
    assert.equal(replayed.engine, "ts", sub);
    assert.match(replayed.reason, /replay/, sub);
  }
});

test("session-start --fast makes no model call and never consults the close-tail transport", () => {
  const fast = routeMemoryCommand(["conversation-logger", "session-start", "--fast"], {});
  assert.equal(fast.engine, "ts");
  assert.match(fast.reason, /--fast/);
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

test("diagnose-journeys, dry-run repair-journeys, and backfill-codex-session route to TS", () => {
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
});

test("repair-journeys --apply routes to TS on its own reason, wherever the flag sits", () => {
  for (const argv of [
    ["repair-journeys", "--apply"],
    ["repair-journeys", "--limit", "2", "--apply"],
    ["--mirror-home", "/home/x", "repair-journeys", "--apply"],
  ]) {
    const decision = routeMemoryCommand(["conversation-logger", ...argv], {});
    assert.equal(decision.engine, "ts", argv.join(" "));
    assert.match(decision.reason, /DS7\.TS1/);
  }
});

test("an unknown conversation-logger subcommand is answered by the family", () => {
  // The oracle answered this with NOTHING and exit 0 -- a silent success for a
  // subcommand that does not exist. D2 gives it the family's answer (F6).
  const decision = routeMemoryCommand(
    ["conversation-logger", "extract-pending"],
    CONVERSATION_REPLAY_ENV,
  );
  assert.equal(decision.engine, "usage");
});

// --- CV22.DS7.TS1: the DB safety tools ----------------------------------------

test("backup and repair-encoding route to TS", () => {
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
  }
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
  }
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

test("conversations listing still routes to TS", () => {
  assert.equal(routeMemoryCommand(["conversations"], {}).engine, "ts");
  assert.equal(routeMemoryCommand(["conversations", "--limit", "5"], {}).engine, "ts");
});

// --- CV22.DS7.TS3: the daily-visible tail ---------------------------------

test("welcome routes to TS", () => {
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
  }
});

test("the four runtime reads route to TS", () => {
  for (const sub of ["status", "version", "diagnose", "release-notes"]) {
    const decision = routeMemoryCommand(["runtime", sub], {});
    assert.equal(decision.engine, "ts", sub);
    assert.equal(decision.reason, `DS7.TS3 runtime ${sub} ported to TS`);
  }
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

test("the release chain answers from the retired-surface table, before dispatch", () => {
  // CV22.DS10.US2 retired `release-doctor` and `release-promote` from the
  // product surface rather than porting them, so both names answer their
  // cutoff -- and BEFORE dispatch, so `--push` never reaches code that could
  // touch a remote. This is TS4's route shape doing its job.
  for (const sub of ["release-doctor", "release-promote"]) {
    assert.equal(routeMemoryCommand(["runtime", sub], {}).engine, "retired", sub);
  }
  const promote = routeMemoryCommand(
    ["runtime", "release-promote", "--target", "v9.9.9", "--push"],
    {},
  );
  assert.equal(promote.engine, "retired");
});

test("the updater family answers from TS", () => {
  // CV22.DS10.US2. `runtime backup` (create + VERIFY + recovery route, the
  // updater's safety stage) is not `backup` (create, DS7.TS1): different
  // commands with different reasons.
  for (const sub of ["update", "migrate", "backup"]) {
    const decision = routeMemoryCommand(["runtime", sub], {});
    assert.equal(decision.engine, "ts", sub);
    assert.match(decision.reason, /DS10\.US2/, sub);
  }
  assert.notEqual(
    routeMemoryCommand(["runtime", "backup"], {}).reason,
    routeMemoryCommand(["backup"], {}).reason,
  );
});

test("an unknown runtime subcommand is answered by TypeScript, not inherited", () => {
  // The allowlist's original purpose stands: a name this build has never heard
  // of must not acquire a TS route because `runtime` already has one. US2 made
  // the refusal TypeScript's; CV22.DS10.TS5 moved it to the shared usage
  // answer (D2), which renders the same bytes before dispatch.
  for (const sub of ["", "doctor", "publish", "pull", "stable"]) {
    const argv = sub ? ["runtime", sub] : ["runtime"];
    assert.deepEqual(familyUsage(argv), { program: "runtime", given: sub }, sub);
  }
});

test("`pull` and `stable` are unknown names, never DS10 work", () => {
  // `pull` is the update planner's ACTION and `stable` is the CHANNEL; neither
  // was ever a subcommand on either engine.
  for (const sub of ["pull", "stable"]) {
    const decision = routeMemoryCommand(["runtime", sub], {});
    assert.doesNotMatch(decision.reason, /DS10/, sub);
    assert.equal(decision.engine, "usage", sub);
  }
});

// --- CV22.DS7.US11: `week save`, `journal`, and the week leaves ---------------

test("no week reason mislabels `save` as LLM-gated (CR068 stays corrected)", () => {
  // A reason is about the leaf it describes, and `save` is never called
  // LLM-gated -- it reads the pending file and calls add_task, crossing no
  // provider seam.
  const plan = routeMemoryCommand(["week", "plan", "some text"], {});
  assert.equal(plan.engine, "ts");
  assert.doesNotMatch(plan.reason, /save/);

  const save = routeMemoryCommand(["week", "save"], {});
  assert.equal(save.engine, "ts");
  assert.doesNotMatch(save.reason, /LLM-gated/, "save is deterministic; CR068 corrected this");
});

test("an unknown week subcommand is refused by name, never inherited", () => {
  const unknown = routeMemoryCommand(["week", "bogus"], {});
  assert.equal(unknown.engine, "usage");
  assert.match(unknown.reason, /bogus/);
});

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
  // Half a fixture reaches TypeScript, which refuses it by name before any
  // provider is built. Until CV22.DS10.TS5 it went to Python -- which had no
  // replay transport and would have called the live provider.
  const half = routeMemoryCommand(["journal", "x"], {
    MIRROR_TS_JOURNAL_LLM_REPLAY: "fixture.json",
  });
  assert.equal(half.engine, "ts");
  assert.match(half.reason, /MIRROR_TS_JOURNAL_EMBEDDING_REPLAY missing/);
});

test("the journal route's reason describes the state that exists", () => {
  const reason = routeMemoryCommand(["journal", "x"], {}).reason;
  assert.match(reason, /DS8\.US3 journal live/);
  assert.doesNotMatch(reason, /=0/);
  assert.doesNotMatch(reason, /replay config/);
});

test("the week leaves' requirements collapse to one live default", () => {
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

test("lifecycle READ and WRITE flags are their own leaves, named in the reason", () => {
  // Each flag is claimed BY NAME so none can inherit another's route (CR055):
  // whichever flag decided the route, the reason says so.
  for (const flag of [
    "--metadata-lifecycle-dry-run",
    "--metadata-lifecycle-preview-at-message",
    "--metadata-lifecycle-apply",
    "--metadata-lifecycle-demo",
  ]) {
    const decision = routeMemoryCommand(["conversations", flag, "x"], {});
    assert.equal(decision.engine, "ts", flag);
    assert.match(decision.reason, new RegExp(flag.replace(/-/g, "\\-")), flag);
  }
});

test("backfill flags are retired, whatever else is set", () => {
  for (const flag of ["--metadata-backfill-preview", "--metadata-backfill-apply"]) {
    const decision = routeMemoryCommand(["conversations", flag, "x"], {});
    assert.equal(decision.engine, "retired");
    assert.match(decision.reason, /CV22\.DS10\.TS4/);
  }
});

// --- CV22.DS8.US1: fresh semantic search ------------------------------------

test("memories --search reaches the live provider with nothing configured", () => {
  const decision = routeMemoryCommand(["memories", "--search", "builder"], {});
  assert.equal(decision.engine, "ts");
  assert.equal(decision.reason, "DS8.US1 fresh semantic search live");
});

test("a replay fixture selects replay for search", () => {
  const decision = routeMemoryCommand(["memories", "--search", "builder"], {
    MIRROR_TS_SEARCH_EMBEDDING_REPLAY: "/tmp/embedding.json",
  });
  assert.equal(decision.engine, "ts");
  assert.match(decision.reason, /replay/);
});

test("plain memory listing is its own route", () => {
  const decision = routeMemoryCommand(["memories", "--limit", "5"], {});
  assert.equal(decision.engine, "ts");
  assert.equal(decision.reason, "DS2 memory listing read ported to TS");
});

// --- CV22.DS10.TS5 (D3): the revert gates are gone ----------------------------

/**
 * One representative invocation per retired gate: what that gate used to send
 * back to Python.
 */
const WHAT_EACH_GATE_REVERTED: Readonly<Record<string, readonly string[]>> = {
  MIRROR_TS_BACKUP: ["backup"],
  MIRROR_TS_BUILD: ["build", "inspect-method"],
  MIRROR_TS_CONSULT: ["consult", "credits"],
  MIRROR_TS_CONVERSATION_APPEND: ["conversations", "append", "--format", "json"],
  MIRROR_TS_CONVERSATION_LLM_TAIL: ["conversation-logger", "session-end"],
  MIRROR_TS_CONVERSATION_LOGGER: ["conversation-logger", "status"],
  MIRROR_TS_CONVERSATIONS_LIFECYCLE: ["conversations", "--metadata-lifecycle-dry-run", "x"],
  MIRROR_TS_CULTIVATION: ["consolidate", "scan"],
  MIRROR_TS_DESCRIPTOR: ["descriptor", "generate"],
  MIRROR_TS_EXPLORE: ["explore", "load", "x"],
  MIRROR_TS_EXTENSIONS: ["extensions", "list"],
  MIRROR_TS_EXTERNAL_ROUTES: ["consult", "openai", "question"],
  MIRROR_TS_IDENTITY_EDIT: ["identity", "edit", "ego", "behavior"],
  MIRROR_TS_JOURNAL: ["journal", "an entry"],
  MIRROR_TS_MCP: ["mcp"],
  MIRROR_TS_MIRROR_QUERY: ["mirror", "load", "--query", "hello"],
  MIRROR_TS_REPAIR_ENCODING: ["repair-encoding"],
  MIRROR_TS_RUNTIME_READS: ["runtime", "status"],
  MIRROR_TS_RUNTIME_UPDATE: ["runtime", "update"],
  MIRROR_TS_SEARCH: ["memories", "--search", "q"],
  MIRROR_TS_SOUL: ["soul", "load"],
  MIRROR_TS_WEEK: ["week", "save"],
  MIRROR_TS_WELCOME: ["welcome"],
};

test("a leftover revert gate changes no route, in either direction (D3)", () => {
  // The gates chose an ENGINE, and the engine is gone. A value left in
  // someone's `.env` must change nothing at all -- `runtime diagnose` names it
  // inert, and routing ignores it.
  assert.deepEqual(
    Object.keys(WHAT_EACH_GATE_REVERTED).sort(),
    [...RETIRED_REVERT_GATES].sort(),
    "every retired gate has a representative invocation here, and nothing else does",
  );
  for (const [gate, argv] of Object.entries(WHAT_EACH_GATE_REVERTED)) {
    const clean = routeMemoryCommand(argv, {});
    assert.equal(clean.engine, "ts", argv.join(" "));
    for (const value of ["0", "1"]) {
      const stale = routeMemoryCommand(argv, { [gate]: value } as Record<string, string>);
      assert.deepEqual(stale, clean, `${gate}=${value} changed the route of ${argv.join(" ")}`);
    }
  }
});
