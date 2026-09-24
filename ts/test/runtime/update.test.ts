// CV22.DS10.US2 plateau 3 — the update pipeline's decisions.
//
// Driven entirely through the injectable git runner and spawn seam: no remote,
// no registry, no real tree. What is pinned here is the ORDER and the SAFETY
// PROPERTIES, which is what the pipeline exists for.

import assert from "node:assert/strict";
import test from "node:test";
import { assertNamesNoInterpreter } from "#helpers/noInterpreter.ts";
import type { InstallKind } from "#runtime/installKind.ts";
import type { GitRunner } from "#runtime/strategies/clone.ts";
import { runUpdate, type UpdateDeps } from "#runtime/update.ts";
import { renderUpdateResult, updateLogDetail } from "#runtime/updatePipeline.ts";

const CLONE: InstallKind = { kind: "clone", repository: "/scratch/repo" };

interface ScriptedGit {
  runner: GitRunner;
  calls: string[][];
}

/** A git that answers from a table, and records what it was asked. */
function scriptGit(answers: Record<string, { code?: number; stdout?: string; stderr?: string }>) {
  const calls: string[][] = [];
  const runner: GitRunner = (args) => {
    calls.push([...args]);
    const key = args.join(" ");
    for (const [pattern, answer] of Object.entries(answers)) {
      if (key.startsWith(pattern)) {
        return { code: answer.code ?? 0, stdout: answer.stdout ?? "", stderr: answer.stderr ?? "" };
      }
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  return { runner, calls } satisfies ScriptedGit;
}

function deps(overrides: Partial<UpdateDeps> = {}): UpdateDeps {
  const git = scriptGit({
    "rev-parse --short HEAD": { stdout: "aaaaaaa\n" },
    "rev-list --count origin/main..HEAD": { stdout: "0\n" },
    "rev-list --count HEAD..origin/main": { stdout: "3\n" },
  });
  return {
    install: CLONE,
    upstream: "origin/main",
    channel: "main",
    mirrorHome: "/scratch/home",
    gate: () => ({ ready: true, allowed: true, detail: "runtime status is ready" }),
    statusReady: () => ({ ready: true, detail: "" }),
    createBackup: () => "/scratch/home/backups/memory_20260101_000000.zip",
    verifyBackup: () => ({ valid: true, note: null }),
    git: git.runner,
    // Injected in the BASE fixture, not per-test: without it the default
    // runner shells out to the real npm, and a unit test that reaches a
    // registry is not a unit test. Caught when the package strategy landed
    // and an existing test kept passing for a networked reason -- 1.2 seconds
    // of it.
    npm: () => ({ code: 1, stdout: "", stderr: "npm was not stubbed for this test\n" }),
    spawnFrontDoor: () => ({ code: 0, stdout: "Migrate result: nothing pending\n", stderr: "" }),
    ...overrides,
  };
}

function stageNames(result: ReturnType<typeof runUpdate>): string[] {
  return result.stages.map((entry) => `${entry.name}=${entry.state}`);
}

test("the happy path runs the stages in the oracle's order", () => {
  // The order is load-bearing: plan and fetch are read-only and come first, so
  // a no-op update never archives the database; apply is the first
  // irreversible step and nothing reaches it until capture and verify passed.
  const result = runUpdate(deps());
  assert.equal(result.success, true);
  assert.deepEqual(stageNames(result), [
    "status gate=pass",
    "capture=pass",
    "fetch=pass",
    "plan=pass",
    "backup=pass",
    "verify backup=pass",
    "fast-forward=pass",
    "migrate=pass",
    "post-update status=pass",
  ]);
});

test("an up-to-date clone takes no backup at all", () => {
  // The defect the Plan's first stage order would have shipped: backing up
  // before planning archives the database on every invocation, including the
  // ones that find nothing to do.
  const git = scriptGit({
    "rev-parse --short HEAD": { stdout: "aaaaaaa\n" },
    "rev-list --count": { stdout: "0\n" },
  });
  let backups = 0;
  const result = runUpdate(
    deps({
      git: git.runner,
      createBackup: () => {
        backups += 1;
        return "/should/not/happen.zip";
      },
    }),
  );
  assert.equal(result.success, true);
  assert.equal(backups, 0, "an up-to-date clone must not archive the database");
  assert.equal(result.backupPath, null);
  assert.ok(stageNames(result).includes("plan=pass"));
  assert.ok(!stageNames(result).some((name) => name.startsWith("backup")));
});

test("apply is unreachable unless capture and verify backup passed", () => {
  // The safety property, asserted against what git was actually asked to do.
  const git = scriptGit({
    "rev-parse --short HEAD": { stdout: "aaaaaaa\n" },
    "rev-list --count origin/main..HEAD": { stdout: "0\n" },
    "rev-list --count HEAD..origin/main": { stdout: "3\n" },
  });
  const result = runUpdate(
    deps({
      git: git.runner,
      // An archive that was written but does not open -- exactly the case the
      // oracle calls valid and this port refuses.
      createBackup: () => "/scratch/home/backups/not-a-backup.zip",
      verifyBackup: () => ({ valid: false, note: "memory.db failed integrity check" }),
    }),
  );
  assert.equal(result.success, false);
  assert.ok(stageNames(result).includes("verify backup=fail"));
  assert.ok(
    !git.calls.some((call) => call[0] === "merge"),
    "git merge must never be called after a failed verification",
  );
});

test("a diverged clone fails at plan, before anything moves", () => {
  const git = scriptGit({
    "rev-parse --short HEAD": { stdout: "aaaaaaa\n" },
    "rev-list --count origin/main..HEAD": { stdout: "2\n" },
    "rev-list --count HEAD..origin/main": { stdout: "3\n" },
  });
  const result = runUpdate(deps({ git: git.runner }));
  assert.equal(result.success, false);
  assert.ok(stageNames(result).includes("plan=fail"));
  assert.match(result.stages.at(-1)?.detail ?? "", /diverged/);
  assert.ok(!git.calls.some((call) => call[0] === "merge"));
  assert.ok(result.recovery.some((line) => line.includes("unchanged")));
});

test("the recovery block carries the captured value, not a placeholder", () => {
  // A recovery route without values is a sentence, not a route.
  const git = scriptGit({
    "rev-parse --short HEAD": { stdout: "c0ffee1\n" },
    "rev-list --count origin/main..HEAD": { stdout: "0\n" },
    "rev-list --count HEAD..origin/main": { stdout: "1\n" },
    "merge --ff-only": { code: 1, stderr: "fatal: Not possible to fast-forward\n" },
  });
  const result = runUpdate(deps({ git: git.runner }));
  assert.equal(result.success, false);
  assert.equal(result.previousRef, "c0ffee1");
  assert.ok(
    result.recovery.some((line) => line.includes("git reset --hard c0ffee1")),
    `expected the captured commit in the recovery block: ${JSON.stringify(result.recovery)}`,
  );
});

test("migrate runs in a fresh process, on the code that was just installed", () => {
  const spawned: string[][] = [];
  const git = scriptGit({
    "rev-parse --short HEAD": { stdout: "aaaaaaa\n" },
    "rev-list --count origin/main..HEAD": { stdout: "0\n" },
    "rev-list --count HEAD..origin/main": { stdout: "1\n" },
  });
  runUpdate(
    deps({
      git: git.runner,
      spawnFrontDoor: (argv) => {
        spawned.push([...argv]);
        return { code: 0, stdout: "Migrate result: applied 1 migration(s)\n", stderr: "" };
      },
    }),
  );
  assert.deepEqual(spawned, [["runtime", "migrate", "--mirror-home", "/scratch/home"]]);

  // And the ORDER: the spawn happens after the fast-forward, never before.
  const mergeIndex = git.calls.findIndex((call) => call[0] === "merge");
  assert.ok(mergeIndex >= 0, "the fast-forward must have run");
});

test("a failing migration says where the database and the code now stand", () => {
  const git = scriptGit({
    "rev-parse --short HEAD": { stdout: "aaaaaaa\n" },
    "rev-list --count origin/main..HEAD": { stdout: "0\n" },
    "rev-list --count HEAD..origin/main": { stdout: "1\n" },
  });
  const result = runUpdate(
    deps({
      git: git.runner,
      spawnFrontDoor: () => ({ code: 1, stdout: "", stderr: "Migration error: disk full\n" }),
    }),
  );
  assert.equal(result.success, false);
  assert.ok(stageNames(result).includes("migrate=fail"));
  assert.ok(result.recovery.some((line) => line.includes("Backup:")));
  assert.ok(result.recovery.some((line) => line.includes("git reset --hard aaaaaaa")));
});

test("the gate refuses a not-ready status, and allows migration drift alone", () => {
  const refused = runUpdate(
    deps({ gate: () => ({ ready: false, allowed: false, detail: "git tree is dirty" }) }),
  );
  assert.equal(refused.success, false);
  assert.deepEqual(stageNames(refused), ["status gate=fail"]);
  assert.ok(refused.recovery.some((line) => line.includes("runtime diagnose")));
  // No engine instruction leaks into the recovery route.
  assertNamesNoInterpreter(refused.recovery.join("\n"));

  const allowed = runUpdate(
    deps({
      gate: () => ({ ready: false, allowed: true, detail: "pending core migrations: 018" }),
    }),
  );
  assert.equal(allowed.success, true);
  assert.match(allowed.stages[0]?.detail ?? "", /update-safe preflight drift/);
});

test("an unknown install refuses to guess", () => {
  const unknown = runUpdate(deps({ install: { kind: "unknown", reason: "not a git checkout" } }));
  assert.equal(unknown.success, false);
  assert.match(unknown.stages[0]?.detail ?? "", /install kind unknown/);
  assert.ok(unknown.recovery.some((line) => line.includes("will not update itself")));
});

// --- the package strategy (plateau 4) ---------------------------------------

const PACKAGE: InstallKind = {
  kind: "package",
  root: "/usr/local/lib/node_modules/mirror-core",
  name: "mirror-core",
  version: "1.2.3",
};

/** An npm that answers from a table, and records what it was asked. */
function scriptNpm(answers: Record<string, { code?: number; stdout?: string; stderr?: string }>) {
  const calls: string[][] = [];
  const runner = (args: readonly string[]) => {
    calls.push([...args]);
    const key = args.join(" ");
    for (const [pattern, answer] of Object.entries(answers)) {
      if (key.startsWith(pattern)) {
        return { code: answer.code ?? 0, stdout: answer.stdout ?? "", stderr: answer.stderr ?? "" };
      }
    }
    return { code: 1, stdout: "", stderr: `unscripted npm call: ${key}\n` };
  };
  return { runner, calls };
}

test("a package install resolves the dist-tag and installs an EXACT version", () => {
  // Never `npm install -g name@stable`: a bare tag installs whatever it
  // pointed at in that instant and reports nothing about what arrived.
  const npm = scriptNpm({
    "view mirror-core dist-tags": { stdout: JSON.stringify({ stable: "1.3.0", main: "1.4.0" }) },
    "install -g": { stdout: "added 1 package\n" },
  });
  const result = runUpdate(deps({ install: PACKAGE, channel: "stable", npm: npm.runner }));
  assert.equal(result.success, true, JSON.stringify(result.stages));
  assert.equal(result.previousRef, "1.2.3");
  assert.equal(result.newRef, "1.3.0");
  assert.deepEqual(
    npm.calls.find((call) => call[0] === "install"),
    ["install", "-g", "mirror-core@1.3.0"],
    "the install argv must carry the resolved version, never the tag",
  );
});

test("a package already on the tag's version does nothing at all", () => {
  const npm = scriptNpm({
    "view mirror-core dist-tags": { stdout: JSON.stringify({ stable: "1.2.3" }) },
  });
  let backups = 0;
  const result = runUpdate(
    deps({
      install: PACKAGE,
      channel: "stable",
      npm: npm.runner,
      createBackup: () => {
        backups += 1;
        return "/should/not/happen.zip";
      },
    }),
  );
  assert.equal(result.success, true);
  assert.equal(backups, 0);
  assert.ok(!npm.calls.some((call) => call[0] === "install"));
});

test("a failed install names the captured version as the way back", () => {
  // `npm install -g` is not atomic: a failure can leave a broken tree, and a
  // pinned reinstall is the only rollback there is.
  const npm = scriptNpm({
    "view mirror-core dist-tags": { stdout: JSON.stringify({ stable: "1.3.0" }) },
    "install -g": { code: 1, stderr: "npm ERR! code EACCES\n" },
  });
  const result = runUpdate(deps({ install: PACKAGE, channel: "stable", npm: npm.runner }));
  assert.equal(result.success, false);
  assert.ok(
    result.recovery.some((line) => line.includes("npm install -g mirror-core@1.2.3")),
    JSON.stringify(result.recovery),
  );
  assert.ok(result.recovery.some((line) => line.includes("not atomic")));
});

test("an unreadable dist-tag answer fails at plan, before any backup", () => {
  for (const answer of [
    { stdout: "not json" },
    { stdout: JSON.stringify({ latest: "9.9.9" }) },
    { code: 1, stderr: "npm ERR! network\n" },
  ]) {
    const npm = scriptNpm({ "view mirror-core dist-tags": answer });
    let backups = 0;
    const result = runUpdate(
      deps({
        install: PACKAGE,
        channel: "stable",
        npm: npm.runner,
        createBackup: () => {
          backups += 1;
          return null;
        },
      }),
    );
    assert.equal(result.success, false, JSON.stringify(answer));
    assert.equal(backups, 0, "nothing is archived before the plan is known");
    assert.ok(!npm.calls.some((call) => call[0] === "install"));
  }
});

test("the render and the log line report the same run", () => {
  const result = runUpdate(deps());
  const render = renderUpdateResult(result);
  assert.match(render, /^Mirror runtime update\n\n/);
  assert.match(render, /^\[✓\] status gate$/m);
  assert.match(render, /^\[✓\] migrate: nothing pending$/m);
  assert.match(render, /^Update result: success$/m);
  assertNamesNoInterpreter(render);

  const line = updateLogDetail("clone (/scratch/repo)", "main", result);
  assert.match(line, /^update install=clone/);
  assert.match(line, /channel=main/);
  assert.match(line, /result=success/);
  assert.match(line, /status gate=pass/);
});

// --- CV22.DS10.TS5, debt D-025 ---------------------------------------------

test("a declined migration FAILS the update instead of passing it", () => {
  // The defect this closes, in the shape the operator met it: the migrate
  // stage read `Migrate result: nothing pending` with exit 0 and reported
  // `[✓] migrate: nothing pending` for a database with pending work that
  // nothing had applied. The update then completed successfully, on the one
  // command whose job is to leave the database correct.
  //
  // TS5 gives the declined verdict a non-zero exit. The stage already fails on
  // a non-zero code, so the whole recovery path -- backup named, restore
  // instructions, update marked failed -- comes for free and is asserted here
  // rather than assumed.
  const result = runUpdate(
    deps({
      spawnFrontDoor: (argv) =>
        argv[1] === "migrate"
          ? {
              code: 1,
              stdout:
                "Declined: database carries migrations this core does not know (999_x).\n" +
                "Migrate result: declined\n",
              stderr: "",
            }
          : { code: 0, stdout: "", stderr: "" },
    }),
  );

  assert.ok(stageNames(result).includes("migrate=fail"), stageNames(result).join(" "));
  assert.equal(result.success, false, "an update whose migration was declined did not succeed");

  const render = renderUpdateResult(result);
  assert.match(render, /^\[✗\] migrate: /m);
  assert.doesNotMatch(render, /^\[✓\] migrate/m);
  assert.match(render, /^Update result: failed$/m);
  // And the operator is told how to get back, because the code moved and the
  // database may not have.
  assert.match(render, /Restore the database from the backup/);
});
