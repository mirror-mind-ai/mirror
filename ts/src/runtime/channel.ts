// `runtime channel [stable|main]` — where an install keeps the channel it
// follows, read and written in one place. (CV22.DS10.US3 plateau 4, D9; pays
// US2's D-027, which left the package channel file with no writer.)
//
// The channel is scoped the way the INSTALL is scoped. A clone keeps its
// `.mirror-update-channel` marker at the checkout root, per checkout and
// gitignored, so switching it leaves the tree clean for the update gate. A
// package is one `npm install -g` per OS user while a Mirror home is not:
// reading the channel from `<mirror-home>/…` would let two homes over one
// global install re-tag each other on alternating updates, so it lives beside
// the user's own config file instead, `${XDG_CONFIG_HOME:-~/.config}/mirror/`.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type ConfigEnv, configFilePath } from "#runtime/config.ts";
import { inspectUpdateChannel, type MarkerValue } from "#runtime/git.ts";
import { describeInstallKind, type InstallKind } from "#runtime/installKind.ts";
import { DEFAULT_CHANNEL, KNOWN_CHANNELS } from "#runtime/updatePipeline.ts";

const CLONE_MARKER = ".mirror-update-channel";

/** The file this install's channel lives in, or null when it has nowhere to. */
export function channelPathFor(
  install: InstallKind,
  env: ConfigEnv = process.env,
  home: string = homedir(),
): string | null {
  if (install.kind === "clone") return join(install.repository, CLONE_MARKER);
  if (install.kind === "package") return join(dirname(configFilePath(env, home)), "update-channel");
  return null;
}

/** `stable`, `main`, or null for anything else, after trimming and lowercasing. */
export function normalizeChannel(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  return KNOWN_CHANNELS.has(value) ? value : null;
}

function readPackageChannel(path: string): MarkerValue {
  if (!existsSync(path)) return { value: DEFAULT_CHANNEL, source: null, note: null };
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { value: DEFAULT_CHANNEL, source: path, note: `unreadable: ${message}` };
  }
  const value = normalizeChannel(raw);
  if (value !== null) return { value, source: path, note: null };
  return {
    value: DEFAULT_CHANNEL,
    source: path,
    note: `unknown channel '${raw.trim().toLowerCase()}', defaulting to ${DEFAULT_CHANNEL}`,
  };
}

/**
 * The channel this install follows: the override when one was given, else
 * the install's own file, else the default. One answer for `update`,
 * `--check`, `status`, `version`, and `channel`.
 */
export function channelFor(
  install: InstallKind,
  env: ConfigEnv = process.env,
  home: string = homedir(),
  override: string | null = null,
): MarkerValue {
  if (install.kind === "clone") return inspectUpdateChannel(install.repository, override);
  if (override) {
    const value = normalizeChannel(override);
    if (value !== null) return { value, source: null, note: "command override" };
    return {
      value: DEFAULT_CHANNEL,
      source: null,
      note: `unknown channel '${override.trim().toLowerCase()}', defaulting to ${DEFAULT_CHANNEL}`,
    };
  }
  if (install.kind === "package") {
    return readPackageChannel(join(dirname(configFilePath(env, home)), "update-channel"));
  }
  return { value: DEFAULT_CHANNEL, source: null, note: "install kind unknown" };
}

export type ChannelWrite =
  | { ok: true; path: string; value: string; previous: string }
  | { ok: false; reason: string; exitCode: 1 | 2 };

/**
 * Persist the channel for this install. The value is checked against the
 * vocabulary before anything is created; an unknown install is refused
 * rather than guessed. For a package the config directory may not exist yet
 * (`init` has not run), and it is created `0700`, as `init` creates it: the
 * env file that later lands there holds the API key.
 */
export function setChannel(
  install: InstallKind,
  raw: string,
  env: ConfigEnv = process.env,
  home: string = homedir(),
): ChannelWrite {
  const value = normalizeChannel(raw);
  if (value === null) {
    return {
      ok: false,
      reason: `unknown channel ${JSON.stringify(raw)}: choose stable or main`,
      exitCode: 2,
    };
  }
  const path = channelPathFor(install, env, home);
  if (path === null) {
    return {
      ok: false,
      reason: `install kind unknown (${describeInstallKind(install)}): the channel has no home`,
      exitCode: 1,
    };
  }
  const previous = channelFor(install, env, home).value;
  if (install.kind === "package") {
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
  }
  writeFileSync(path, `${value}\n`, "utf8");
  return { ok: true, path, value, previous };
}

export interface ChannelView {
  install: InstallKind;
  channel: MarkerValue;
  /** Present after a write: what the channel was before it. */
  written: { previous: string } | null;
}

export function renderChannel(view: ChannelView): string {
  const lines = ["Mirror runtime update channel", ""];
  lines.push(`Install: ${describeInstallKind(view.install)}`);
  const was =
    view.written !== null && view.written.previous !== view.channel.value
      ? ` (was ${view.written.previous})`
      : "";
  lines.push(`Update channel: ${view.channel.value}${was}`);
  if (view.channel.note) lines.push(`Update channel note: ${view.channel.note}`);
  lines.push(`Source: ${view.channel.source ?? "default"}`);
  return `${lines.join("\n")}\n`;
}
