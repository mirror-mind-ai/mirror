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
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { type ApplyStrategy, KNOWN_CHANNELS } from "#runtime/updatePipeline.ts";
import { compareSemver, isPlainSemver } from "#util/semver.ts";

/**
 * Where and how long one npm command runs.
 *
 * `cwd` is a trust decision, not a convenience (CR135). npm reads the project
 * config of the directory it runs in -- the `.npmrc` beside the nearest
 * `package.json` -- so a command started in the person's project takes its
 * `registry=` and `prefix=` from whatever that project ships. Every call the
 * product makes names its directory: the install's own root for the package's
 * commands, except the install that replaces the package, which runs from the
 * parent of `node_modules` (`applyCwd`); the release's repository for `publish`.
 */
export interface NpmCall {
  cwd?: string;
  /** Kill npm after this long. Absent, npm runs until it answers. */
  timeoutMs?: number;
}

export type NpmRunner = (
  args: readonly string[],
  call?: NpmCall,
) => {
  code: number;
  stdout: string;
  stderr: string;
};

/**
 * How npm is spawned on this platform.
 *
 * Elsewhere `npm` is a file on the PATH, spawned directly. On Windows it is
 * `npm.cmd`, which Node runs only through a shell (since CVE-2024-27980 it
 * refuses otherwise) -- and a shell's timeout ends the shell, not the npm
 * under it: an orphan that outlives the welcome card's budget and holds the
 * directory it ran in. So on Windows Mirror runs npm the way `npm.cmd` itself
 * does: the `npm-cli.js` every Windows distribution of Node ships beside
 * `node.exe`, through the node already running. No shell, and the budget's
 * kill reaches npm itself. Without this every probe answered "npm is
 * unavailable" on a machine with npm on its PATH, and the update lane refused
 * for a reason that was not true.
 *
 * One difference from `npm.cmd`, accepted: the shim prefers an npm the person
 * upgraded under `<prefix>\node_modules\npm` when there is one; this runs the
 * npm bundled with the node that is running. And when no `npm-cli.js` sits
 * beside that node -- a node from a manager that ships npm elsewhere -- the
 * answer is a named absence, so the status line can say "npm is unavailable"
 * and where it looked, rather than a module-not-found stack.
 */
