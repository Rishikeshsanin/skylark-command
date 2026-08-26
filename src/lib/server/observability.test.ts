import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLogEntry, logEvent } from "./logger";
import { resolveRequestId } from "./request-id";
import { runWithTelemetryContext } from "./telemetry-context";
import { classifyError } from "./error-taxonomy";
import { PublicApiError } from "./errors";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("observability primitives", () => {
  it("preserves a safe external request id and rejects unsafe values", () => {
    expect(resolveRequestId(new Headers({ "x-request-id": "edge-request-123" }))).toBe("edge-request-123");
    const generated = resolveRequestId(new Headers({ "x-request-id": "bad id with spaces and authorization=secret" }));
    expect(generated).not.toContain("bad id");
    expect(generated.length).toBeGreaterThan(20);
  });

  it("propagates request context into structured log entries", () => {
    const entry = runWithTelemetryContext(
      { requestId: "request-context-1", route: "/api/chat", workspaceKey: "workspace-a" },
      () => buildLogEntry("info", "test.event", { operation: "test" }),
    );
    expect(entry).toMatchObject({
      requestId: "request-context-1",
      route: "/api/chat",
      workspaceKey: "workspace-a",
      operation: "test",
    });
  });

  it("redacts configured secret values even when embedded in otherwise safe strings", () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:password@example/db");
    vi.stubEnv("CRON_SECRET", "cron-secret-value");
    vi.stubEnv("MONDAY_API_TOKEN", "monday-secret-value");
    const entry = buildLogEntry("error", "test.secret", {
      reason: "failed postgres://user:password@example/db with cron-secret-value and Bearer monday-secret-value",
      authorization: "Bearer should-never-appear",
    });
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("password@example");
    expect(serialized).not.toContain("cron-secret-value");
    expect(serialized).not.toContain("monday-secret-value");
    expect(serialized).toContain("[REDACTED]");
  });

  it("never logs raw prompt-shaped metadata when attached to a sensitive key", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logEvent("info", "copilot.test", {
      requestId: "request-123",
      authorization: "Bearer token-value",
      apiKey: "api-secret",
      operation: "copilot",
    });
    const output = String(spy.mock.calls[0]?.[0]);
    expect(output).not.toContain("token-value");
    expect(output).not.toContain("api-secret");
  });

  it("normalizes validation and authorization errors into the shared taxonomy", () => {
    expect(classifyError(new PublicApiError(400, "INVALID_REQUEST", "bad"))).toBe("VALIDATION");
    expect(classifyError(new PublicApiError(401, "UNAUTHORIZED", "no"))).toBe("AUTHORIZATION");
  });
});
