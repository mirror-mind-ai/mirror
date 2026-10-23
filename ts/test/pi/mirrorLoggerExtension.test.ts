// CV9.E2.S32 — the Pi `mirror-logger` extension, driven by a fake `pi`.
//
// The extension is a thin dispatcher: every event becomes a front-door
// process. What this harness grades is the dispatching itself — which argv
// goes out, and in what ORDER the processes are spawned relative to each
// other — not what the front door does with them (the route tests do that).
//
// The file under test is loaded through a computed-path dynamic `import()`:
// it lives outside `tsconfig`'s `include`, and its one external import is
// `import type` from Pi, erased at load. A literal path would make `tsc`
// resolve that package for a file Pi itself typechecks when it loads it.
//
// Assertion messages never carry argv payloads (`hookPayloadRedaction.test.ts`
// discipline): a failing test must not print a prompt.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { delimiter, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXTENSION_PATH = new URL("../../../.pi/extensions/mirror-logger.ts", import.meta.url)
  .pathname;
const LOADED_KEY = "__mirrorLoggerRegistered";

// The extension resolves where `mirror-logger.log` goes ONCE, at module load,
// from `MEMORY_DIR`. Point it at a directory of this file's own before the
// first import; every harness below reads only the tail written since it
// started. `node --test` runs each file in its own process, so this env write
// reaches nothing else.
const LOG_DIR = mkdtempSync("/tmp/mirror-logger-ext-");
process.env.MEMORY_DIR = LOG_DIR;
const LOG_PATH = join(LOG_DIR, "mirror-logger.log");
test.after(() => rmSync(LOG_DIR, { recursive: true, force: true }));

// The extension warns at session_start when `mirror` does not resolve on the
// PATH (CV22.DS10.US3). Whether it does is a fact about the host, not about
// the test: a developer's `npm link` puts it there, a CI runner has none. So
// the harness supplies its own, the way `npm link` does -- `mirror` pointing
// at this tree's bin -- first on the PATH for every test; the one test about
// the warning takes it away.
const LINKED_BIN_DIR = mkdtempSync("/tmp/mirror-logger-ext-bin-");
symlinkSync(
  fileURLToPath(new URL("../../../bin/mirror.js", import.meta.url)),
  join(LINKED_BIN_DIR, "mirror"),
);
process.env.PATH = `${LINKED_BIN_DIR}${delimiter}${process.env.PATH ?? ""}`;
test.after(() => rmSync(LINKED_BIN_DIR, { recursive: true, force: true }));

// --- the fake pi -----------------------------------------------------------

interface Deferred {
  args: string[];
  /** Set by the test to let the exec "exit". */
  resolve: (stdout: string) => void;
  reject: (error: Error) => void;
  settled: boolean;
}

type Handler = (event: unknown, ctx: unknown) => Promise<unknown> | unknown;

interface FakePi {
  handlers: Map<string, Handler[]>;
  execs: Deferred[];
  on(event: string, handler: Handler): () => void;
  exec(
    command: string,
    args: string[],
    options?: unknown,
  ): Promise<{ stdout: string; stderr: string }>;
}

function fakePi(): FakePi {
  const handlers = new Map<string, Handler[]>();
  const execs: Deferred[] = [];
  return {
    handlers,
    execs,
    on(event, handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return () => {};
    },
    exec(_command, args) {
      return new Promise((resolve, reject) => {
        const deferred: Deferred = {
          args,
          settled: false,
          resolve: (stdout) => {
            deferred.settled = true;
            resolve({ stdout, stderr: "" });
          },
          reject: (error) => {
            deferred.settled = true;
            reject(error);
          },
        };
        execs.push(deferred);
      });
    },
  };
}

interface FakeCtx {
  hasUI: boolean;
  sessionManager: { getSessionFile(): string | undefined };
  ui: {
    statuses: string[];
    notices: string[];
    setStatus(key: string, value: string | undefined): void;
    notify(message: string, level: string): void;
  };
}

function fakeCtx(sessionFile: string | undefined, hasUI = true): FakeCtx {
  const statuses: string[] = [];
  const notices: string[] = [];
  return {
    hasUI,
    sessionManager: { getSessionFile: () => sessionFile },
    ui: {
      statuses,
      notices,
      setStatus: (_key, value) => statuses.push(value ?? ""),
      notify: (message) => notices.push(message),
    },
  };
}

// --- loading the extension ------------------------------------------------

