// The `package` apply strategy: a global npm install following a dist-tag.
// (CV22.DS10.US2)
//
// This is the mechanism npm distribution makes possible and the git updater
// never could: the Frame's command registry says so in its own words --
// `memory runtime update` "atualizaria só o clone, deixando o executável
// instalado operando contra uma minor futura sem contrato de
// compatibilidade". A versioned install is what that comment is waiting for.
//
// Every npm invocation goes through an injectable runner, like the git one, so
// the pipeline's decisions are testable without a registry.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type NpmRunner = (args: readonly string[]) => {
  code: number;
  stdout: string;
  stderr: string;
};

export const defaultNpmRunner: NpmRunner = (args) => {
  try {
    const stdout = execFileSync("npm", [...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const shaped = error as { status?: number; stdout?: string; stderr?: string };
    return {
      code: shaped.status ?? -1,
      stdout: shaped.stdout ?? "",
      stderr: shaped.stderr ?? String(error),
    };
  }
};

/** `npm root -g`, or null when npm is not usable. Resolved once per run. */
export function npmRootGlobal(npm: NpmRunner = defaultNpmRunner): string | null {
  const result = npm(["root", "-g"]);
  const value = result.stdout.trim();
  return result.code === 0 && value ? value : null;
}

/**
 * The channel for a package install, scoped the way the INSTALL is scoped.
 *
 * `npm install -g` is one install per OS user; a Mirror home is not. Reading
 * the channel from `<mirror-home>/…` would let two homes over one global
 * install re-tag each other on alternating updates, so it lives in the user's
 * own config directory instead. A clone keeps its tracked
 * `.mirror-update-channel` marker, which is correctly per-checkout.
 */
export function packageChannelPath(env: NodeJS.ProcessEnv): string {
  const base =
    env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim() !== ""
      ? env.XDG_CONFIG_HOME
      : join(env.HOME ?? env.USERPROFILE ?? "", ".config");
  return join(base, "mirror", "update-channel");
}

export function readPackageChannel(
  env: NodeJS.ProcessEnv,
  override: string | null = null,
): { value: string; source: string | null; note: string | null } {
  const known = new Set(["stable", "main"]);
  if (override) {
    const value = override.trim().toLowerCase();
    if (known.has(value)) return { value, source: null, note: "command override" };
    return {
      value: "stable",
      source: null,
      note: `unknown channel '${value}', defaulting to stable`,
    };
  }
  const path = packageChannelPath(env);
  if (!existsSync(path)) return { value: "stable", source: null, note: null };
  try {
    const raw = readFileSync(path, "utf8").trim().toLowerCase();
    if (known.has(raw)) return { value: raw, source: path, note: null };
    return {
      value: "stable",
      source: path,
      note: `unknown channel '${raw}', defaulting to stable`,
    };
  } catch {
    return { value: "stable", source: null, note: null };
  }
}

export interface DistTagResolution {
  ok: boolean;
  version: string | null;
  detail: string;
}

/**
 * Resolve a dist-tag to a CONCRETE version before anything is installed.
 *
 * A bare `npm install -g name@stable` installs whatever the tag pointed at in
 * that instant and reports nothing about it. Resolving first means the version
 * is printed by `--check` and `--dry-run`, recorded in the stage detail and
 * the log, and available as the value the recovery route needs. Following a
 * mutable tag is the normal posture of `npm update -g`; being able to say what
 * you got is the proportional control.
 */
export function resolveDistTag(
  name: string,
  channel: string,
  npm: NpmRunner = defaultNpmRunner,
): DistTagResolution {
  const result = npm(["view", name, "dist-tags", "--json"]);
  if (result.code !== 0) {
    return { ok: false, version: null, detail: firstLine(result.stderr) || "npm view failed" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return { ok: false, version: null, detail: "npm view returned unreadable JSON" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, version: null, detail: "npm view returned no dist-tags" };
  }
  const version = (parsed as Record<string, unknown>)[channel];
  if (typeof version !== "string" || version === "") {
    return { ok: false, version: null, detail: `no dist-tag '${channel}' for ${name}` };
  }
  return { ok: true, version, detail: version };
}

/** Install one exact version globally. Never a bare tag. */
export function installGlobal(
  name: string,
  version: string,
  npm: NpmRunner = defaultNpmRunner,
): { ok: boolean; detail: string } {
  const result = npm(["install", "-g", `${name}@${version}`]);
  return result.code === 0
    ? { ok: true, detail: `${name}@${version}` }
    : { ok: false, detail: firstLine(result.stderr) || "npm install failed" };
}

/** The pasteable route back, with the captured version in it. */
export function packageRecoveryCommand(name: string, previousVersion: string | null): string {
  return previousVersion === null
    ? `npm install -g ${name}@<previous version>`
    : `npm install -g ${name}@${previousVersion}`;
}

function firstLine(text: string): string {
  return text.trim().split("\n")[0] ?? "";
}
