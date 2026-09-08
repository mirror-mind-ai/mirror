// Extension manifest validation (CV22.DS7.TS3 plateau 3a). Port of
// `load_extension_manifest` and its helpers from `src/memory/cli/extensions.py`.
//
// Why this lands in TS3 rather than TS4, where the extension catalog lives:
// `inspect_extension_health` -- which `runtime status` renders -- calls the
// validator for two fields (`id`, `kind`) and prints `str(exc)` verbatim as
// the health note when it raises. Knowing a manifest is valid IS running the
// validator, so there is no smaller honest port. TS4 extends this module.
//
// TWO RECORDED DIVERGENCES, both from the YAML parser and neither from us
// (Navigator decision, 2026-09-08):
//
//   D1. `_load_yaml` renders `invalid YAML in {path}: {exc}` where `{exc}` is
//       PyYAML's own error text. The `yaml` package cannot reproduce it. The
//       golden pins the stable prefix byte-for-byte and records both tails.
//   D2. PyYAML is YAML 1.1; `yaml` is YAML 1.2. An unquoted `no`/`yes`/`on`/
//       `off`, octal, or sexagesimal scalar resolves differently. The same
//       family swallows one branch outright: Python's `runtime names must be
//       strings` is unreachable here, because a JavaScript object key is
//       always a string. A manifest keying a runtime by `1:` gets Python's
//       type error and TypeScript's `invalid runtime name: 1`.
//
// Every Mirror-authored message below is byte-identical across cores.

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parse } from "yaml";
import { pyRepr, pyStr, pyTruthy } from "#util/pythonText.ts";
import { ExtensionValidationError } from "./errors.ts";
import { tablePrefixFor } from "./migrations.ts";

const ALLOWED_KINDS = new Set(["prompt-skill", "command-skill"]);
const RUNTIME_NAME_RE = /^[a-z][a-z0-9_-]*$/;
const SKILL_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUIRED_FIELDS = ["id", "name", "category", "kind", "summary", "runtimes"] as const;
const PATH_LIKE_SUFFIXES = new Set([".js", ".mjs", ".cjs", ".py"]);

/**
 * The validated manifest. Deliberately narrow: `runtime status` reads the id
 * and the kind, and nothing else here has a consumer yet. TS4 widens this when
 * the catalog commands give the remaining fields somewhere to go -- an unread
 * `data` blob would be scaffolding, not API.
 */