interface Harness {
  pi: FakePi;
  /** Fire one event through every handler the extension registered for it. */
  fire(event: string, payload: unknown, ctx: unknown): Promise<void>;
  /** Fire and return without waiting for the handlers to settle. */
  fireNoWait(event: string, payload: unknown, ctx: unknown): Promise<void>;
  /** The argv of every exec so far, bin path stripped: `["conversation-logger", ...]`. */
  commands(): string[][];
  /** The detached spawns are not `pi.exec`; they leave a line in the log instead. */
  logLines(): string[];
  /**
   * Resolve every exec still pending with empty stdout, repeatedly, until
   * `until` settles. For the tail of a handler the test has no opinion about
   * (the `agent_end` status refresh, the shutdown backup).
   */
  drain(until: Promise<void>): Promise<void>;
  cleanup(): void;
}

let extensionModule: { default: (pi: unknown) => void } | null = null;

async function loadExtension(): Promise<{ default: (pi: unknown) => void }> {
  if (!extensionModule) {
    extensionModule = (await import(pathToFileURL(EXTENSION_PATH).href)) as {
      default: (pi: unknown) => void;
    };
  }
  return extensionModule;
}

async function harness(env: Record<string, string> = {}): Promise<Harness> {
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  const mod = await loadExtension();
  // The extension registers once per process; each harness is a fresh registration.
  (globalThis as Record<string, unknown>)[LOADED_KEY] = undefined;
  const pi = fakePi();
  mod.default(pi);
  const logMark = (() => {
    try {
      return readFileSync(LOG_PATH, "utf8").length;
    } catch {
      return 0;
    }
  })();

  const run = (event: string, payload: unknown, ctx: unknown): Promise<void>[] =>
    (pi.handlers.get(event) ?? []).map((handler) =>
      Promise.resolve(handler(payload, ctx)).then(() => undefined),
    );

  return {
    pi,
    fire: async (event, payload, ctx) => {
      await Promise.all(run(event, payload, ctx));
    },
    fireNoWait: (event, payload, ctx) => {
      const all = Promise.all(run(event, payload, ctx)).then(() => undefined);
      // Let the handlers reach their first await.
      return new Promise((resolve) => setImmediate(() => resolve(all)));
    },
    commands: () => pi.execs.map((d) => d.args.slice(1)),
    drain: async (until) => {
      let done = false;
      void until.then(
        () => (done = true),
        () => (done = true),
      );
      for (let i = 0; i < 50 && !done; i += 1) {
        for (const d of pi.execs) if (!d.settled) d.resolve("");
        await new Promise((resolve) => setImmediate(resolve));
      }
      await until;
    },
    logLines: () => {
      try {
        return readFileSync(LOG_PATH, "utf8").slice(logMark).split("\n").filter(Boolean);
      } catch {
        return [];
      }
    },
    cleanup: () => {
      for (const key of Object.keys(env)) delete process.env[key];
    },
  };
}

/** Wait for the microtask queue to drain so chained promises advance. */
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const ENVELOPE = JSON.stringify({
  schemaVersion: "1.0.0",
  sessionStart: "Conversation logging ACTIVE. Maintenance deferred.",
  welcome: "◇ Mirror · test\n\n→ Where shall we begin?",
  statusLine: "◇ test · ◌ Mirror Mode · ✓",
});

/** What Pi hands `before_agent_start`: the prompt, plus the context files the AGENTS.md handler reads. */
const promptEvent = (prompt: string) => ({
  type: "before_agent_start",
  prompt,
  systemPromptOptions: { contextFiles: [] as { path: string; content: string }[] },
});

const agentEndEvent = (text: string) => ({
  type: "agent_end",
  messages: [{ role: "assistant", content: [{ type: "text", text }] }],
});

// --- session_start -----------------------------------------------------------

test("session_start makes one composite exec and feeds the card and status line from its envelope", async () => {
  const h = await harness();
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    const done = h.fireNoWait("session_start", { type: "session_start", reason: "startup" }, ctx);
    assert.equal(h.pi.execs.length, 1, "one awaited front-door process");
    assert.deepEqual(h.commands()[0], [
      "conversation-logger",
      "session-start",
      "--fast",
      "--welcome",
      "--format",
      "json",
      "--session-id",
      "/sessions/a.jsonl",
    ]);
    h.pi.execs[0]?.resolve(ENVELOPE);
    await done;

    assert.equal(h.pi.execs.length, 1, "no second exec: welcome and status came from the envelope");
    assert.deepEqual(ctx.ui.notices, ["◇ Mirror · test\n\n→ Where shall we begin?"]);
    assert.match(ctx.ui.statuses.at(-1) ?? "", /^◇ test · ◌ Mirror Mode · ✓( · ext \d+)?$/);
    assert.ok(
      h.logLines().some((l) => l.includes("session-maintenance started in detached background")),
    );
  } finally {
    h.cleanup();
  }
});

