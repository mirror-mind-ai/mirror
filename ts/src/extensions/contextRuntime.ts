import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { parse } from "yaml";
import type { Database } from "#db/database.ts";

export const MIRROR_CONTEXT_PROTOCOL = "mirror-context-v1";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const EXTENSION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CAPABILITY_ID = /^[a-z][a-z0-9_-]*$/;

export interface ExtensionContextRequest {
  protocol: typeof MIRROR_CONTEXT_PROTOCOL;
  extension_id: string;
  capability_id: string;
  extension_root: string;
  table_prefix: string;
  database_path: string;
  persona_id: string | null;
  journey_id: string | null;
  user: string;
  query: string | null;
  binding_kind: string;
  binding_target: string | null;
}

export interface ExtensionContextSection {
  extensionId: string;
  capabilityId: string;
  bindingKind: string;
  bindingTarget: string | null;
  text: string;
}

export type ExtensionContextDiagnosticKind =
  | "missing_extension"
  | "invalid_manifest"
  | "unknown_capability"
  | "provider_failed"
  | "provider_timeout"
  | "invalid_output";

export interface ExtensionContextDiagnostic {
  kind: ExtensionContextDiagnosticKind;
}

export interface CollectExtensionContextOptions {
  mirrorHome: string;
  databasePath: string;
  personaId?: string | null;
  journeyId?: string | null;
  user?: string;
  query?: string | null;
  timeoutMs?: number;
  maxOutputBytes?: number;
  legacyCommand?: readonly string[];
  legacyCwd?: string;
  environment?: NodeJS.ProcessEnv;
}

interface Binding {
  extensionId: string;
  capabilityId: string;
  targetKind: string;
  targetId: string | null;
}

interface ProviderRuntime {
  protocol: typeof MIRROR_CONTEXT_PROTOCOL;
  command: string[];
}

interface Capability {
  id: string;
  providerRuntime: ProviderRuntime | null;
}

interface ExtensionManifest {
  id: string;
  tablePrefix: string;
  capabilities: Capability[];
}

export interface CollectedExtensionContext {
  sections: ExtensionContextSection[];
  rendered: string;
  diagnostics: ExtensionContextDiagnostic[];
}

export function selectExtensionBindings(
  db: Database,
  personaId?: string | null,
  journeyId?: string | null,
): Binding[] {
  const clauses: string[] = [];
  const params: string[] = [];
  if (personaId) {
    clauses.push("(target_kind = 'persona' AND target_id = ?)");
    params.push(personaId);
  }
  if (journeyId) {
    clauses.push("(target_kind = 'journey' AND target_id = ?)");
    params.push(journeyId);
  }
  if (clauses.length === 0) return [];
  return db
    .prepare(
      `SELECT extension_id, capability_id, target_kind, target_id
       FROM _ext_bindings
       WHERE ${clauses.join(" OR ")}
       ORDER BY extension_id, capability_id, target_kind, target_id`,
    )
    .all(...params)
    .map((row) => ({
      extensionId: String(row.extension_id),
      capabilityId: String(row.capability_id),
      targetKind: String(row.target_kind),
      targetId: typeof row.target_id === "string" ? row.target_id : null,
    }));
}

export function renderExtensionSections(sections: readonly ExtensionContextSection[]): string {
  return sections
    .map((section) =>
      [`=== extension/${section.extensionId}/${section.capabilityId} ===`, section.text].join("\n"),
    )
    .join("\n\n");
}

export function collectExtensionContext(
  db: Database,
  options: CollectExtensionContextOptions,
): CollectedExtensionContext {
  const sections: ExtensionContextSection[] = [];
  const diagnostics: ExtensionContextDiagnostic[] = [];
  const bindings = selectExtensionBindings(db, options.personaId, options.journeyId);
  for (const binding of bindings) {
    const extensionRoot = resolve(options.mirrorHome, "extensions", binding.extensionId);
    if (!existsSync(extensionRoot)) {
      diagnostics.push({ kind: "missing_extension" });
      continue;
    }
    let manifest: ExtensionManifest;
    try {
      manifest = readContextManifest(extensionRoot);
    } catch {
      diagnostics.push({ kind: "invalid_manifest" });
      continue;
    }
    const capability = manifest.capabilities.find(
      (candidate) => candidate.id === binding.capabilityId,
    );
    if (!capability) {
      diagnostics.push({ kind: "unknown_capability" });
      continue;
    }
    const request: ExtensionContextRequest = {
      protocol: MIRROR_CONTEXT_PROTOCOL,
      extension_id: binding.extensionId,
      capability_id: binding.capabilityId,
      extension_root: extensionRoot,
      table_prefix: manifest.tablePrefix,
      database_path: resolve(options.databasePath),
      persona_id: options.personaId ?? null,
      journey_id: options.journeyId ?? null,
      user: options.user ?? "",
      query: options.query ?? null,
      binding_kind: binding.targetKind,
      binding_target: binding.targetId,
    };
    const invocation = capability.providerRuntime
      ? { command: capability.providerRuntime.command, cwd: extensionRoot }
      : {
          command: [
            ...(options.legacyCommand ?? [
              "uv",
              "run",
              "python",
              "-m",
              "memory.extensions.compat_host",
            ]),
          ],
          cwd: options.legacyCwd ?? process.cwd(),
        };
    const outcome = invokeProvider(invocation.command, invocation.cwd, request, options);
    if (outcome.diagnostic) {
      diagnostics.push({ kind: outcome.diagnostic });
      continue;
    }
    if (!outcome.text) continue;
    sections.push({
      extensionId: binding.extensionId,
      capabilityId: binding.capabilityId,
      bindingKind: binding.targetKind,
      bindingTarget: binding.targetId,
      text: outcome.text,
    });
  }
  return { sections, rendered: renderExtensionSections(sections), diagnostics };
}

