// Read-only git and version inspection for the runtime surface
// (CV22.DS7.TS3). Port of the read half of `src/memory/cli/runtime.py`.
//
// BOUNDARY, enforced by a test that greps this file: nothing here mutates a
// repository. `merge`, `tag`, `push`, `reset`, `checkout`, `commit`, and
// `branch <name>` belong to the git-based updater and release machinery, which
// the 2026-09-07 decision assigned to CV22.DS10 for redesign under npm
// distribution. Every command below reads: `rev-parse`, `branch
// --show-current`, `status --porcelain`, `rev-list --count`, `merge-base
// --is-ancestor`, `cat-file -e`, `config --get`, and the one networked read,
// `ls-remote`.
//
// Timeouts follow the oracle's two budgets, and for the reason recorded there:
// local inspections are near-instant, while a single shared 2 s budget once
// made a network operation report failure after it had already succeeded
// (the v0.30.1 release incident). Network reads get 120 s.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const GIT_LOCAL_TIMEOUT_MS = 2_000;
export const GIT_NETWORK_TIMEOUT_MS = 120_000;

const CLONE_ROLE_FILENAME = ".mirror-clone-role";
const UPDATE_CHANNEL_FILENAME = ".mirror-update-channel";
const DEFAULT_CLONE_ROLE = "production";
const KNOWN_CLONE_ROLES = new Set(["production", "dev"]);
const DEFAULT_UPDATE_CHANNEL = "stable";
const KNOWN_UPDATE_CHANNELS = new Set(["stable", "main"]);

export interface GitStatus {
  repository: string | null;
  branch: string | null;
  commit: string | null;
  dirty: boolean | null;
  error: string | null;
}

export interface GitWorktreeEntry {
  status: string;
  path: string;
}

export interface MarkerValue {
  value: string;
  /** The marker file the value came from, or null when defaulted. */
  source: string | null;
  note: string | null;
}

export interface RuntimeVersionReport {
  version: string;
  git: GitStatus;
  cloneRole: MarkerValue;
  updateChannel: MarkerValue;
}

export interface GitUpdatePlan {
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  ready: boolean;
  action: string;
  note: string | null;
}

export interface UpdateAvailability {
  version: string;
  upstream: string | null;
  local_commit: string | null;
  remote_commit: string | null;
  status: string;
  note: string | null;
  update_channel: MarkerValue;
  target_release: null;
}

