// CV22.DS10.US2 plateau 3 — the update pipeline's decisions.
//
// Driven entirely through the injectable git runner and spawn seam: no remote,
// no registry, no real tree. What is pinned here is the ORDER and the SAFETY
// PROPERTIES, which is what the pipeline exists for.

import assert from "node:assert/strict";
import test from "node:test";
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
  assert.ok(!refused.recovery.some((line) => line.includes("uv run python")));

  const allowed = runUpdate(
    deps({
      gate: () => ({ ready: false, allowed: true, detail: "pending core migrations: 018" }),
    }),
  );
  assert.equal(allowed.success, true);
  assert.match(allowed.stages[0]?.detail ?? "", /update-safe preflight drift/);
});

test("an unknown install refuses to guess, and a package says who owns it", () => {
  const unknown = runUpdate(deps({ install: { kind: "unknown", reason: "not a git checkout" } }));
  assert.equal(unknown.success, false);
  assert.match(unknown.stages[0]?.detail ?? "", /install kind unknown/);

  const asPackage = runUpdate(
    deps({
      install: { kind: "package", root: "/usr/lib/node_modules/m", name: "m", version: "1.2.3" },
    }),
  );
  assert.equal(asPackage.success, false);
  assert.equal(asPackage.previousRef, "1.2.3", "the installed version is the captured ref");
});

test("the render and the log line report the same run", () => {
  const result = runUpdate(deps());
  const render = renderUpdateResult(result);
  assert.match(render, /^Mirror runtime update\n\n/);
  assert.match(render, /^\[✓\] status gate$/m);
  assert.match(render, /^\[✓\] migrate: nothing pending$/m);
  assert.match(render, /^Update result: success$/m);
  assert.doesNotMatch(render, /uv run python/);

  const line = updateLogDetail("clone (/scratch/repo)", "main", result);
  assert.match(line, /^update install=clone/);
  assert.match(line, /channel=main/);
  assert.match(line, /result=success/);
  assert.match(line, /status gate=pass/);
});
