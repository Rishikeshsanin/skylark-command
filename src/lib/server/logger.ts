type LogLevel = "info" | "warn" | "error";
type Primitive = string | number | boolean | null | undefined;

const SECRET_KEY_PATTERN =
  /(authorization|cookie|token|secret|password|api[-_]?key|credential)/i;

function sanitizeMetadata(
  metadata: Record<string, Primitive>,
): Record<string, Primitive | "[REDACTED]"> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : value,
    ]),
  );
}

export function logEvent(
  level: LogLevel,
  event: string,
  metadata: Record<string, Primitive> = {},
): void {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitizeMetadata(metadata),
  });

  if (level === "error") {
    console.error(entry);
  } else if (level === "warn") {
    console.warn(entry);
  } else {
    console.info(entry);
  }
}
