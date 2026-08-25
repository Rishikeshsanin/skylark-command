import { describe, expect, it } from "vitest";
import { InMemoryRateLimiter } from "./rate-limit";

describe("InMemoryRateLimiter", () => {
  it("blocks after the configured request count", () => {
    const limiter = new InMemoryRateLimiter(2, 1_000);

    expect(limiter.check("client", 0).allowed).toBe(true);
    expect(limiter.check("client", 1).allowed).toBe(true);
    const blocked = limiter.check("client", 2);

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("resets after the fixed window", () => {
    const limiter = new InMemoryRateLimiter(1, 1_000);
    expect(limiter.check("client", 0).allowed).toBe(true);
    expect(limiter.check("client", 10).allowed).toBe(false);
    expect(limiter.check("client", 1_000).allowed).toBe(true);
  });

  it("isolates buckets by client key", () => {
    const limiter = new InMemoryRateLimiter(1, 1_000);
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("b", 0).allowed).toBe(true);
  });
});
