import { describe, expect, it, vi } from "vitest";
import { logEvent } from "./logger";

describe("logEvent", () => {
  it("redacts values attached to secret-like keys", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logEvent("info", "test.event", {
      requestId: "request-123",
      apiKey: "must-not-appear",
    });

    const output = String(spy.mock.calls[0]?.[0]);
    expect(output).toContain("request-123");
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("must-not-appear");
  });
});
