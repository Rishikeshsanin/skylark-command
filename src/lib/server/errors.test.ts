import { describe, expect, it } from "vitest";
import { MondayApiError } from "@/lib/monday/errors";
import { PublicApiError, toSafePublicError } from "./errors";

describe("toSafePublicError", () => {
  it("preserves explicitly safe public errors", () => {
    expect(
      toSafePublicError(
        new PublicApiError(429, "RATE_LIMITED", "Retry later."),
      ),
    ).toEqual({
      status: 429,
      code: "RATE_LIMITED",
      message: "Retry later.",
    });
  });

  it("maps monday failures without leaking provider details", () => {
    const safe = toSafePublicError(
      new MondayApiError(
        "UPSTREAM_ERROR",
        "Authorization: secret-token should never leak",
        { status: 500, retryable: true },
      ),
    );
    expect(safe).toEqual({
      status: 502,
      code: "MONDAY_UNAVAILABLE",
      message: "The business data source is temporarily unavailable.",
    });
    expect(JSON.stringify(safe)).not.toContain("secret-token");
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
