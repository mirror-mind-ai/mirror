// CR148 — a closed stdout or stderr ends the command quietly.
//
// `mirror ext <id> | head -1` used to die with `Unhandled 'error' event` and a
// stack trace: nothing listened for `error` on `process.stdout`. The unit
// tests pin the one handler's rules on fake streams; the integration test
// reproduces the trace against the real front door and asserts it is gone.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { exitQuietlyOnBrokenPipe } from "#runtime/brokenPipe.ts";

const CLI = new URL("../../src/frontDoor/cli.ts", import.meta.url).pathname;

function fakeStream(): NodeJS.WritableStream {
  return new EventEmitter() as unknown as NodeJS.WritableStream;
}

function errorWithCode(code: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`write ${code}`);
  error.code = code;
  return error;
}

test("EPIPE on one stream exits 0, once, and writes nothing", () => {
  const stdout = fakeStream();
  const stderr = fakeStream();
  const exits: number[] = [];
  exitQuietlyOnBrokenPipe((code) => exits.push(code), [stdout, stderr]);

  stdout.emit("error", errorWithCode("EPIPE"));
  assert.deepEqual(exits, [0]);
});

test("EPIPE on both streams -- `2>&1 | head` -- exits once: the first exit wins", () => {
  const stdout = fakeStream();
  const stderr = fakeStream();
  const exits: number[] = [];
  exitQuietlyOnBrokenPipe((code) => exits.push(code), [stdout, stderr]);

  stdout.emit("error", errorWithCode("EPIPE"));
  stderr.emit("error", errorWithCode("EPIPE"));
  assert.deepEqual(exits, [0], "a real process.exit never returns; the fake must not count twice");
});

test("any other stream error is rethrown, and exit is never called", () => {
  for (const error of [errorWithCode("ECONNRESET"), new Error("plain")]) {
    const stdout = fakeStream();
    const exits: number[] = [];
    exitQuietlyOnBrokenPipe((code) => exits.push(code), [stdout]);
    // An `error` event with a listener that throws surfaces as the throw: the
    // same trace a real failure produced before CR148, which is the point.
    assert.throws(() => stdout.emit("error", error), error);
    assert.deepEqual(exits, []);
  }
});

test("the real front door, its stdout closed before it writes, exits 0 in silence", async () => {
  const root = mkdtempSync(join(tmpdir(), "mirror-broken-pipe-"));
  try {
    const child = spawn(process.execPath, [CLI, "--help"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH ?? "",
        HOME: root,
        NODE_OPTIONS: "--no-warnings",
        MIRROR_HOME: join(root, "home"),
        MIRROR_USER: "home",
      },
    });
    // Close the read end NOW, microseconds after the spawn; the child's first
    // write comes after a TypeScript boot of 100 ms or more. The margin is
    // what makes this deterministic, and the assertion below is the
    // precondition that proves the margin held: the child had not finished.
    child.stdout?.destroy();
    assert.equal(child.exitCode, null, "the child must still be running when its reader closes");

    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const exitCode = await new Promise<number | null>((resolve) => {
      child.on("close", (code) => resolve(code));
    });

    // Before CR148: exit 1, `Unhandled 'error' event`, `Error: write EPIPE`,
    // and a stack. After: the reader asked us to stop, and we did.
    assert.equal(stderr, "", `stderr must be empty, got:\n${stderr}`);
    assert.equal(exitCode, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
