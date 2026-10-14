// CR132 — the clone updater's one network command gets the network budget.
//
// `fetchUpstream` ran `git fetch` through `defaultGitRunner` with no timeout,
// so it got `runGit`'s 2-second LOCAL budget: a fetch still in flight was
// killed and the update reported it failed. The oracle gave `_git_fetch` the
// network budget in 521177f8; the port lost it. Both update lanes, the
// ordinary one and the repair lane, run this fetch. Every other command of the
// strategy is local and keeps the default.
//
// A slow transport is proven end to end in `scripts/smoke_runtime_update.sh`
// (step 2b), through `runtime update` itself. Here a recording runner pins
// which command asks for which budget, and costs no time.

import assert from "node:assert/strict";
import test from "node:test";
import { GIT_NETWORK_TIMEOUT_MS } from "#runtime/git.ts";
import { cloneStrategy, type GitRunner } from "#runtime/strategies/clone.ts";

interface Call {
  args: string[];
  timeoutMs: number | undefined;
}

/** Answers every command the strategy asks for, and records each with the budget it asked for. */
function recordingGit(): { runner: GitRunner; calls: Call[] } {
  const calls: Call[] = [];
  const runner: GitRunner = (args, _cwd, timeoutMs) => {
    calls.push({ args: [...args], timeoutMs });
    const [command] = args;
    if (command === "rev-parse") return { code: 0, stdout: `abc${calls.length}`, stderr: "" };
    if (command === "rev-list") {
      // One commit behind the channel and none ahead, so `plan` plans a pull.
      const behind = args.at(-1)?.startsWith("HEAD..") === true;
      return { code: 0, stdout: behind ? "1" : "0", stderr: "" };
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  return { runner, calls };
}

test("the clone updater's fetch asks for the network budget (CR132)", () => {
  const { runner, calls } = recordingGit();
  const fetched = cloneStrategy("/repo", "origin/stable", runner).fetch?.();
  assert.equal(fetched?.ok, true);
  assert.deepEqual(calls, [
    { args: ["fetch", "origin", "stable"], timeoutMs: GIT_NETWORK_TIMEOUT_MS },
  ]);
});

test("every other command of the clone strategy keeps the local default (CR132)", () => {
  const { runner, calls } = recordingGit();
  const strategy = cloneStrategy("/repo", "origin/stable", runner);
  assert.equal(strategy.repairGate().ok, true);
  assert.equal(strategy.capture().ok, true);
  assert.equal(strategy.plan("abc1").kind, "ahead");
  assert.equal(strategy.apply("abc1", "origin/stable").ok, true);

  const commands = calls.map((call) => call.args[0]);
  for (const local of ["status", "rev-parse", "rev-list", "merge", "log"]) {
    assert.ok(commands.includes(local), `the walk reached \`git ${local}\``);
  }
  for (const call of calls) {
    assert.equal(call.timeoutMs, undefined, `git ${call.args.join(" ")} asked for a budget`);
  }
});
