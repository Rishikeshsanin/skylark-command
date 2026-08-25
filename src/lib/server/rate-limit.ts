export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now = Date.now()): RateLimitResult {
    const existing = this.buckets.get(key);
    const bucket =
      !existing || existing.resetAt <= now
        ? { count: 0, resetAt: now + this.windowMs }
        : existing;

    bucket.count += 1;
    this.buckets.set(key, bucket);

    if (this.buckets.size > 10_000) this.prune(now);

    return {
      allowed: bucket.count <= this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

const globalRateLimit = globalThis as typeof globalThis & {
  __skylarkChatRateLimiter?: InMemoryRateLimiter;
};

export const chatRateLimiter =
  globalRateLimit.__skylarkChatRateLimiter ??
  new InMemoryRateLimiter(20, 60_000);

globalRateLimit.__skylarkChatRateLimiter = chatRateLimiter;

export function getClientIdentifier(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headers.get("x-real-ip")?.trim();
  const candidate = forwarded || realIp || "anonymous";
  return candidate.replace(/[^a-zA-Z0-9:._-]/g, "").slice(0, 80) || "anonymous";
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": String(result.remaining),
    "x-ratelimit-reset": String(Math.ceil(result.resetAt / 1_000)),
  };
}