test("session_start with an empty welcome notifies nothing", async () => {
  const h = await harness();
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    const done = h.fireNoWait("session_start", { type: "session_start", reason: "startup" }, ctx);
    h.pi.execs[0]?.resolve(
      JSON.stringify({
        schemaVersion: "1.0.0",
        sessionStart: "ok",
        welcome: "",
        statusLine: "◇ x",
      }),
    );
    await done;
    assert.deepEqual(ctx.ui.notices, []);
    assert.match(ctx.ui.statuses.at(-1) ?? "", /^◇ x( · ext \d+)?$/);
  } finally {
    h.cleanup();
  }
});

test("session_start with unreadable stdout warns, notifies nothing, and falls back to the ? status", async () => {
  const h = await harness();
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    const done = h.fireNoWait("session_start", { type: "session_start", reason: "startup" }, ctx);
    h.pi.execs[0]?.resolve("not json at all");
    await done;
    assert.deepEqual(ctx.ui.notices, []);
    assert.match(ctx.ui.statuses.at(-1) ?? "", /^◇ Mirror · \?( · ext \d+)?$/);
    assert.ok(h.logLines().some((l) => l.includes("[WARN] session-open envelope unreadable")));
  } finally {
    h.cleanup();
  }
});

test("session_start without a UI still opens the session and detaches maintenance", async () => {
  const h = await harness();
  try {
    const ctx = fakeCtx(undefined, false);
    const done = h.fireNoWait("session_start", { type: "session_start", reason: "startup" }, ctx);
    assert.deepEqual(h.commands()[0], [
      "conversation-logger",
      "session-start",
      "--fast",
      "--welcome",
      "--format",
      "json",
    ]);
    h.pi.execs[0]?.resolve(ENVELOPE);
    await done;
    assert.deepEqual(ctx.ui.statuses, []);
    assert.ok(h.logLines().some((l) => l.includes("session-maintenance started")));
  } finally {
    h.cleanup();
  }
});

test("session_start without `mirror` on the PATH warns before the card, naming the fix, and still opens the session", async () => {
  // A PATH that still finds `node`, which the detached maintenance spawn
  // needs, and finds no `mirror`. `node`'s own directory will not do: on a
  // Homebrew host it holds the global package's `mirror` too.
  const bareBinDir = mkdtempSync("/tmp/mirror-logger-ext-bare-");
  symlinkSync(process.execPath, join(bareBinDir, "node"));
  const savedPath = process.env.PATH;
  process.env.PATH = bareBinDir;
  const h = await harness();
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    const done = h.fireNoWait("session_start", { type: "session_start", reason: "startup" }, ctx);
    h.pi.execs[0]?.resolve(ENVELOPE);
    await done;

    assert.equal(ctx.ui.notices.length, 2, "the warning, then the card");
    assert.match(
      ctx.ui.notices[0] ?? "",
      /^Mirror: `mirror` is not on the PATH — (run `npm link` once in .+|add `\$\(npm prefix -g\)\/bin` to the PATH)\. Skills will fail until it is\.$/,
    );
    assert.equal(ctx.ui.notices[1], "◇ Mirror · test\n\n→ Where shall we begin?");
    assert.equal(h.pi.execs.length, 1, "the session still opened through the composite");
    assert.ok(h.logLines().some((l) => l.includes("[WARN] Mirror: `mirror` is not on the PATH")));
    assert.ok(h.logLines().some((l) => l.includes("session-maintenance started")));
  } finally {
    process.env.PATH = savedPath;
    h.cleanup();
    rmSync(bareBinDir, { recursive: true, force: true });
  }
});

// --- before_agent_start: the turn, as typed, to the core's prompt rule (CR160) ------

/** The JSON a `user-prompt` or `stop` command carries after `--payload`. */
function payloadOf(command: string[] | undefined): Record<string, unknown> {
  const index = command?.indexOf("--payload") ?? -1;
  assert.ok(command && index !== -1, "the command carries --payload");
  return JSON.parse(command[index + 1] as string) as Record<string, unknown>;
}

