// An extension's installation settings: `<mirror-home>/extensions/<id>.env` (CR145).
//
// The `mirror-cli-v1` and `mirror-context-v1` contracts hand a spawned
// extension the environment the `mirror` process had, and nothing else. That
// left an extension's own installation settings -- which host, which TLS mode,
// which certificate on this machine -- with nowhere to live but the login
// shell, where two of them (`PGSSLMODE`, `NODE_EXTRA_CA_CERTS`) broke every
// other Postgres client and Node process on the machine. Node reads
// `NODE_EXTRA_CA_CERTS` before any extension code runs, so only the spawner can
// set it, and the spawner is Mirror.
//
// The file sits BESIDE the installed directory, not inside it, for two reasons
// measured on the maintainer's machine: `extensions install` rewrites the
// directory, and in a development home the directory is a symlink into the
// extension's own git repository, where a `.env` would be one `git add .` away
// from a push.
//
// Precedence is the ecosystem's and Mirror's own (`runtime/config.ts`): a
// variable already in the environment wins, the file fills the gaps, and the
// five `MIRROR_*` names the dispatcher owns can never come from the file. The
// merged environment reaches the one spawned process; `process.env` is read,
// never written.

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { extensionsRootForHome } from "./catalog.ts";
import { SKILL_ID_RE } from "./manifest.ts";

/**
 * The names the dispatcher sets last for a subcommand, and that a provider
 * receives on stdin rather than in its environment. Dropped from the file at
 * the merge, at both spawn points, so the file can steer neither.
 */
export const RESERVED_SETTINGS_NAMES: readonly string[] = [
  "MIRROR_HOME",
  "MIRROR_DATABASE_PATH",
  "MIRROR_EXTENSION_ID",
  "MIRROR_EXTENSION_ROOT",
  "MIRROR_TABLE_PREFIX",
];

export type ExtensionSettings =
  | { kind: "absent"; path: string }
  | {
      kind: "read";
      path: string;
      /** Sorted by name, as `parseEnv` yields them; a duplicate key's last value. */
      variables: Record<string, string>;
      /** The mode, when group or others can read the file; null when only the owner can. */
      exposedMode: string | null;
    }
  | { kind: "unreadable"; path: string; reason: string };

export function extensionSettingsPath(mirrorHome: string, extensionId: string): string {
  return join(extensionsRootForHome(mirrorHome), `${extensionId}.env`);
}

/**
 * Read the settings file, as a result and never a throw.
 *
 * An id outside the manifest's grammar is `unreadable` before any path is
 * built: the context runtime takes ids from `_ext_bindings` rows, and a path
 * must not be steerable by database content. "Unreadable" is the fail-closed
 * answer at both call sites -- the dispatcher refuses, the provider reports.
 *
 * A UTF-8 BOM is stripped before parsing: `parseEnv` would otherwise keep it
 * in the first key's name, and the editor that wrote it never shows it.
 */
export function readExtensionSettings(mirrorHome: string, extensionId: string): ExtensionSettings {
  if (!SKILL_ID_RE.test(extensionId)) {
    return {
      kind: "unreadable",
      path: join(extensionsRootForHome(mirrorHome), "<id>.env"),
      reason: `'${extensionId}' is not a valid extension id`,
    };
  }
  const path = extensionSettingsPath(mirrorHome, extensionId);
  let text: string;
  let mode: number;
  try {
    const stat = statSync(path, { throwIfNoEntry: false });
    if (stat === undefined) return { kind: "absent", path };
    mode = stat.mode;
    text = readFileSync(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { kind: "unreadable", path, reason: code ?? (error as Error).message };
  }
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(parseEnv(text.replace(/^\uFEFF/, "")))) {
    if (value !== undefined) variables[key] = value;
  }
  return { kind: "read", path, variables, exposedMode: exposedModeOf(mode) };
}

/**
 * The file's mode as `0644` when group or others can read it, else null.
 * Mode bits mean nothing on Windows, where every file would read as exposed.
 */
function exposedModeOf(mode: number): string | null {
  if (process.platform === "win32") return null;
  const permissions = mode & 0o777;
  return (permissions & 0o044) === 0 ? null : `0${permissions.toString(8)}`;
}

/**
 * The file UNDER the environment: `{ ...file, ...environment }`, with the
 * reserved names removed from the file first. A key present in the
 * environment -- even as an empty string -- is already set and wins, the rule
 * `loadEnvFileWithoutOverride` applies to the home's own files.
 */
export function settingsUnderEnvironment(
  environment: NodeJS.ProcessEnv,
  settings: ExtensionSettings,
): NodeJS.ProcessEnv {
  if (settings.kind !== "read") return { ...environment };
  const fromFile: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings.variables)) {
    if (RESERVED_SETTINGS_NAMES.includes(key)) continue;
    fromFile[key] = value;
  }
  return { ...fromFile, ...environment };
}

/**
 * The `ext <id>` listing's last line. Keys only, never a value: a key's name
 * says a setting exists, which is what a person checking the file needs; its
 * value is what must not end up in a transcript.
 */
export function describeExtensionSettings(settings: ExtensionSettings): string {
  switch (settings.kind) {
    case "absent":
      return `settings: ${settings.path} (not present — create it to pass settings to this extension)`;
    case "unreadable":
      return `settings: ${settings.path} (unreadable: ${settings.reason})`;
    case "read": {
      const keys = Object.keys(settings.variables);
      const state = keys.length === 0 ? "no variables" : keys.join(", ");
      const exposure =
        settings.exposedMode === null
          ? ""
          : `; mode ${settings.exposedMode}, readable by other users`;
      return `settings: ${settings.path} (${state}${exposure})`;
    }
  }
}
