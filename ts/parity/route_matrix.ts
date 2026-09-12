/**
 * Install-state route inspector and revert-matrix check (CV22.DS8.US3).
 *
 * Two questions, one command, no network and no writes:
 *
 *   1. **What does THIS install do right now?** Every provider-backed leaf,
 *      routed against the real environment — including whatever `.env`
 *      supplies when run with `--env-file=.env`. `routing.test.ts` cannot
 *      answer this: it asserts the rules against synthetic environments, which
 *      is the right thing for CI and the wrong thing for "is my machine
 *      configured the way I believe it is".
 *
 *   2. **Do the contracts still hold?** Each family reverts with one variable
 *      and takes nothing else with it; half a replay fixture refuses by name
 *      rather than going live; the retired DS5 gate is inert; and a leaf a
 *      story still blocks says which story. Expectations are declared here and
 *      checked, so the output is a VERDICT rather than twenty lines to read.
 *
 * Usage:
 *   node --env-file=.env ts/parity/route_matrix.ts        # state + contracts
 *   node ts/parity/route_matrix.ts --contracts-only       # ignore local config
 */

import { type RouteEnvironment, routeMemoryCommand } from "#frontDoor/routing.ts";

interface Expectation {
  label: string;
  leaf: string;
  env: RouteEnvironment;
  engine: "ts" | "python";
  /** A fragment the reason must contain, so a right answer for a wrong reason fails. */
  reason: string;
}

/**
 * The DS8 done condition, executable: "every family keeps a single-variable
 * revert to Python until DS10 deletes it" — and, just as important, that the
 * revert takes NOTHING ELSE with it. A family switch that also reverted a
 * deterministic read would be a worse outage than the one it was reaching for.
 */
const REVERTS: Expectation[] = [
  rev("consult credits", "consult credits", "MIRROR_TS_CONSULT"),
  rev("consult ask", "consult openai question", "MIRROR_TS_CONSULT"),
  rev("mirror load --query", "mirror load --query x", "MIRROR_TS_MIRROR_QUERY"),
  rev("journal", "journal an entry", "MIRROR_TS_JOURNAL"),
  rev("week plan", "week plan text", "MIRROR_TS_WEEK"),
  rev("descriptor generate", "descriptor generate", "MIRROR_TS_DESCRIPTOR"),
  rev("soul harvest save", "soul harvest save", "MIRROR_TS_SOUL"),
  rev("consolidate apply", "consolidate apply abc", "MIRROR_TS_CULTIVATION"),
  rev("memories --search", "memories --search q", "MIRROR_TS_SEARCH"),
];

/** What each revert must NOT drag back to Python. */
const BYSTANDERS: Expectation[] = [
  stays("deterministic mirror load", "mirror load", { MIRROR_TS_MIRROR_QUERY: "0" }, "DS7.US4"),
  stays("week view", "week view", { MIRROR_TS_WEEK: "0" }, "DS7.US2"),
  stays("week save", "week save", { MIRROR_TS_WEEK: "1" }, "DS7.US11"),
  stays("consolidate list", "consolidate list", { MIRROR_TS_CULTIVATION: "0" }, "DS7.US3"),
  stays("shadow list", "shadow list abc", { MIRROR_TS_CULTIVATION: "0" }, "DS7.US3"),
  stays("soul listen", "soul listen", { MIRROR_TS_SOUL: "1" }, "DS7.US6"),
  stays("memories listing", "memories", { MIRROR_TS_SEARCH: "0" }, "DS2"),
];

/**
 * Half a fixture must refuse BY NAME. Falling back to Python would not be
 * safer: Python has no replay transport and would reach the live provider
 * anyway — spending real money on the other engine while you believed you were
 * replaying (CR077).
 */
