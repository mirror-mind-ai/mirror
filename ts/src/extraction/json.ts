export function parseJsonResponse(raw: string): unknown | null {
  let value = raw.trim();
  if (!value) return null;
  if (value.startsWith("```")) {
    // Python removes the first fence line, then only removes a final bare fence.
    value = value.includes("\n") ? value.split("\n").slice(1).join("\n") : value.slice(3);
    if (value.endsWith("```")) {
      value = value.slice(0, -3);
    }
    value = value.trim();
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
