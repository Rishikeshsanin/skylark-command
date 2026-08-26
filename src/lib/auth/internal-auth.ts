import "server-only";

import { timingSafeEqual } from "node:crypto";

export function matchesBearerSecret(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ") || !secret) return false;
  const supplied = header.slice("Bearer ".length);
  const left = Buffer.from(supplied);
  const right = Buffer.from(secret);
  return left.length === right.length && timingSafeEqual(left, right);
}
