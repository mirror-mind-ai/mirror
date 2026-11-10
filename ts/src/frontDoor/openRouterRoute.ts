// `openrouter setup | status | remove`: the OpenRouter key in the operating
// system's credential store, so it need not sit in a file.
//
// `setup` asks for the key (hidden at a terminal, one line from a pipe) and
// never takes it from argv, which `ps` shows. `status` says `active` when a key
// is configured and `pending` when none is, and never prints the key. `remove`
// deletes what `setup` stored; a key written in a config file or set in the
// shell is the person's own and is left alone, and said so.

import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { configFilePath } from "#runtime/config.ts";
import {
  type CredentialStore,
  CredentialStoreError,
  osCredentialStore,
} from "#runtime/credentialStore.ts";
import { PROGRAM } from "#util/program.ts";
import { readStdinText } from "./textInput.ts";

const USAGE = `Usage: ${PROGRAM} openrouter <setup|status|remove>`;

export interface OpenRouterDeps {
  store: CredentialStore | null;
  env: NodeJS.ProcessEnv;
  /** The key the person typed, or null when they gave none (cancelled, empty pipe). */
  readSecret: () => Promise<string | null>;
  out: (line: string) => void;
  err: (line: string) => void;
}

export function isOpenRouterCommand(argv: readonly string[]): boolean {
  return argv[0] === "openrouter";
}

export async function runOpenRouter(
  argv: readonly string[],
  deps: OpenRouterDeps = defaultDeps(),
): Promise<number> {
  const verb = argv[1];
  if (argv.length !== 2 || (verb !== "setup" && verb !== "status" && verb !== "remove")) {
    deps.err(USAGE);
    return 2;
  }
  const { store } = deps;
  if (store === null) {
    deps.err(
      `Error: no system credential store on ${process.platform}. Add OPENROUTER_API_KEY to ${configFilePath(deps.env)}.`,
    );
    return 1;
  }
  try {
    if (verb === "setup") return await setup(store, deps);
    if (verb === "status") return status(store, deps);
    return remove(store, deps);
  } catch (error) {
    if (error instanceof CredentialStoreError) {
      deps.err(`Error: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

async function setup(store: CredentialStore, deps: OpenRouterDeps): Promise<number> {
  const secret = (await deps.readSecret())?.trim() ?? "";
  if (secret === "") {
    deps.err("Error: no key given, nothing was stored.");
    return 2;
  }
  if (/\s/.test(secret)) {
    deps.err("Error: an OpenRouter key has no spaces; nothing was stored.");
    return 2;
  }
  store.set(secret);
  deps.out(`OpenRouter key saved to ${store.label}.`);
  const shadow = shadowedBy(deps.env);
  if (shadow !== null) {
    deps.out(
      `Note: ${shadow} also sets OPENROUTER_API_KEY and takes precedence over the stored key.`,
    );
  }
  return 0;
}

function status(store: CredentialStore, deps: OpenRouterDeps): number {
  const stored = store.get() !== null;
  if (stored) {
    deps.out(`OpenRouter: active (key stored in ${store.label})`);
    return 0;
  }
  // Nothing in the store, so a key in `env` came from a file or the shell.
  const elsewhere =
    shadowedBy(deps.env) ?? (deps.env.OPENROUTER_API_KEY?.trim() ? "the environment" : null);
  if (elsewhere !== null) {
    deps.out(`OpenRouter: active (key set in ${elsewhere})`);
    return 0;
  }
  deps.out(`OpenRouter: pending (no key yet). Run: ${PROGRAM} openrouter setup`);
  return 0;
}

function remove(store: CredentialStore, deps: OpenRouterDeps): number {
  const removed = store.delete();
  deps.out(
    removed
      ? `OpenRouter key removed from ${store.label}.`
      : `No OpenRouter key was stored in ${store.label}; nothing to remove.`,
  );
  const shadow = shadowedBy(deps.env);
  if (shadow !== null) {
    deps.out(`Note: ${shadow} still sets OPENROUTER_API_KEY; remove it there to finish.`);
  }
  return 0;
}

/**
 * Where a key outside the credential store is set, if one is: the config file
 * is read for the line itself, since by now the keychain's value may have
 * filled `env`. A key in `env` that the file does not hold came from the shell.
 */
function shadowedBy(env: NodeJS.ProcessEnv): string | null {
  const path = configFilePath(env);
  if (existsSync(path)) {
    try {
      if (parseEnv(readFileSync(path, "utf8")).OPENROUTER_API_KEY?.trim()) return path;
    } catch {
      // An unreadable config file is not a key.
    }
  }
  return null;
}

function defaultDeps(): OpenRouterDeps {
  return {
    store: osCredentialStore(),
    env: process.env,
    readSecret: readSecretFromPerson,
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  };
}

/** Hidden at a terminal; the first line of stdin otherwise. */
async function readSecretFromPerson(): Promise<string | null> {
  const { stdin } = process;
  if (!stdin.isTTY) return readStdinText().split(/\r?\n/, 1)[0] ?? null;
  process.stderr.write("OpenRouter API key (input is hidden): ");
  return new Promise((resolve) => {
    let typed = "";
    const finish = (value: string | null): void => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stderr.write("\n");
      resolve(value);
    };
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          finish(typed);
          return;
        }
        if (ch === "\u0003" || ch === "\u0004") {
          finish(null);
          return;
        }
        if (ch === "\u007f" || ch === "\b") typed = typed.slice(0, -1);
        else typed += ch;
      }
    };
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}