const REPLAY_PAIRS: Expectation[] = [
  {
    label: "journal, LLM half only",
    leaf: "journal x",
    env: { MIRROR_TS_JOURNAL_LLM_REPLAY: "/tmp/l.json" },
    engine: "python",
    reason: "MIRROR_TS_JOURNAL_EMBEDDING_REPLAY missing",
  },
  {
    label: "journal, embedding half only",
    leaf: "journal x",
    env: { MIRROR_TS_JOURNAL_EMBEDDING_REPLAY: "/tmp/e.json" },
    engine: "python",
    reason: "MIRROR_TS_JOURNAL_LLM_REPLAY missing",
  },
  {
    label: "mirror query, embedding half only",
    leaf: "mirror load --query x",
    env: { MIRROR_TS_MIRROR_EMBEDDING_REPLAY: "/tmp/e.json" },
    engine: "python",
    reason: "incomplete replay fixture",
  },
  {
    label: "consult ask, credits fixture only",
    leaf: "consult openai q",
    env: { MIRROR_TS_CREDITS_REPLAY: "/tmp/c.json" },
    engine: "python",
    reason: "MIRROR_TS_CONSULT_LLM_REPLAY missing",
  },
  {
    // The deliberate asymmetry: the same variable that is HALF a fixture for
    // `ask` is a COMPLETE one for `credits`, which needs no chat provider.
    label: "consult credits, credits fixture only",
    leaf: "consult credits",
    env: { MIRROR_TS_CREDITS_REPLAY: "/tmp/c.json" },
    engine: "ts",
    reason: "replay transport",
  },
  {
    // MEMORY_RECEPTION=0 removes the classifier on both engines, after which
    // the embedding fixture alone is a complete replay setup.
    label: "mirror query, no reception, embedding only",
    leaf: "mirror load --query x",
    env: { MIRROR_TS_MIRROR_EMBEDDING_REPLAY: "/tmp/e.json", MEMORY_RECEPTION: "0" },
    engine: "ts",
    reason: "replay transport",
  },
];

/** A leaf a story still blocks must say WHICH story, not merely refuse. */
const STORY_GATES: Expectation[] = [
  {
    label: "consolidate scan",
    leaf: "consolidate scan",
    env: {},
    engine: "python",
    reason: "live blocked by DS8.TS2",
  },
  {
    label: "shadow scan",
    leaf: "shadow scan",
    env: {},
    engine: "python",
    reason: "live blocked by DS8.TS2",
  },
];

/** Every leaf whose live default this story established. */
const LIVE_LEAVES = [
  "consult credits",
  "consult openai question",
  "mirror load --query x",
  "journal an entry",
  "week plan text",
  "descriptor generate",
  "soul harvest save",
  "consolidate apply abc",
  "memories --search q",
];

function rev(label: string, leaf: string, variable: string): Expectation {
  return { label, leaf, env: { [variable]: "0" }, engine: "python", reason: `${variable}=0` };
}

function stays(label: string, leaf: string, env: RouteEnvironment, reason: string): Expectation {
  return { label, leaf, env, engine: "ts", reason };
}

let failures = 0;

function assertRoute(expectation: Expectation): void {
  const decision = routeMemoryCommand(expectation.leaf.split(" "), expectation.env);
  const ok = decision.engine === expectation.engine && decision.reason.includes(expectation.reason);
  if (!ok) failures += 1;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${expectation.label.padEnd(38)} ${decision.engine.padEnd(7)} ${
      decision.reason
    }`,
  );
}

function section(title: string, expectations: readonly Expectation[]): void {
  console.log(`\n${title}`);
  for (const expectation of expectations) assertRoute(expectation);
}

const contractsOnly = process.argv.includes("--contracts-only");

if (!contractsOnly) {
  // Reads the REAL environment, `.env` included. This is the part that answers
  // "what will my next command actually do".
  console.log("this install, right now");
  for (const leaf of LIVE_LEAVES) {
    const decision = routeMemoryCommand(leaf.split(" "));
    console.log(`  ${leaf.padEnd(30)} ${decision.engine.padEnd(7)} ${decision.reason}`);
  }
  for (const leaf of ["consolidate scan", "shadow scan"]) {
    const decision = routeMemoryCommand(leaf.split(" "));
    console.log(`  ${leaf.padEnd(30)} ${decision.engine.padEnd(7)} ${decision.reason}`);
  }
}

section("one variable reverts each family", REVERTS);
section("and takes nothing else with it", BYSTANDERS);
section("half a replay fixture refuses by name", REPLAY_PAIRS);
section("a story-blocked leaf names the story", STORY_GATES);

// The retired DS5 gate: a leftover value must change NOTHING, in either
// direction. Compared against a clean run rather than asserted line by line.
console.log("\nthe retired MIRROR_TS_EXTERNAL_ROUTES gate is inert");
for (const leaf of [...LIVE_LEAVES, "consolidate scan"]) {
  const clean = routeMemoryCommand(leaf.split(" "), {});
  const staleOn = routeMemoryCommand(leaf.split(" "), { MIRROR_TS_EXTERNAL_ROUTES: "1" });
  const staleOff = routeMemoryCommand(leaf.split(" "), { MIRROR_TS_EXTERNAL_ROUTES: "0" });
  const ok =
    staleOn.engine === clean.engine &&
    staleOff.engine === clean.engine &&
    staleOn.reason === clean.reason &&
    staleOff.reason === clean.reason;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${leaf.padEnd(38)} unchanged at =1 and =0`);
}

console.log(
  failures === 0
    ? "\nPASS route matrix — every contract holds"
    : `\nFAIL route matrix — ${failures} contract(s) broken`,
);
process.exit(failures === 0 ? 0 : 1);
