// Where Mirror Mind's configuration comes from, and the warning filter every
// entry point needs. CV22.DS10.US3 plateau 1, decision D3.
//
// Until this story every invocation carried `--env-file=.env` and
// `NODE_OPTIONS=--no-warnings`: 135 skill lines, the Pi extension, the twelve
// hook wrappers, and the MCP launcher each repeated both. Only a checkout can
// satisfy the first (an installed package ships no `.env`), and a `bin` shim
// sets neither. So the program does both itself, once, here, and the three
// entries (`frontDoor/cli.ts`, `hooks/main.ts`, `mcp/main.ts`) call this
// module before they touch the database.
//
// Two files, one order, nothing overridden:
//
//   1. the real environment -- whatever the shell or the runtime set;
//   2. `<tree root>/.env` -- the clone's, located from the ENTRY FILE rather
//      than from the cwd, so a skill run from /tmp reads the same file the
//      checkout's own commands do. The tarball excludes `.env*`, so for an
//      installed package this step finds nothing and says so;
//   3. `${XDG_CONFIG_HOME:-~/.config}/mirror/env` -- the OS user's, in the
//      directory CV22.DS10.US2 already chose for the package update channel.
//
// `process.loadEnvFile` has `--env-file` semantics: it fills what is unset and
// never overrides, which is what makes the order above a precedence rather
// than a last-writer-wins. A second mirror on the same machine runs with
// `MIRROR_USER=<other>` in the shell, exactly as before.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";
import { findPackageIdentity } from "./packageIdentity.ts";

export type ConfigSource =
  | { kind: "environment" }
  | { kind: "tree_env"; path: string }
  | { kind: "user_config"; path: string };

export interface ConfigurationReport {
  /** Every source that contributed, in precedence order. */
  readonly sources: readonly ConfigSource[];
}

/** The env-var slice this module reads. `process.env` satisfies it. */
export interface ConfigEnv {
  XDG_CONFIG_HOME?: string | undefined;
  [key: string]: string | undefined;
}

export interface ConfigIo {
  env?: ConfigEnv;
  home?: string;
}

/** `${XDG_CONFIG_HOME:-~/.config}/mirror/env`, the OS user's Mirror configuration. */
export function configFilePath(env: ConfigEnv = process.env, home: string = homedir()): string {
  const xdg = env.XDG_CONFIG_HOME;
  const configHome = xdg && xdg.length > 0 ? xdg : join(home, ".config");
  return join(configHome, "mirror", "env");
}

export interface LoadConfigurationOptions extends ConfigIo {
  /**
   * The running entry file (`import.meta.filename` of `cli.ts`, `hooks/main.ts`,
   * or `mcp/main.ts`). The tree's `.env` is located by walking up from here.
   */
  entryPath: string;
  /** Present only so a test can prove the cwd is NOT consulted. */
  cwd?: string;
  /** Injection for tests; defaults to `process.loadEnvFile` semantics. */
  loadEnvFile?: (path: string, env: ConfigEnv) => void;
}

/**
 * Fill `env` from the two files, in order, without overriding anything already
 * set. Returns which sources contributed so `runtime status` and `diagnose`
 * can print them.
 */
export function loadConfiguration(options: LoadConfigurationOptions): ConfigurationReport {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const load = options.loadEnvFile ?? loadEnvFileWithoutOverride;
  const sources: ConfigSource[] = [{ kind: "environment" }];

  const tree = findPackageIdentity(dirname(options.entryPath));
  if (tree !== null) {
    const treeEnv = join(tree.root, ".env");
    if (existsSync(treeEnv)) {
      load(treeEnv, env);
      sources.push({ kind: "tree_env", path: treeEnv });
    }
  }

  const userConfig = configFilePath(env, home);
  if (existsSync(userConfig)) {
    load(userConfig, env);
    sources.push({ kind: "user_config", path: userConfig });
  }

  return { sources };
}

/**
 * `process.loadEnvFile` fills `process.env` and nothing else. When the target
 * is `process.env` that is exactly the call; for any other object (a test's),
 * the file is parsed with Node's own parser and applied with the same
 * no-override rule, so the two paths cannot disagree about precedence.
 */
function loadEnvFileWithoutOverride(path: string, env: ConfigEnv): void {
  if (env === process.env) {
    process.loadEnvFile(path);
    return;
  }
  for (const [key, value] of Object.entries(parseEnv(readFileSync(path, "utf8")))) {
    if (!(key in env)) env[key] = value;
  }
}

/**
 * Write one `KEY=value` line into the user's config file, creating the file
 * `0600` inside a `0700` directory, replacing the key's line if it is already
 * there and appending otherwise. Everything else in the file is preserved
 * byte for byte: this is where `OPENROUTER_API_KEY` lives, added by hand, and
 * `init` must never rewrite it.
 */
export function writeConfigValue(key: string, value: string, io: ConfigIo = {}): string {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
    throw new Error(`config key must be an environment variable name, got ${JSON.stringify(key)}`);
  }
  if (/[\r\n]/.test(value)) {
    throw new Error("config value must not contain a newline");
  }
  const path = configFilePath(io.env ?? process.env, io.home ?? homedir());
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);

  const line = `${key}=${value}`;
  let body = "";
  if (existsSync(path)) {
    const lines = readFileSync(path, "utf8").split("\n");
    if (lines.at(-1) === "") lines.pop();
    const index = lines.findIndex((l) => l.replace(/^\s*(export\s+)?/, "").startsWith(`${key}=`));
    if (index >= 0) lines[index] = line;
    else lines.push(line);
    body = `${lines.join("\n")}\n`;
  } else {
    body = `${line}\n`;
  }
  writeFileSync(path, body, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

/**
 * Keep `node:sqlite`'s ExperimentalWarning off stderr, in-process.
 *
 * Every skill used to pass `NODE_OPTIONS=--no-warnings`; a `bin` shim, an MCP
 * client, and a hook wrapper set no such thing, and for the MCP server stderr
 * is the client's log. Other warnings still print, one line each, because a
 * deprecation or a memory-leak warning is information.
 */
export function silenceExperimentalWarnings(): void {
  process.removeAllListeners("warning");
  process.on("warning", (warning) => {
    if (warning.name === "ExperimentalWarning") return;
    process.stderr.write(`${warning.name}: ${warning.message}\n`);
  });
}
