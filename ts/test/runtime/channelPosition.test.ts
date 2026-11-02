// CR186 — a clone ahead of its channel only by commits the other channel
// already has is not carrying local work: its channel is behind it.
//
// `runtime update` read every commit in `origin/stable..HEAD` as the person's
// own, and told a clone fast-forwarded to `origin/main` to push or reset. Push
// meant nothing for commits the remote already has, and a reset to `stable`
// can leave a database newer than the code. The package lane already refused
// the same state in better words: a channel behind what is installed, no
// downgrade because migrations do not run backwards, and `runtime channel main`
// as the way out. The clone now says the same.
//
// Graded over a real repository: a `file://` origin whose `stable` is behind
// its `main`, as release promotion leaves them. Every scenario is read three
// ways (the position itself, the update plan, and the welcome card's
// inspection), and the three must agree: the CR's third promise.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { tempDir } from "#helpers/tempDir.ts";
import {
  type ChannelPosition,
  inspectGit,
  inspectGitUpdatePlan,
  readChannelPosition,
} from "#runtime/git.ts";
import { cloneStrategy, defaultGitRunner } from "#runtime/strategies/clone.ts";
import { updateLine } from "#welcome/card.ts";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Mirror Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Mirror Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  GIT_TERMINAL_PROMPT: "0",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" }).trim();
}

interface World {
  clone: string;
  /** Commits by name: `installed` <- `stable` <- `main one` <- `main`. */
  at: Record<"installed" | "stable" | "main", string>;
}

/** An origin where `stable` is one release and `main` two commits past it, cloned and fetched. */
function world(): World {
  const root = tempDir("channel-position-");
  const seed = join(root, "seed");
  const origin = join(root, "origin.git");
  const clone = join(root, "clone");
  git(root, "init", "-q", "--initial-branch=main", seed);
  const commit = (message: string): string => {
    git(seed, "commit", "-q", "--allow-empty", "-m", message);
    return git(seed, "rev-parse", "HEAD");
  };
  const installed = commit("installed");
  const stable = commit("release");
  git(seed, "branch", "stable");
  commit("main one");
  const main = commit("main two");
  git(root, "init", "-q", "--bare", origin);
  git(seed, "push", "-q", origin, "main", "stable");
  git(root, "clone", "-q", "--branch", "main", origin, clone);
  return { clone, at: { installed, stable, main } };
}

/** Put the clone at a commit, then make `local` commits of its own; returns the short HEAD. */
function place(w: World, at: keyof World["at"], local: number): string {
  git(w.clone, "reset", "-q", "--hard", w.at[at]);
  for (let index = 1; index <= local; index += 1) {
    git(w.clone, "commit", "-q", "--allow-empty", "-m", `local ${index}`);
  }
  return git(w.clone, "rev-parse", "--short", "HEAD");
}

function channelMarker(channel: string) {
  return { value: channel, source: null, note: null };
}

/** The three readings of one state: the position, the update plan, and the inspection. */
function readings(w: World, channel: string, head: string) {
  const upstream = `origin/${channel}`;
  return {
    position: readChannelPosition(w.clone, upstream),
    plan: cloneStrategy(w.clone, upstream, defaultGitRunner).plan(head),
    inspected: inspectGitUpdatePlan(inspectGit(w.clone), channelMarker(channel)),
  };
}

const SCENARIOS: {
  name: string;
  channel: string;
  at: keyof World["at"];
  local: number;
  position: ChannelPosition;
}[] = [
  {
    name: "on its channel",
    channel: "stable",
    at: "stable",
    local: 0,
    position: { kind: "current" },
  },
  {
    name: "behind its channel",
    channel: "stable",
    at: "installed",
    local: 0,
    position: { kind: "pull", behind: 1 },
  },
  {
    name: "ahead only by commits main already has",
    channel: "stable",
    at: "main",
    local: 0,
    position: {
      kind: "channel_behind",
      ahead: 2,
      channel: "stable",
      carriedBy: "main",
      carriedByRef: "origin/main",
    },
  },
  {
    // The case most likely to go wrong: main's commits would hide real work.
    name: "main's commits and one of its own",
    channel: "stable",
    at: "main",
    local: 1,
    position: { kind: "local_commits", ahead: 3 },
  },
  {
    name: "one commit of its own on its channel",
    channel: "stable",
    at: "stable",
    local: 1,
    position: { kind: "local_commits", ahead: 1 },
  },
  {
    name: "diverged from its channel",
    channel: "stable",
    at: "installed",
    local: 1,
    position: { kind: "diverged", ahead: 1, behind: 1 },
  },
  {
    name: "following main, on main",
    channel: "main",
    at: "main",
    local: 0,
    position: { kind: "current" },
  },
  {
    name: "following main, with one commit of its own",
    channel: "main",
    at: "main",
    local: 1,
    position: { kind: "local_commits", ahead: 1 },
  },
];