function readContextManifest(extensionRoot: string): ExtensionManifest {
  const manifestPath = resolve(extensionRoot, "skill.yaml");
  const raw = parse(readFileSync(manifestPath, "utf8")) as unknown;
  if (!isRecord(raw) || typeof raw.id !== "string" || !EXTENSION_ID.test(raw.id)) throw new Error();
  if (resolve(extensionRoot).split(/[\\/]/).at(-1) !== raw.id) throw new Error();
  const expectedPrefix = tablePrefix(raw.id);
  if (raw.table_prefix !== undefined && raw.table_prefix !== expectedPrefix) throw new Error();
  const providers = raw.mirror_context_providers;
  if (providers === undefined || providers === null)
    return { id: raw.id, tablePrefix: expectedPrefix, capabilities: [] };
  if (!Array.isArray(providers)) throw new Error();
  const seen = new Set<string>();
  const capabilities = providers.map((provider): Capability => {
    if (!isRecord(provider) || typeof provider.id !== "string" || !CAPABILITY_ID.test(provider.id))
      throw new Error();
    if (seen.has(provider.id)) throw new Error();
    seen.add(provider.id);
    const runtime = provider.provider_runtime;
    if (runtime === undefined || runtime === null)
      return { id: provider.id, providerRuntime: null };
    if (
      !isRecord(runtime) ||
      runtime.protocol !== MIRROR_CONTEXT_PROTOCOL ||
      !Array.isArray(runtime.command) ||
      runtime.command.length === 0 ||
      !runtime.command.every((part) => typeof part === "string" && part.length > 0)
    )
      throw new Error();
    validateCommandPaths(extensionRoot, runtime.command as string[]);
    return {
      id: provider.id,
      providerRuntime: {
        protocol: MIRROR_CONTEXT_PROTOCOL,
        command: [...(runtime.command as string[])],
      },
    };
  });
  return {
    id: raw.id,
    tablePrefix: expectedPrefix,
    capabilities,
  };
}

function validateCommandPaths(extensionRoot: string, command: readonly string[]): void {
  for (const [index, argument] of command.entries()) {
    const pathLike =
      isAbsolute(argument) ||
      argument.includes("/") ||
      argument.includes("\\") ||
      (index > 0 && /\.(?:[cm]?js|py)$/i.test(argument));
    if (!pathLike) continue;
    const candidate = resolve(extensionRoot, argument);
    const rel = relative(resolve(extensionRoot), candidate);
    if (isAbsolute(argument) || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\"))
      throw new Error();
    if (!existsSync(candidate)) throw new Error();
  }
}

function invokeProvider(
  command: readonly string[],
  cwd: string,
  request: ExtensionContextRequest,
  options: CollectExtensionContextOptions,
): { text?: string | null; diagnostic?: ExtensionContextDiagnosticKind } {
  const result = spawnSync(command[0] as string, command.slice(1), {
    cwd,
    encoding: "utf8",
    input: `${JSON.stringify(request)}\n`,
    env: options.environment ?? process.env,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    windowsHide: true,
    shell: false,
  });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    return { diagnostic: code === "ETIMEDOUT" ? "provider_timeout" : "provider_failed" };
  }
  if (result.signal || result.status !== 0) return { diagnostic: "provider_failed" };
  try {
    const parsed = JSON.parse(result.stdout.trim()) as unknown;
    if (
      !isRecord(parsed) ||
      parsed.protocol !== MIRROR_CONTEXT_PROTOCOL ||
      !(parsed.text === null || typeof parsed.text === "string")
    )
      return { diagnostic: "invalid_output" };
    return { text: parsed.text as string | null };
  } catch {
    return { diagnostic: "invalid_output" };
  }
}

function tablePrefix(extensionId: string): string {
  return `ext_${extensionId.replaceAll("-", "_")}_`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