/** The front-door commands the logger ran, without the status refreshes. */
const loggerCommands = (h: Harness): string[][] =>
  h.commands().filter((command) => command[0] === "conversation-logger");

const inputEvent = (text: string, streamingBehavior?: "steer" | "followUp") => ({
  type: "input",
  text,
  source: "interactive",
  ...(streamingBehavior ? { streamingBehavior } : {}),
});

/** What Pi hands `before_agent_start` for `/skill:<name> args`: the skill, expanded. */
const expandedSkill = (name: string, args = ""): string =>
  `<skill name="${name}" location="/tree/.pi/skills/${name}/SKILL.md">\n` +
  `References are relative to /tree/.pi/skills/${name}.\n\n# Body\n\nRun the thing.\n</skill>` +
  (args ? `\n\n${args}` : "");

const settledEvent = { type: "agent_settled", aborted: false };

test("before_agent_start returns while user-prompt is still running", async () => {
  const h = await harness();
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    await h.fire("before_agent_start", promptEvent("hello"), ctx);
    assert.equal(h.pi.execs.length, 1);
    const command = h.commands()[0];
    assert.deepEqual(command?.slice(0, 4), [
      "conversation-logger",
      "user-prompt",
      "--interface",
      "pi",
    ]);
    const payload = payloadOf(command);
    assert.equal(payload.session_id, "/sessions/a.jsonl");
    assert.equal(payload.prompt, "hello");
    assert.equal(typeof payload.turn_id, "string");
    assert.ok((payload.turn_id as string).length > 0, "a turn id is minted");
    assert.equal(h.pi.execs[0]?.settled, false, "the handler settled before the process did");
  } finally {
    h.cleanup();
  }
});

test("two prompts in a row serialize: the second user-prompt starts only after the first exits", async () => {
  const h = await harness();
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    await h.fire("before_agent_start", promptEvent("one"), ctx);
    await h.fire("before_agent_start", promptEvent("two"), ctx);
    await tick();
    assert.equal(h.pi.execs.length, 1, "the second is queued, not spawned");
    h.pi.execs[0]?.resolve("");
    await tick();
    assert.equal(h.pi.execs.length, 2, "the second spawned after the first exited");
    assert.notEqual(
      payloadOf(h.commands()[0]).turn_id,
      payloadOf(h.commands()[1]).turn_id,
      "each prompt has its own turn",
    );
  } finally {
    h.cleanup();
  }
});

test("what reaches the core is what the person typed, not Pi's expansion of it", async () => {
  // Picking a skill from Pi's menu sends `/skill:<name>`, and Pi hands
  // `before_agent_start` the skill's whole body (CR159 measured it). The `input`
  // event carried the text as typed; that is what the rule reads.
  const h = await harness();
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    await h.fire("input", inputEvent("/skill:mm-journeys"), ctx);
    await h.fire("before_agent_start", promptEvent(expandedSkill("mm-journeys")), ctx);
    assert.equal(payloadOf(h.commands()[0]).prompt, "/skill:mm-journeys");
  } finally {
    h.cleanup();
  }
});

test("a slash command goes to the core's rule as typed, which decides it is one", async () => {
  // Before CR160 the extension skipped it here and still logged its reply.
  const h = await harness();
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    await h.fire("input", inputEvent("/mm-help"), ctx);
    await h.fire("before_agent_start", promptEvent("/mm-help"), ctx);
    assert.equal(loggerCommands(h).length, 1);
    assert.equal(loggerCommands(h)[0]?.[1], "user-prompt");
    assert.equal(payloadOf(loggerCommands(h)[0]).prompt, "/mm-help");
  } finally {
    h.cleanup();
  }
});

test("input queued while Pi streams is not taken for the next run", async () => {
  const h = await harness();
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    await h.fire("input", inputEvent("/skill:mm-journeys", "followUp"), ctx);
    await h.fire("before_agent_start", promptEvent("what changed today?"), ctx);
    assert.equal(payloadOf(h.commands()[0]).prompt, "what changed today?");
  } finally {
    h.cleanup();
  }
});

test("with nothing typed kept for a run, Pi's skill wrapper is read back to its command", async () => {
  const h = await harness();
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    await h.fire(
      "before_agent_start",
      promptEvent(expandedSkill("mm-mirror", "should I raise my price?")),
      ctx,
    );
    h.pi.execs[0]?.resolve("");
    await tick();
    await h.fire("before_agent_start", promptEvent(expandedSkill("mm-journeys")), ctx);
    await tick();
    const prompts = loggerCommands(h).map((command) => payloadOf(command).prompt);
    assert.deepEqual(prompts, ["/skill:mm-mirror should I raise my price?", "/skill:mm-journeys"]);
  } finally {
    h.cleanup();
  }
});