export function npmInvocation(
  args: readonly string[],
  platform: NodeJS.Platform,
  execPath: string,
  exists: (path: string) => boolean = existsSync,
): { file: string; args: string[] } | { unavailable: string } {
  if (platform !== "win32") return { file: "npm", args: [...args] };
  const cli = join(dirname(execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (!exists(cli)) return { unavailable: `npm-cli.js not found beside node: ${cli}` };
  return { file: execPath, args: [cli, ...args] };
}

export const defaultNpmRunner: NpmRunner = (args, call = {}) => {
  const invocation = npmInvocation(args, process.platform, process.execPath);
  if ("unavailable" in invocation) return { code: -1, stdout: "", stderr: invocation.unavailable };
  try {
    const stdout = execFileSync(invocation.file, invocation.args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...(call.cwd === undefined ? {} : { cwd: call.cwd }),
      ...(call.timeoutMs === undefined ? {} : { timeout: call.timeoutMs }),
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const shaped = error as { status?: number; stdout?: string; stderr?: string; code?: string };
    if (shaped.code === "ETIMEDOUT") {
      return {
        code: -1,
        stdout: shaped.stdout ?? "",
        stderr: `npm ${args[0] ?? ""} timed out after ${call.timeoutMs} ms`,
      };
    }
    return {
      code: shaped.status ?? -1,
      stdout: shaped.stdout ?? "",
      stderr: shaped.stderr ?? String(error),
    };
  }
};

/**
 * `npm root -g`, or null when npm is not usable. Resolved once per run.
 *
 * It runs before the install is known, so its directory is the caller's: the
 * tree the front door runs from, which for a package is the install's root.
 */
export function npmRootGlobal(cwd: string, npm: NpmRunner = defaultNpmRunner): string | null {
  const result = npm(["root", "-g"], { cwd });
  const value = result.stdout.trim();
  return result.code === 0 && value ? value : null;
}

// The package channel's location and reader live in `#runtime/channel.ts`
// with the clone's, since CV22.DS10.US3 plateau 4 gave both a writer.

export type DistTags = { ok: true; tags: Record<string, string> } | { ok: false; detail: string };

/**
 * How to read the dist-tags. `cwd` is the install's root. The welcome card
 * bounds the read and drops npm's retries, which cost over a minute when the
 * registry cannot be reached (CR135); `runtime update` asks for neither.
 */
export interface DistTagRead {
  cwd: string;
  timeoutMs?: number;
  fetchRetries?: number;
}

/** `npm view <name> dist-tags --json`, read once per run. */
export function readDistTags(name: string, npm: NpmRunner, read: DistTagRead): DistTags {
  const args = ["view", name, "dist-tags", "--json"];
  if (read.fetchRetries !== undefined) args.push(`--fetch-retries=${read.fetchRetries}`);
  const result = npm(
    args,
    read.timeoutMs === undefined ? { cwd: read.cwd } : { cwd: read.cwd, timeoutMs: read.timeoutMs },
  );
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

/** What the package's npm commands need to know about the install. */
export interface PackageInstall {
  name: string;
  version: string;
  /** Where the package lives; its npm commands run here, except the apply (`applyCwd`). */
  root: string;
}

/** The bound and retries of one dist-tag read; where it runs is the install's. */
export type DistTagLimits = Omit<DistTagRead, "cwd">;

export function channelDirection(
  install: PackageInstall,
  channel: string,
  npm: NpmRunner = defaultNpmRunner,
  limits: DistTagLimits = {},
): ChannelDirection {
  const read = readDistTags(install.name, npm, { cwd: install.root, ...limits });
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
  install: PackageInstall,
  channel: { value: string; note: string | null },
  npm: NpmRunner = defaultNpmRunner,
  limits: DistTagLimits = {},
): PackageUpdateAvailability {
  const base = { name: install.name, installed: install.version, channel, carriedBy: null };
  const direction = channelDirection(install, channel.value, npm, limits);
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

/**
 * Where `npm install -g` runs when it replaces this very package.
 *
 * npm renames the installed package directory aside (`.mirror-mind-xxxx`)
 * before it lays down the new version. On Windows a process holds its
 * current directory against rename, so an npm started inside the package --
 * the install's root, where every other call of the product runs (CR135) --
 * fails with EBUSY on every update, and a Windows npm install could never
 * update itself (4 of 4 runs, 0.33.4 -> 0.35.0; the same npm from the parent
 * directory succeeds, with a Mirror process holding the package open).
 *
 * The parent of `node_modules` is still the install's own tree, never the
 * person's project, so CR135 holds: no project `.npmrc` can answer this call.
 */
export function applyCwd(root: string): string {
  return dirname(dirname(root));
}

/** Install one exact version globally, from the directory `applyCwd` names. Never a bare tag. */
export function installGlobal(
  name: string,
  version: string,
  cwd: string,
  npm: NpmRunner = defaultNpmRunner,
): { ok: boolean; detail: string } {
  const result = npm(["install", "-g", `${name}@${version}`], { cwd });
  return result.code === 0
    ? { ok: true, detail: `${name}@${version}` }
    : { ok: false, detail: firstLine(result.stderr) || "npm install failed" };
}

/**
 * `npm pack <name>@<version>` into `destination`: the exact tarball `runtime
 * update` would install, fetched -- never unpacked here -- so `release-notes
 * pending` can read what that version brings (CR134). It runs in the install's
 * own root, as every npm call but the apply does (CR135). `--ignore-scripts`:
 * a registry tarball runs no scripts when packed, and at a trust boundary that
 * is said rather than assumed.
 */
export function packTarball(
  name: string,
  version: string,
  cwd: string,
  destination: string,
  npm: NpmRunner = defaultNpmRunner,
): { ok: true; path: string } | { ok: false; detail: string } {
  const result = npm(
    ["pack", `${name}@${version}`, "--pack-destination", destination, "--ignore-scripts", "--json"],
    { cwd },
  );
  if (result.code !== 0)
    return { ok: false, detail: firstLine(result.stderr) || "npm pack failed" };
  let filename: unknown;
  try {
    filename = (JSON.parse(result.stdout) as Array<{ filename?: unknown }>)[0]?.filename;
  } catch {
    return { ok: false, detail: "npm pack returned unreadable JSON" };
  }
  // A bare file name, or nothing: the path is ours to build.
  if (typeof filename !== "string" || filename === "" || basename(filename) !== filename) {
    return { ok: false, detail: "npm pack named no tarball" };
  }
  return { ok: true, path: join(destination, filename) };
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
  install: PackageInstall,
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
      const direction = channelDirection({ ...install, version: previousRef }, channel, npm);
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
      const applied = installGlobal(install.name, target, applyCwd(install.root), npm);
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
