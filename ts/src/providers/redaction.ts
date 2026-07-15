const REDACTION_MARKER = "[REDACTED]";

const SECRET_KEY_PATTERN = /(?:api[_-]?key|apikey|authorization|token|secret|password|credential)/i;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[^\s,;"'}\]]+/gi;

export interface RedactionOptions {
  secrets?: readonly string[];
}

export class UnsafeFixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeFixtureError";
  }
}

export function redactString(value: string, options: RedactionOptions = {}): string {
  let redacted = value.replace(BEARER_TOKEN_PATTERN, `Bearer ${REDACTION_MARKER}`);
  for (const secret of normalizedSecrets(options.secrets ?? [])) {
    redacted = redacted.split(secret).join(REDACTION_MARKER);
  }
  return redacted;
}

export function redactJson(value: unknown, options: RedactionOptions = {}): unknown {
  return redactJsonValue(value, options, undefined);
}

export function assertFixtureSafe(value: unknown, options: RedactionOptions = {}): void {
  const leaks = findFixtureLeaks(value, options);
  if (leaks.length > 0) {
    throw new UnsafeFixtureError(
      `unsafe fixture contains unsanitized secret material: ${leaks.join(", ")}`,
    );
  }
}

function redactJsonValue(
  value: unknown,
  options: RedactionOptions,
  key: string | undefined,
): unknown {
  if (SECRET_KEY_PATTERN.test(key ?? "")) {
    return REDACTION_MARKER;
  }
  if (typeof value === "string") {
    return redactString(value, options);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactJsonValue(item, options, undefined));
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      redactJsonValue(childValue, options, childKey),
    ]);
    return Object.fromEntries(entries);
  }
  return value;
}

function findFixtureLeaks(value: unknown, options: RedactionOptions): string[] {
  const leaks: string[] = [];
  walk(value, [], (path, current, key) => {
    if (typeof current !== "string") {
      return;
    }
    const pathText = path.join(".") || "<root>";
    if (SECRET_KEY_PATTERN.test(key ?? "") && current !== REDACTION_MARKER) {
      leaks.push(`${pathText} uses secret-looking key without redaction`);
      return;
    }
    if (BEARER_TOKEN_PATTERN.test(current) && !current.includes(REDACTION_MARKER)) {
      leaks.push(`${pathText} contains bearer token`);
    }
    for (const secret of normalizedSecrets(options.secrets ?? [])) {
      if (current.includes(secret)) {
        leaks.push(`${pathText} contains configured secret`);
      }
    }
  });
  return leaks;
}

function walk(
  value: unknown,
  path: readonly string[],
  visit: (path: readonly string[], value: unknown, key: string | undefined) => void,
): void {
  visit(path, value, path.at(-1));
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walk(item, [...path, String(index)], visit);
    });
    return;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      walk(child, [...path, key], visit);
    }
  }
}

function normalizedSecrets(secrets: readonly string[]): string[] {
  return secrets.map((secret) => secret.trim()).filter((secret) => secret.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
