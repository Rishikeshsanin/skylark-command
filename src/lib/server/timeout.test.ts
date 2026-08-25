import { describe, expect, it } from "vitest";
import { withTimeout } from "./timeout";

describe("withTimeout", () => {
  it("converts an aborted upstream call into a controlled timeout error", async () => {
    const operation = (signal: AbortSignal) =>
      new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new Error("provider-specific abort detail"));
        });
      });

    await expect(withTimeout(operation, 5, "AI provider")).rejects.toMatchObject({
      status: 504,
      code: "UPSTREAM_TIMEOUT",
      message: "AI provider timed out.",
    });
  });
});
