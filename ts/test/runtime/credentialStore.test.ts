// The OS credential store drivers, against a fake process runner: what each
// platform is asked to run, and that the key never rides in argv.

import assert from "node:assert/strict";
import { test } from "node:test";
import { osCredentialStore, type Run, type RunResult } from "#runtime/credentialStore.ts";

const ok = (stdout = ""): RunResult => ({ status: 0, stdout, stderr: "" });

function recorder(reply: (command: string, args: readonly string[]) => RunResult) {
  const calls: { command: string; args: readonly string[]; input?: string }[] = [];
  const run: Run = (command, args, input) => {
    calls.push({ command, args, ...(input !== undefined ? { input } : {}) });
    return reply(command, args);
  };
  return { calls, run };
}

test("macOS: the key goes to `security -i` on stdin, never argv", () => {
  const { calls, run } = recorder(() => ok());
  osCredentialStore("darwin", run)?.set('sk"or\\x');
  assert.deepEqual(calls[0]?.args, ["-i"]);
  assert.match(calls[0]?.input ?? "", /^add-generic-password -U .* -w "sk\\"or\\\\x"\n$/);
});

test("macOS: get returns the key, and null for item-not-found (44)", () => {
  assert.equal(osCredentialStore("darwin", recorder(() => ok("sk-1\n")).run)?.get(), "sk-1");
  const missing = recorder(() => ({ status: 44, stdout: "", stderr: "not found" }));
  assert.equal(osCredentialStore("darwin", missing.run)?.get(), null);
  assert.equal(osCredentialStore("darwin", missing.run)?.delete(), false);
});

test("Linux: secret-tool store takes the key on stdin; a missing tool is named", () => {
  const { calls, run } = recorder(() => ok());
  osCredentialStore("linux", run)?.set("sk-2");
  assert.equal(calls[0]?.command, "secret-tool");
  assert.equal(calls[0]?.input, "sk-2");
  assert.ok(!calls[0]?.args.includes("sk-2"));

  const absent = recorder(() => ({
    status: null,
    stdout: "",
    stderr: "",
    error: Object.assign(new Error("spawn"), { code: "ENOENT" }),
  }));
  assert.throws(
    () => osCredentialStore("linux", absent.run)?.get(),
    /secret-tool is not installed/,
  );
});

test("Linux: lookup exit 1 with no stderr is not-found; with stderr it is an error", () => {
  const none = recorder(() => ({ status: 1, stdout: "", stderr: "" }));
  assert.equal(osCredentialStore("linux", none.run)?.get(), null);
  const broken = recorder(() => ({ status: 1, stdout: "", stderr: "no D-Bus" }));
  assert.throws(() => osCredentialStore("linux", broken.run)?.get(), /no D-Bus/);
});

test("Windows: PowerShell gets the key on stdin and the operation in the environment", () => {
  const seen: { env?: Record<string, string> }[] = [];
  const run: Run = (_c, args, input, env) => {
    seen.push({ ...(env ? { env } : {}) });
    assert.ok(!args.some((a) => a.includes("sk-3")));
    assert.equal(input, "sk-3");
    return ok();
  };
  osCredentialStore("win32", run)?.set("sk-3");
  assert.equal(seen[0]?.env?.MIRROR_CRED_OP, "set");
});

test("a platform with no store gets none", () => {
  assert.equal(osCredentialStore("freebsd"), null);
});
