// `openrouter setup | status | remove`, with a fake credential store.

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { type OpenRouterDeps, runOpenRouter } from "#frontDoor/openRouterRoute.ts";
import { tempDir } from "#helpers/tempDir.ts";
import type { CredentialStore } from "#runtime/credentialStore.ts";

function fakeStore(initial: string | null = null): CredentialStore & { value: string | null } {
  const store = {
    value: initial,
    label: "Fake Keychain",
    get: () => store.value,
    set: (secret: string) => {
      store.value = secret;
    },
    delete: () => {
      const had = store.value !== null;
      store.value = null;
      return had;
    },
  };
  return store;
}

function run(argv: string[], over: Partial<OpenRouterDeps> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const xdg = tempDir("openrouter-route-");
  const deps: OpenRouterDeps = {
    store: fakeStore(),
    env: { XDG_CONFIG_HOME: xdg },
    readSecret: async () => null,
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    ...over,
  };
  return { xdg, out, err, done: runOpenRouter(["openrouter", ...argv], deps) };
}

test("setup stores the typed key and never prints it", async () => {
  const store = fakeStore();
  const r = run(["setup"], { store, readSecret: async () => "  sk-or-secret \n" });
  assert.equal(await r.done, 0);
  assert.equal(store.value, "sk-or-secret");
  assert.match(r.out.join("\n"), /saved to Fake Keychain/);
  assert.doesNotMatch(r.out.join("\n"), /sk-or-secret/);
});

test("setup refuses an empty key and a key with spaces, storing nothing", async () => {
  for (const typed of [null, "   ", "two words"]) {
    const store = fakeStore();
    const r = run(["setup"], { store, readSecret: async () => typed });
    assert.equal(await r.done, 2);
    assert.equal(store.value, null);
  }
});

test("status is pending without a key and active with one", async () => {
  const pending = run(["status"]);
  assert.equal(await pending.done, 0);
  assert.match(pending.out[0] ?? "", /^OpenRouter: pending/);

  const active = run(["status"], { store: fakeStore("k") });
  assert.equal(await active.done, 0);
  assert.match(active.out[0] ?? "", /^OpenRouter: active \(key stored in Fake Keychain\)/);

  const fromShell = run(["status"], {
    env: { OPENROUTER_API_KEY: "k", XDG_CONFIG_HOME: "/nonexistent" },
  });
  assert.equal(await fromShell.done, 0);
  assert.match(fromShell.out[0] ?? "", /^OpenRouter: active \(key set in the environment\)/);
});

test("remove deletes the stored key, and says so when there was none", async () => {
  const store = fakeStore("k");
  const first = run(["remove"], { store });
  assert.equal(await first.done, 0);
  assert.equal(store.value, null);
  assert.match(first.out[0] ?? "", /removed from Fake Keychain/);

  const second = run(["remove"], { store });
  assert.equal(await second.done, 0);
  assert.match(second.out[0] ?? "", /nothing to remove/);
});

test("remove names a key left in the config file", async () => {
  const xdg = tempDir("openrouter-shadow-");
  mkdirSync(join(xdg, "mirror"), { recursive: true });
  writeFileSync(join(xdg, "mirror", "env"), "OPENROUTER_API_KEY=abc\n");
  const r = run(["remove"], { store: fakeStore("k"), env: { XDG_CONFIG_HOME: xdg } });
  assert.equal(await r.done, 0);
  assert.match(r.out.join("\n"), /still sets OPENROUTER_API_KEY/);
});

test("an unknown verb, an extra argument, or no store is refused", async () => {
  assert.equal(await run([]).done, 2);
  assert.equal(await run(["frobnicate"]).done, 2);
  assert.equal(await run(["setup", "sk-or-in-argv"]).done, 2);
  const noStore = run(["status"], { store: null });
  assert.equal(await noStore.done, 1);
});
