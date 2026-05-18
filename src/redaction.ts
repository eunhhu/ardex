const secretPatterns: Array<[RegExp, string]> = [
  [/sk-[A-Za-z0-9_-]{20,}/g, "[REDACTED_OPENAI_KEY]"],
  [/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s,}]+/gi, "$1=[REDACTED]"],
  [/-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
];

export function redactSecrets(input: string): string {
  return secretPatterns.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), input);
}

export function sanitizeEvidenceSummary(summary: string): string {
  return truncate(redactSecrets(summary), 500);
}

export function sanitizeEvidencePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(payload) as Record<string, unknown>;
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return truncate(redactSecrets(value), 4_000);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map(sanitizeValue);
  }
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value).slice(0, 100)) {
      output[key] = sanitizeValue(entry);
    }
    return output;
  }
  return value;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...[truncated ${value.length - maxLength} chars]` : value;
}