test("a run a custom message started sends nothing", async () => {
  const h = await harness();
  try {
    await h.fire(
      "before_agent_start",
      { ...promptEvent(""), messageType: "custom", prompt: undefined },
      fakeCtx("/sessions/a.jsonl"),
    );
    assert.equal(h.pi.execs.length, 0);
  } finally {
    h.cleanup();
  }
});

// --- agent_end and agent_settled: one reply per prompt (CR160) -----------------------

test("agent_settled sends one stop for the prompt, with every run's text, under its turn", async () => {
  const h = await harness();
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    await h.fire("before_agent_start", promptEvent("hello"), ctx);
    const turnId = payloadOf(h.commands()[0]).turn_id as string;
    h.pi.execs[0]?.resolve("");
    await h.drain(h.fireNoWait("agent_end", agentEndEvent("first run"), ctx));
    await h.drain(h.fireNoWait("agent_end", agentEndEvent("second run"), ctx));
    assert.ok(!h.logLines().some((l) => l.includes("stop started")), "nothing sent per run");
    await h.fire("agent_settled", settledEvent, ctx);
    const started = h.logLines().filter((l) => l.includes("stop started in detached background"));
    assert.equal(started.length, 1, "one stop for the prompt");
    assert.ok(
      h.logLines().some((l) => l.includes(`stop (turn ${turnId}): 2 block(s)`)),
      "the reply carries both runs, under the prompt's turn",
    );
  } finally {
    h.cleanup();
  }
});

test("agent_settled spawns stop only after the pending user-prompt has exited", async () => {
  const h = await harness();
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    await h.fire("before_agent_start", promptEvent("hello"), ctx);
    const end = h.fireNoWait("agent_end", agentEndEvent("answer"), ctx);
    const settled = h.fireNoWait("agent_settled", settledEvent, ctx);
    await tick();
    assert.ok(
      !h.logLines().some((l) => l.includes("stop started")),
      "not yet: user-prompt still running",
    );
    h.pi.execs[0]?.resolve("");
    await h.drain(Promise.all([end, settled]).then(() => undefined));
    assert.ok(h.logLines().some((l) => l.includes("stop started in detached background")));
  } finally {
    h.cleanup();
  }
});

test("agent_settled still sends stop when user-prompt failed or timed out", async () => {
  for (const failure of ["exit 1", "timeout after 30000ms"]) {
    const h = await harness();
    try {
      const ctx = fakeCtx("/sessions/a.jsonl");
      await h.fire("before_agent_start", promptEvent("hello"), ctx);
      const end = h.fireNoWait("agent_end", agentEndEvent("answer"), ctx);
      const settled = h.fireNoWait("agent_settled", settledEvent, ctx);
      h.pi.execs[0]?.reject(new Error(failure));
      await h.drain(Promise.all([end, settled]).then(() => undefined));
      assert.ok(h.logLines().some((l) => l.includes("stop started in detached background")));
    } finally {
      h.cleanup();
    }
  }
});

test("a prompt with no assistant text sends no stop, and the chain stays intact", async () => {
  const h = await harness();
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    await h.fire("before_agent_start", promptEvent("hello"), ctx);
    await h.fire("agent_end", { type: "agent_end", messages: [] }, ctx);
    await h.fire("agent_settled", { type: "agent_settled", aborted: true }, ctx);
    assert.ok(!h.logLines().some((l) => l.includes("stop started")));
    assert.equal(h.pi.execs[0]?.settled, false, "the aborted prompt did not wait on the chain");
  } finally {
    h.cleanup();
  }
});

test("a Pi without agent_settled: the reply goes out before the next prompt, on the chain", async () => {
  // `agent_settled` arrived in Pi 0.80.4; before it, nothing marks a prompt's end
  // but the next prompt, or the session's.
  const h = await harness();
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    await h.fire("before_agent_start", promptEvent("one"), ctx);
    const firstTurn = payloadOf(h.commands()[0]).turn_id;
    h.pi.execs[0]?.resolve("");
    await h.drain(h.fireNoWait("agent_end", agentEndEvent("answer one"), ctx));
    await h.fire("before_agent_start", promptEvent("two"), ctx);
    await h.drain(tick());
    const commands = loggerCommands(h);
    assert.deepEqual(
      commands.map((command) => command[1]),
      ["user-prompt", "stop", "user-prompt"],
      "the reply between its prompt and the next",
    );
    assert.equal(payloadOf(commands[1]).turn_id, firstTurn);
    assert.equal(payloadOf(commands[1]).last_assistant_message, "answer one");
    assert.equal(payloadOf(commands[2]).prompt, "two");
  } finally {
    h.cleanup();
  }
});