test("the position, the update plan, and the inspection read every state the same way (CR186)", () => {
  const w = world();
  for (const scenario of SCENARIOS) {
    const head = place(w, scenario.at, scenario.local);
    const { position, plan, inspected } = readings(w, scenario.channel, head);
    assert.deepEqual(position, scenario.position, `${scenario.name}: position`);

    switch (position.kind) {
      case "current":
        assert.equal(plan.kind, "current", `${scenario.name}: plan`);
        assert.equal(inspected.action, "none", `${scenario.name}: inspection`);
        break;
      case "pull":
        assert.equal(plan.kind, "ahead", `${scenario.name}: plan`);
        assert.equal(inspected.action, "pull", `${scenario.name}: inspection`);
        assert.equal(inspected.behind, position.behind, `${scenario.name}: inspection count`);
        break;
      default:
        // Refused by both, in the same words.
        assert.equal(plan.kind, "blocked", `${scenario.name}: plan`);
        assert.equal(inspected.action, "blocked", `${scenario.name}: inspection`);
        assert.equal(inspected.ready, false, `${scenario.name}: inspection readiness`);
        if (plan.kind === "blocked") {
          assert.equal(inspected.note, plan.detail, `${scenario.name}: the same words`);
        }
    }
  }
});

test("a stable clone ahead only by main's commits is told stable is behind it, never to push or reset (CR186)", () => {
  const w = world();
  const head = place(w, "main", 0);
  const { plan } = readings(w, "stable", head);
  assert.equal(plan.kind, "blocked");
  if (plan.kind !== "blocked") return;
  assert.equal(plan.detail, "'stable' is behind this checkout (2 commit(s), all on origin/main)");
  assert.deepEqual(plan.recovery, [
    "A downgrade is refused: migrations do not run backwards.",
    `Follow the channel that carries ${head}: runtime channel main`,
    `Or stay on ${head} until 'stable' reaches it: the next release contains these commits.`,
    "The working tree and the database are unchanged.",
  ]);
  for (const line of [plan.detail, ...plan.recovery]) {
    assert.doesNotMatch(line, /\bpush\b|\breset\b/i, `advice a person should not follow: ${line}`);
  }
  // And the welcome card announces nothing: there is nothing on stable to take.
  assert.equal(updateLine(channelMarker("stable"), null, inspectGit(w.clone)), null);
});

test("real local work keeps today's refusal and its push-or-reset advice (CR186)", () => {
  const w = world();
  const head = place(w, "main", 1);
  const { plan } = readings(w, "stable", head);
  assert.equal(plan.kind, "blocked");
  if (plan.kind !== "blocked") return;
  assert.equal(plan.detail, "local commits present");
  assert.deepEqual(plan.recovery, [
    "Local branch is ahead of upstream; push or reset before updating.",
    "The working tree and the database are unchanged.",
    `Current commit: ${head}`,
  ]);
});

test("without the other channel's ref, the commits read as local work, never as published (CR186)", () => {
  // A single-branch clone, or one whose origin/main was never fetched: the
  // count that would prove the commits published cannot run, and the answer
  // falls back to the refusal a clone always had.
  const w = world();
  const head = place(w, "main", 0);
  git(w.clone, "update-ref", "-d", "refs/remotes/origin/main");
  const { position, plan, inspected } = readings(w, "stable", head);
  assert.deepEqual(position, { kind: "local_commits", ahead: 2 });
  assert.equal(plan.kind, "blocked");
  assert.equal(plan.kind === "blocked" ? plan.detail : null, "local commits present");
  assert.equal(inspected.note, "local commits present");
});