export interface ExtensionManifest {
  id: string;
  kind: string;
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Port of `_load_yaml`. See D1 for the malformed-YAML branch. */
function loadYaml(manifestPath: string): Record<string, unknown> {
  let text: string;
  try {
    text = readFileSync(manifestPath, "utf8");
  } catch {
    throw new ExtensionValidationError(`missing manifest: ${manifestPath}`);
  }
  let data: unknown;
  try {
    data = parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ExtensionValidationError(`invalid YAML in ${manifestPath}: ${detail}`);
  }
  if (!isMapping(data)) {
    throw new ExtensionValidationError(`manifest must be a mapping: ${manifestPath}`);
  }
  return data;
}

/** Port of `_validate_runtime_name`. */
function validateRuntimeName(name: string): void {
  if (!RUNTIME_NAME_RE.test(name)) {
    throw new ExtensionValidationError(`invalid runtime name: ${name}`);
  }
}

/** Port of `_validate_command_name`: the per-runtime command namespaces. */
function validateCommandName(runtime: string, commandName: string): void {
  if (runtime === "claude" && !commandName.startsWith("ext:")) {
    throw new ExtensionValidationError(`runtime '${runtime}' command_name must start with 'ext:'`);
  }
  if (runtime === "pi" && !commandName.startsWith("ext-")) {
    throw new ExtensionValidationError(`runtime '${runtime}' command_name must start with 'ext-'`);
  }
}

/** Python `Path(p).suffix.lower()`. */
function suffixOf(argument: string): string {
  const base = argument.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

/** Python `candidate.is_relative_to(root)`. */
function isRelativeTo(candidate: string, root: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Port of `_validate_context_providers`. */
function validateContextProviders(
  data: Record<string, unknown>,
  extensionDir: string,
  manifestPath: string,
): void {
  const providers = data.mirror_context_providers;
  if (providers === null || providers === undefined) return;
  if (!Array.isArray(providers)) {
    throw new ExtensionValidationError(
      `mirror_context_providers must be a list in ${manifestPath}`,
    );
  }
  const seen = new Set<string>();
  const root = resolve(extensionDir);
  for (const provider of providers) {
    if (!isMapping(provider)) {
      throw new ExtensionValidationError(
        `mirror_context_providers entries must be objects in ${manifestPath}`,
      );
    }
    const capabilityId = provider.id;
    if (typeof capabilityId !== "string" || !RUNTIME_NAME_RE.test(capabilityId)) {
      throw new ExtensionValidationError(
        `invalid mirror context capability id ${pyRepr(capabilityId)} in ${manifestPath}`,
      );
    }
    if (seen.has(capabilityId)) {
      throw new ExtensionValidationError(
        `duplicate mirror context capability id ${pyRepr(capabilityId)} in ${manifestPath}`,
      );
    }
    seen.add(capabilityId);
    const runtime = provider.provider_runtime;
    if (runtime === null || runtime === undefined) continue;
    if (!isMapping(runtime) || runtime.protocol !== "mirror-context-v1") {
      throw new ExtensionValidationError(
        `provider_runtime for ${pyRepr(capabilityId)} must use mirror-context-v1 ` +
          `in ${manifestPath}`,
      );
    }
    const command = runtime.command;
    if (
      !Array.isArray(command) ||
      command.length === 0 ||
      command.some((part) => typeof part !== "string" || part.length === 0)
    ) {
      throw new ExtensionValidationError(
        `provider_runtime.command for ${pyRepr(capabilityId)} must be a non-empty argv list ` +
          `in ${manifestPath}`,
      );
    }
    for (const [index, argument] of (command as string[]).entries()) {
      const pathLike =
        isAbsolute(argument) ||
        argument.includes("/") ||
        argument.includes("\\") ||
        (index > 0 && PATH_LIKE_SUFFIXES.has(suffixOf(argument)));
      if (!pathLike) continue;
      const candidate = resolve(root, argument);
      if (isAbsolute(argument) || !isRelativeTo(candidate, root)) {
        throw new ExtensionValidationError(
          `provider_runtime.command path escapes extension root in ${manifestPath}`,
        );
      }
      if (!existsSync(candidate)) {
        throw new ExtensionValidationError(`provider_runtime.command path not found: ${candidate}`);
      }
    }
  }
}

/**
 * Port of `load_extension_manifest`. Check order is load-bearing: the oracle
 * reports the FIRST failure, so reordering would change the health note text
 * for a manifest that breaks two rules at once.
 */
export function loadExtensionManifest(extensionDir: string): ExtensionManifest {
  // `join`, not `resolve`: the oracle builds these display paths with
  // `extension_dir / name`, which does not normalize `..`, and the path is
  // interpolated into error messages the health note prints verbatim.
  const manifestPath = join(extensionDir, "skill.yaml");
  const data = loadYaml(manifestPath);

  for (const field of REQUIRED_FIELDS) {
    if (!pyTruthy(data[field])) {
      throw new ExtensionValidationError(`missing required field '${field}' in ${manifestPath}`);
    }
  }

  const skillId = data.id;
  if (typeof skillId !== "string" || !SKILL_ID_RE.test(skillId)) {
    throw new ExtensionValidationError(`invalid skill id '${pyStr(skillId)}' in ${manifestPath}`);
  }

  if (data.category !== "extension") {
    throw new ExtensionValidationError(
      `unsupported category '${pyStr(data.category)}' in ${manifestPath}`,
    );
  }

  const kind = data.kind;
  if (typeof kind !== "string" || !ALLOWED_KINDS.has(kind)) {
    throw new ExtensionValidationError(`unsupported kind '${pyStr(kind)}' in ${manifestPath}`);
  }

  const runtimes = data.runtimes;
  if (!isMapping(runtimes) || Object.keys(runtimes).length === 0) {
    throw new ExtensionValidationError(`runtimes must be a non-empty mapping in ${manifestPath}`);
  }

  const entrypoint = data.entrypoint;
  if (kind === "command-skill") {
    if (!isMapping(entrypoint) || !pyTruthy(entrypoint.module)) {
      throw new ExtensionValidationError(
        "command-skill requires entrypoint.module (a Python module " +
          `name under the extension directory) in ${manifestPath}`,
      );
    }
    const moduleName = entrypoint.module;
    if (typeof moduleName !== "string" || moduleName.length === 0) {
      throw new ExtensionValidationError(
        `entrypoint.module must be a non-empty string in ${manifestPath}`,
      );
    }
    const modulePath = join(extensionDir, `${moduleName}.py`);
    if (!existsSync(modulePath)) {
      throw new ExtensionValidationError(
        `entrypoint.module '${moduleName}' not found at ${modulePath}`,
      );
    }

    const expectedPrefix = tablePrefixFor(skillId);
    const declaredPrefix = data.table_prefix;
    if (declaredPrefix !== null && declaredPrefix !== undefined) {
      if (declaredPrefix !== expectedPrefix) {
        throw new ExtensionValidationError(
          `table_prefix '${pyStr(declaredPrefix)}' does not match the ` +
            `required prefix '${expectedPrefix}' for id '${skillId}' ` +
            `in ${manifestPath}`,
        );
      }
    }
  }

  for (const [runtimeName, runtimeData] of Object.entries(runtimes)) {
    validateRuntimeName(runtimeName);
    if (!isMapping(runtimeData)) {
      throw new ExtensionValidationError(
        `runtime '${runtimeName}' must map to an object in ${manifestPath}`,
      );
    }
    const commandName = runtimeData.command_name;
    if (typeof commandName !== "string" || commandName.length === 0) {
      throw new ExtensionValidationError(
        `runtime '${runtimeName}' missing command_name in ${manifestPath}`,
      );
    }
    validateCommandName(runtimeName, commandName);

    const skillFile = runtimeData.skill_file;
    if (kind === "prompt-skill" && (typeof skillFile !== "string" || skillFile.length === 0)) {
      throw new ExtensionValidationError(
        `prompt-skill runtime '${runtimeName}' missing skill_file in ${manifestPath}`,
      );
    }
    if (typeof skillFile === "string" && skillFile.length > 0) {
      const skillPath = join(extensionDir, skillFile);
      if (!existsSync(skillPath)) {
        throw new ExtensionValidationError(
          `runtime '${runtimeName}' skill_file not found: ${skillPath}`,
        );
      }
    }
  }

  validateContextProviders(data, extensionDir, manifestPath);

  return { id: skillId, kind };
}
