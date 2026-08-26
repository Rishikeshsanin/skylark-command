import { getTelemetryContext } from "./telemetry-context";

type LogLevel = "info" | "warn" | "error";
export type LogMetadata = Record<string, unknown>;

const SECRET_KEY_PATTERN = /(authorization|cookie|token|secret|password|api[-_]?key|credential|database[-_]?url)/i;
const MAX_STRING_CHARS = 500;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 30;

function secretValues(): string[] {
  return [
    process.env.MONDAY_API_TOKEN,
    process.env.DATABASE_URL,
    process.env.CRON_SECRET,
    process.env.GEMINI_API_KEY,
    process.env.AI_API_KEY,
  ].filter((value): value is string => Boolean(value && value.length >= 4));
}

export function redactString(value: string): string {
  let redacted = value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
  redacted = redacted.replace(/(?:postgres(?:ql)?):\/\/[^\s]+/gi, "postgresql://[REDACTED]");
  for (const secret of secretValues()) redacted = redacted.split(secret).join("[REDACTED]");
  return redacted.length > MAX_STRING_CHARS ? `${redacted.slice(0, MAX_STRING_CHARS)}…` : redacted;
}

function sanitizeValue(key: string, value: unknown, depth = 0): unknown {
  if (SECRET_KEY_PATTERN.test(key)) return "[REDACTED]";
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactString(value);
  if (depth >= 2) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue("item", item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_OBJECT_KEYS)
        .map(([childKey, childValue]) => [childKey, sanitizeValue(childKey, childValue, depth + 1)]),
    );
  }
  return redactString(String(value));
}

export function buildLogEntry(level: LogLevel, event: string, metadata: LogMetadata = {}) {
  const context = getTelemetryContext();
  const combined: LogMetadata = { ...context, ...metadata };
  const sanitized = Object.fromEntries(
    Object.entries(combined).map(([key, value]) => [key, sanitizeValue(key, value)]),
  );
  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitized,
  };
}

export function logEvent(level: LogLevel, event: string, metadata: LogMetadata = {}): void {
  const entry = JSON.stringify(buildLogEntry(level, event, metadata));
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}