/** `(exit code, trimmed stdout, trimmed stderr)`, tolerant like the oracle's. */
export function runGit(
  args: readonly string[],
  cwd: string,
  timeoutMs: number = GIT_LOCAL_TIMEOUT_MS,
): { code: number; stdout: string; stderr: string } {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    // Arguments are passed as argv, never through a shell, so a ref or remote
    // name cannot become a second command.
    shell: false,
  });
  if (result.error)
    return { code: 1, stdout: "", stderr: String(result.error.message ?? result.error) };
  return {
    code: result.status ?? 1,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

function resolveRepoRoot(start: string): string | null {
  const { code, stdout } = runGit(["rev-parse", "--show-toplevel"], start);
  if (code !== 0 || !stdout) return null;
  return realpathSync(stdout);
}

/** Port of `_parse_porcelain_line`: two status characters, then the path. */
function parsePorcelainLine(line: string): GitWorktreeEntry | null {
  if (!line) return null;
  const status = line.slice(0, 2);
  let path = line.slice(2).trim();
  if (path.includes(" -> ")) path = path.split(" -> ", 2)[1] as string;
  return { status, path };
}

export function inspectGitWorktree(repository: string | null): GitWorktreeEntry[] {
  if (repository === null) return [];
  const { code, stdout } = runGit(["status", "--porcelain"], repository);
  if (code !== 0 || !stdout) return [];
  return stdout
    .split("\n")
    .map(parsePorcelainLine)
    .filter((entry): entry is GitWorktreeEntry => entry !== null);
}

export function inspectGit(start: string): GitStatus {
  const top = runGit(["rev-parse", "--show-toplevel"], start);
  if (top.code !== 0 || !top.stdout) {
    return {
      repository: null,
      branch: null,
      commit: null,
      dirty: null,
      error: top.stderr || "not a git repository",
    };
  }
  const repository = realpathSync(top.stdout);
  const branch = runGit(["branch", "--show-current"], repository);
  const commit = runGit(["rev-parse", "--short", "HEAD"], repository);
  const dirty = runGit(["status", "--porcelain"], repository);

  const errors = [branch, commit, dirty]
    .filter((result) => result.code !== 0 && result.stderr)
    .map((result) => result.stderr);

  return {
    repository,
    branch: branch.code === 0 && branch.stdout ? branch.stdout : null,
    commit: commit.code === 0 && commit.stdout ? commit.stdout : null,
    dirty: dirty.code === 0 ? Boolean(dirty.stdout) : null,
    error: errors.length > 0 ? errors.join("; ") : null,
  };
}

/** Shared shape of the two marker files: allowlisted value, else the default. */
function inspectMarker(
  start: string,
  filename: string,
  known: ReadonlySet<string>,
  fallback: string,
  label: string,
): MarkerValue {
  const repoRoot = resolveRepoRoot(resolve(start));
  if (repoRoot === null) return { value: fallback, source: null, note: "no repository" };
  const marker = join(repoRoot, filename);
  if (!existsSync(marker)) return { value: fallback, source: null, note: null };
  let raw: string;
  try {
    raw = readFileSync(marker, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { value: fallback, source: marker, note: `unreadable: ${message}` };
  }
  const value = raw.trim().toLowerCase();
  if (known.has(value)) return { value, source: marker, note: null };
  return {
    value: fallback,
    source: marker,
    note: `unknown ${label} '${value}', defaulting to ${fallback}`,
  };
}

export function inspectCloneRole(start: string): MarkerValue {
  return inspectMarker(start, CLONE_ROLE_FILENAME, KNOWN_CLONE_ROLES, DEFAULT_CLONE_ROLE, "role");
}

export function inspectUpdateChannel(start: string, override: string | null = null): MarkerValue {
  if (override) {
    const value = override.trim().toLowerCase();
    if (KNOWN_UPDATE_CHANNELS.has(value)) return { value, source: null, note: "command override" };
    return {
      value: DEFAULT_UPDATE_CHANNEL,
      source: null,
      note: `unknown channel '${value}', defaulting to ${DEFAULT_UPDATE_CHANNEL}`,
    };
  }
  return inspectMarker(
    start,
    UPDATE_CHANNEL_FILENAME,
    KNOWN_UPDATE_CHANNELS,
    DEFAULT_UPDATE_CHANNEL,
    "channel",
  );
}

/** `origin/<channel>` — the only place a channel becomes a git ref. */
export function upstreamFor(channel: MarkerValue): string {
  return `origin/${channel.value}`;
}

/**
 * Port of `_version_from_pyproject`: walk upward for the first `version =`
 * line. Python prefers installed distribution metadata and falls back to this;
 * TypeScript has no equivalent metadata, so the walk is the shared source. The
 * two agree for an editable install.
 */
export function versionFromPyproject(start: string): string | null {
  let current = resolve(start);
  for (;;) {
    const candidate = join(current, "pyproject.toml");
    if (existsSync(candidate)) {
      for (const line of readFileSync(candidate, "utf8").split("\n")) {
        if (line.trim().startsWith("version =")) {
          const quoted = line.split("=", 2)[1]?.trim() ?? "";
          const value = quoted.replace(/^["']|["']$/g, "");
          if (value) return value;
        }
      }
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Port of `_classify_update_status`: ancestry from the local object database. */
function classifyUpdateStatus(
  repository: string,
  localCommit: string | null,
  remoteCommit: string,
): string {
  if (localCommit && (remoteCommit === localCommit || remoteCommit.startsWith(localCommit))) {
    return "up_to_date";
  }
  if (runGit(["merge-base", "--is-ancestor", remoteCommit, "HEAD"], repository).code === 0) {
    return "local_ahead";
  }
  if (runGit(["merge-base", "--is-ancestor", "HEAD", remoteCommit], repository).code === 0) {
    return "update_available";
  }
  const known = runGit(["cat-file", "-e", `${remoteCommit}^{commit}`], repository);
  return known.code === 0 ? "diverged" : "update_available";
}

function availability(
  version: string,
  updateChannel: MarkerValue,
  fields: Partial<UpdateAvailability>,
): UpdateAvailability {
  return {
    version,
    upstream: null,
    local_commit: null,
    remote_commit: null,
    status: "unknown",
    note: null,
    update_channel: updateChannel,
    target_release: null,
    ...fields,
  };
}

/**
 * Is the channel's remote branch ahead of HEAD? The remote query is the only
 * authority: remote-tracking refs are only as fresh as the last fetch, and
 * trusting them is how a clone two releases behind gets told it is ahead.
 */
export function checkUpdateAvailability(
  start: string,
  channel: string | null,
  version: string,
): UpdateAvailability {
  const startPath = resolve(start);
  const git = inspectGit(startPath);
  const updateChannel = inspectUpdateChannel(startPath, channel);
  if (git.repository === null) {
    return availability(version, updateChannel, { note: "repository unavailable" });
  }

  // With a channel the upstream is always `origin/<channel>`, so the oracle's
  // `no_upstream` branch is unreachable here: whether that ref exists locally
  // is the update PLAN's question (plateau 3), not this check's. An unfetched
  // channel therefore falls through to the remote query, which is the only
  // authority, and reports `unknown` when the branch does not exist remotely.
  const upstream = upstreamFor(updateChannel);
  const [remote, branch] = [
    upstream.split("/", 1)[0] as string,
    upstream.split("/").slice(1).join("/"),
  ];
  if (!remote || !branch) {
    return availability(version, updateChannel, {
      upstream,
      local_commit: git.commit,
      note: "unexpected upstream name",
    });
  }

  const remoteUrl = runGit(["config", "--get", `remote.${remote}.url`], git.repository);
  if (remoteUrl.code !== 0 || !remoteUrl.stdout) {
    return availability(version, updateChannel, {
      upstream,
      local_commit: git.commit,
      note: remoteUrl.stderr || `remote ${remote} has no url`,
    });
  }

  const lsRemote = runGit(
    ["ls-remote", remote, `refs/heads/${branch}`],
    git.repository,
    GIT_NETWORK_TIMEOUT_MS,
  );
  if (lsRemote.code !== 0 || !lsRemote.stdout) {
    return availability(version, updateChannel, {
      upstream,
      local_commit: git.commit,
      note: lsRemote.stderr || "remote query failed",
    });
  }
  const parts = lsRemote.stdout.split(/\s+/);
  if (parts.length < 2) {
    return availability(version, updateChannel, {
      upstream,
      local_commit: git.commit,
      note: `unexpected ls-remote output: ${lsRemote.stdout}`,
    });
  }

  const remoteCommit = parts[0] as string;
  const localFull = runGit(["rev-parse", "HEAD"], git.repository);
  const localCommit = localFull.code === 0 && localFull.stdout ? localFull.stdout : git.commit;
  return availability(version, updateChannel, {
    upstream,
    local_commit: localCommit,
    remote_commit: remoteCommit,
    status: classifyUpdateStatus(git.repository, localCommit, remoteCommit),
  });
}

/**
 * Port of `inspect_git_update_plan`: how far HEAD is from the channel's
 * upstream, and whether a fast-forward is the honest move.
 *
 * Unlike `checkUpdateAvailability`, this asks the LOCAL object database only --
 * it is the plan, not the check, so an unfetched channel is `blocked` here
 * rather than a reason to query the remote.
 */
export function inspectGitUpdatePlan(
  git: GitStatus,
  updateChannel: MarkerValue | null = null,
): GitUpdatePlan {
  const blocked = (upstream: string | null, note: string): GitUpdatePlan => ({
    upstream,
    ahead: null,
    behind: null,
    ready: false,
    action: "blocked",
    note,
  });
  if (git.repository === null) return blocked(null, "repository unavailable");

  let upstream: string;
  if (updateChannel === null) {
    const resolved = runGit(
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      git.repository,
    );
    if (resolved.code !== 0 || !resolved.stdout) {
      return blocked(null, resolved.stderr || "no upstream configured");
    }
    upstream = resolved.stdout;
  } else {
    upstream = upstreamFor(updateChannel);
    const verified = runGit(["rev-parse", "--verify", upstream], git.repository);
    if (verified.code !== 0) {
      return blocked(
        upstream,
        verified.stderr || `update channel ${updateChannel.value} is not fetched`,
      );
    }
  }

  const counted = runGit(
    ["rev-list", "--left-right", "--count", `HEAD...${upstream}`],
    git.repository,
  );
  if (counted.code !== 0 || !counted.stdout) {
    return blocked(upstream, counted.stderr || "cannot compare upstream");
  }
  const [aheadText, behindText] = counted.stdout.split(/\s+/);
  const ahead = Number(aheadText);
  const behind = Number(behindText);
  if (
    aheadText === undefined ||
    behindText === undefined ||
    !Number.isInteger(ahead) ||
    !Number.isInteger(behind)
  ) {
    return blocked(upstream, `unexpected git count: ${counted.stdout}`);
  }

  if (ahead === 0 && behind === 0) {
    return { upstream, ahead, behind, ready: true, action: "none", note: "already up to date" };
  }
  if (ahead === 0 && behind > 0) {
    return {
      upstream,
      ahead,
      behind,
      ready: true,
      action: "pull",
      note: `pull ${behind} remote commit(s)`,
    };
  }
  if (ahead > 0 && behind === 0) {
    return {
      upstream,
      ahead,
      behind,
      ready: false,
      action: "blocked",
      note: "local commits present",
    };
  }
  return { upstream, ahead, behind, ready: false, action: "blocked", note: "branch diverged" };
}

export function renderRuntimeVersion(report: RuntimeVersionReport): string {
  const lines = ["Mirror runtime version", ""];
  lines.push(`Version: ${report.version}`);
  lines.push(`Repository: ${report.git.repository ? report.git.repository : "unknown"}`);
  lines.push(`Git branch: ${report.git.branch || "unknown"}`);
  lines.push(`Git commit: ${report.git.commit || "unknown"}`);
  if (report.git.error) lines.push(`Git status note: ${report.git.error}`);
  lines.push(`Clone role: ${report.cloneRole.value}`);
  if (report.cloneRole.note) lines.push(`Clone role note: ${report.cloneRole.note}`);
  lines.push(`Update channel: ${report.updateChannel.value}`);
  if (report.updateChannel.note) lines.push(`Update channel note: ${report.updateChannel.note}`);
  return `${lines.join("\n")}\n`;
}

export function renderRuntimeUpdateAvailability(report: UpdateAvailability): string {
  const lines = ["Mirror runtime update check", ""];
  lines.push(`Version: ${report.version}`);
  lines.push(`Update channel: ${report.update_channel.value}`);
  if (report.update_channel.note) lines.push(`Update channel note: ${report.update_channel.note}`);
  lines.push(`Current: ${report.local_commit ? report.local_commit.slice(0, 7) : "unknown"}`);
  if (report.upstream) {
    const remote = report.remote_commit ? report.remote_commit.slice(0, 7) : "unknown";
    lines.push(`Upstream: ${report.upstream} @ ${remote}`);
  } else {
    lines.push("Upstream: none");
  }
  lines.push(`Availability: ${report.status}`);
  if (report.note) lines.push(`Reason: ${report.note}`);
  if (report.status === "update_available") {
    lines.push("");
    if (report.update_channel.value === "stable") {
      lines.push(
        "Release details: not fetched by this check; dry-run can show them when local refs contain release notes.",
      );
    }
    lines.push("Preview:");
    lines.push("uv run python -m memory runtime update --dry-run");
    lines.push("");
    lines.push("Update:");
    lines.push("uv run python -m memory runtime update");
  } else if (report.status === "up_to_date") {
    lines.push("");
    lines.push("Next: no update needed");
  }
  return `${lines.join("\n")}\n`;
}
