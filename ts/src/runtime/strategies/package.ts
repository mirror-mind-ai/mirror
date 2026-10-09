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
import type { ApplyStrategy } from "#runtime/updatePipeline.ts";
import { compareSemver, isPlainSemver } from "#util/semver.ts";

const KNOWN_CHANNELS = new Set(["stable", "main"]);

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
  const known = KNOWN_CHANNELS;
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

export type DistTags = { ok: true; tags: Record<string, string> } | { ok: false; detail: string };

/** `npm view <name> dist-tags --json`, read once per run. */
export function readDistTags(name: string, npm: NpmRunner = defaultNpmRunner): DistTags {
  const result = npm(["view", name, "dist-tags", "--json"]);
  if (result.code !== 0)
    return { ok: false, detail: firstLine(result.stderr) || "npm view failed" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return { ok: false, detail: "npm view returned unreadable JSON" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, detail: "npm view returned no dist-tags" };
  }
  const tags: Record<string, string> = {};
  for (const [tag, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "string") tags[tag] = value;
  }
  return { ok: true, tags };
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
 *
 * The registry is a boundary. Its answer becomes the spec of
 * `npm install -g <name>@<value>`, and npm's spec grammar admits tags, ranges,
 * URLs, and paths beside versions, so a value that is not a plain version is
 * refused here, before it is printed or installed (CV22.DS10.US3 plateau 4).
 */
function resolveFrom(
  tags: Record<string, string>,
  name: string,
  channel: string,
): { ok: true; version: string } | { ok: false; detail: string } {
  const version = tags[channel];
  if (version === undefined || version === "") {
    return { ok: false, detail: `no dist-tag '${channel}' for ${name}` };
  }
  if (!isPlainSemver(version)) {
    return { ok: false, detail: `dist-tag '${channel}' is not a version: ${version}` };
  }
  return { ok: true, version };
}

/**
 * Which way the channel lies from the installed version. Migrations run one
 * way, so a channel BEHIND the install is not an update to take: it is a
 * downgrade, refused at plan, and the person is told which channel carries
 * what they have.
 */
export type ChannelDirection =
  | { kind: "current"; version: string }
  | { kind: "ahead"; version: string }
  | { kind: "behind"; version: string; detail: string; carriedBy: string | null }
  | { kind: "unresolved"; detail: string };

export function channelDirection(
  install: { name: string; version: string },
  channel: string,
  npm: NpmRunner = defaultNpmRunner,
): ChannelDirection {
  const read = readDistTags(install.name, npm);
  if (!read.ok) return { kind: "unresolved", detail: read.detail };
  const resolved = resolveFrom(read.tags, install.name, channel);
  if (!resolved.ok) return { kind: "unresolved", detail: resolved.detail };
  const order = compareSemver(resolved.version, install.version);
  if (order === 0) return { kind: "current", version: resolved.version };
  if (order > 0) return { kind: "ahead", version: resolved.version };
  const carriedBy =
    Object.entries(read.tags).find(
      ([tag, version]) =>
        tag !== channel &&
        KNOWN_CHANNELS.has(tag) &&
        isPlainSemver(version) &&
        compareSemver(version, install.version) >= 0,
    )?.[0] ?? null;
  return {
    kind: "behind",
    version: resolved.version,
    detail: `'${channel}' is behind the installed version (${resolved.version} < ${install.version})`,
    carriedBy,
  };
}

// --- `runtime update --check` for a package ----------------------------------

export type PackageAvailabilityStatus =
  | "up_to_date"
  | "update_available"
  | "channel_behind"
  | "unresolved";

export interface PackageUpdateAvailability {
  name: string;
  installed: string;
  channel: { value: string; note: string | null };
  resolved: string | null;
  status: PackageAvailabilityStatus;
  note: string | null;
  /** The known channel at or past the installed version, when this one is behind. */
  carriedBy: string | null;
}

export function checkPackageUpdateAvailability(
  install: { name: string; version: string },
  channel: { value: string; note: string | null },
  npm: NpmRunner = defaultNpmRunner,
): PackageUpdateAvailability {
  const base = { name: install.name, installed: install.version, channel, carriedBy: null };
  const direction = channelDirection(install, channel.value, npm);
  switch (direction.kind) {
    case "current":
      return { ...base, resolved: direction.version, status: "up_to_date", note: null };
    case "ahead":
      return { ...base, resolved: direction.version, status: "update_available", note: null };
    case "behind":
      return {
        ...base,
        resolved: direction.version,
        status: "channel_behind",
        note: direction.detail,
        carriedBy: direction.carriedBy,
      };
    case "unresolved":
      return { ...base, resolved: null, status: "unresolved", note: direction.detail };
  }
}

/** The package's counterpart of `renderRuntimeUpdateAvailability`, same shape. */
export function renderPackageUpdateAvailability(report: PackageUpdateAvailability): string {
  const lines = ["Mirror runtime update check", ""];
  lines.push(`Version: ${report.installed}`);
  lines.push(`Install: package (${report.name}@${report.installed})`);
  lines.push(`Update channel: ${report.channel.value}`);
  if (report.channel.note) lines.push(`Update channel note: ${report.channel.note}`);
  lines.push(`Channel version: ${report.resolved ?? "unresolved"}`);
  lines.push(`Availability: ${report.status}`);
  if (report.note) lines.push(`Reason: ${report.note}`);
  if (report.status === "update_available") {
    lines.push("");
    lines.push("Preview:");
    lines.push("runtime update --dry-run");
    lines.push("");
    lines.push("Update:");
    lines.push("runtime update");
  } else if (report.status === "up_to_date") {
    lines.push("");
    lines.push("Next: no update needed");
  } else if (report.status === "channel_behind") {
    lines.push("");
    lines.push(
      report.carriedBy
        ? `Next: runtime channel ${report.carriedBy}`
        : `Next: stay on ${report.installed} until '${report.channel.value}' reaches it`,
    );
  }
  return `${lines.join("\n")}\n`;
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

/**
 * The package's answers to the pipeline's questions. A ref is an installed
 * version, read from the manifest before anything is installed over it (npm's
 * global install is not atomic, so a pinned reinstall is the only rollback
 * there is); the channel is a dist-tag resolved to a concrete version at plan
 * time; moving is one global install of exactly that version; the way back is
 * the same install of the captured one. Nothing is fetched: the registry is
 * asked once, at plan.
 */
export function packageStrategy(
  install: { name: string; version: string },
  channel: string,
  npm: NpmRunner,
): ApplyStrategy {
  return {
    kind: "package",
    applyStage: "apply",

    // A package has no tree to be dirty: the status gate is the only gate, and
    // the repair lane simply forgoes it.
    repairGate: () => ({ ok: true }),

    capture: () => ({
      ok: true,
      ref: install.version,
      detail: `${install.name}@${install.version}`,
    }),

    plan: (previousRef) => {
      const direction = channelDirection(
        { name: install.name, version: previousRef },
        channel,
        npm,
      );
      switch (direction.kind) {
        case "unresolved":
          return {
            kind: "blocked",
            detail: direction.detail,
            recovery: [
              `Could not resolve the '${channel}' dist-tag for ${install.name}.`,
              "Check network access to the npm registry, then retry runtime update.",
            ],
          };
        case "current":
          return { kind: "current", detail: `already up to date (${direction.version})` };
        case "behind":
          return {
            kind: "blocked",
            detail: direction.detail,
            recovery: [
              "A downgrade is refused: migrations do not run backwards.",
              direction.carriedBy
                ? `Follow the channel that carries ${previousRef}: runtime channel ${direction.carriedBy}`
                : `Stay on ${previousRef} until '${channel}' reaches it.`,
              "Nothing was installed and the database is unchanged.",
            ],
          };
        case "ahead":
          return {
            kind: "ahead",
            target: direction.version,
            detail: `${previousRef} -> ${direction.version}`,
            dryRun: `would install ${install.name}@${direction.version}`,
          };
      }
    },

    apply: (_previousRef, target) => {
      const applied = installGlobal(install.name, target, npm);
      return applied.ok
        ? { ok: true, newRef: target, detail: applied.detail, changes: [] }
        : {
            ok: false,
            detail: applied.detail,
            recovery: ["A global npm install is not atomic; this one did not complete."],
          };
    },

    recoveryCommand: (previousRef) => packageRecoveryCommand(install.name, previousRef),
    installedState: (newRef) => `${install.name}@${newRef ?? "<unknown>"} is installed`,
  };
}

function firstLine(text: string): string {
  return text.trim().split("\n")[0] ?? "";
}