// --- session_shutdown --------------------------------------------------------

test("session_shutdown runs session-end-pi only after the pending user-prompt has exited", async () => {
  const h = await harness();
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    await h.fire("before_agent_start", promptEvent("hello"), ctx);
    const shutdown = h.fireNoWait("session_shutdown", { type: "session_shutdown" }, ctx);
    await tick();
    assert.equal(h.pi.execs.length, 1, "session-end-pi not spawned while user-prompt runs");
    h.pi.execs[0]?.resolve("");
    await tick();
    assert.equal(h.pi.execs.length, 2);
    assert.deepEqual(h.commands()[1], [
      "conversation-logger",
      "session-end-pi",
      "/sessions/a.jsonl",
    ]);
    h.pi.execs[1]?.resolve("");
    await tick();
    assert.deepEqual(h.commands()[2], ["backup", "--silent"]);
    h.pi.execs[2]?.resolve("");
    await shutdown;
  } finally {
    h.cleanup();
  }
});

test("session_shutdown sends a reply still unsent before it closes the conversation", async () => {
  const h = await harness();
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    await h.fire("before_agent_start", promptEvent("hello"), ctx);
    h.pi.execs[0]?.resolve("");
    await h.drain(h.fireNoWait("agent_end", agentEndEvent("answer"), ctx));
    await h.drain(h.fireNoWait("session_shutdown", { type: "session_shutdown" }, ctx));
    assert.deepEqual(
      loggerCommands(h).map((command) => command[1]),
      ["user-prompt", "stop", "session-end-pi"],
    );
  } finally {
    h.cleanup();
  }
});

test("a session switch does not gate the new session on the old one's chain", async () => {
  const h = await harness();
  try {
    const ctxA = fakeCtx("/sessions/a.jsonl");
    const ctxB = fakeCtx("/sessions/b.jsonl");
    await h.fire("before_agent_start", promptEvent("on A"), ctxA);
    const start = h.fireNoWait(
      "session_start",
      { type: "session_start", reason: "new", previousSessionFile: "/sessions/a.jsonl" },
      ctxB,
    );
    assert.equal(h.pi.execs.length, 2, "B's session open spawned while A's user-prompt still runs");
    h.pi.execs[1]?.resolve(ENVELOPE);
    await start;
    await h.fire("before_agent_start", promptEvent("on B"), ctxB);
    assert.equal(h.pi.execs.length, 3, "B's user-prompt did not wait for A's");
    h.pi.execs[2]?.resolve("");
    const end = h.fireNoWait("agent_end", agentEndEvent("answer on B"), ctxB);
    await tick();
    await h.fire("agent_settled", settledEvent, ctxB);
    assert.ok(
      h.logLines().some((l) => l.includes("stop started")),
      "B's reply did not wait for A",
    );
    assert.equal(h.pi.execs[0]?.settled, false, "A's write is still in flight, untouched");
    await h.drain(end);
  } finally {
    h.cleanup();
  }
});

// --- the test knob -----------------------------------------------------------

test("MIRROR_TEST_FRONT_DOOR_DELAY_MS delays the exec only under MEMORY_ENV=test", async () => {
  const h = await harness({ MEMORY_ENV: "test", MIRROR_TEST_FRONT_DOOR_DELAY_MS: "40" });
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    await h.fire("before_agent_start", promptEvent("hello"), ctx);
    assert.equal(h.pi.execs.length, 0, "not spawned yet: the knob is sleeping");
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(h.pi.execs.length, 1, "spawned after the delay");
  } finally {
    h.cleanup();
  }
});

test("the knob is inert outside MEMORY_ENV=test", async () => {
  const h = await harness({ MEMORY_ENV: "", MIRROR_TEST_FRONT_DOOR_DELAY_MS: "5000" });
  try {
    const ctx = fakeCtx("/sessions/a.jsonl");
    await h.fire("before_agent_start", promptEvent("hello"), ctx);
    await tick();
    assert.equal(h.pi.execs.length, 1, "spawned at once");
  } finally {
    h.cleanup();
  }
});
