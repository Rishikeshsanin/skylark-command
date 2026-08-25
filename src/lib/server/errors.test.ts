import { describe, expect, it } from "vitest";
import { PublicApiError, toSafePublicError } from "./errors";

describe("toSafePublicError", () => {
  it("preserves explicitly safe public errors", () => {
    expect(
      toSafePublicError(new PublicApiError(429, "RATE_LIMITED", "Retry later.")),
    ).toEqual({
      status: 429,
      code: "RATE_LIMITED",
      message: "Retry later.",
    });
  });

  it("does not leak unknown exception messages or stack details", () => {
    const safe = toSafePublicError(
      new Error("secret token=abc123 at /private/server/path"),
    );
    expect(safe.status).toBe(500);
    expect(JSON.stringify(safe)).not.toContain("abc123");
    expect(JSON.stringify(safe)).not.toContain("/private/server/path");
  });
});
