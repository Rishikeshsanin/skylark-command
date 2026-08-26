import "server-only";

import { PublicApiError } from "@/lib/server/errors";
import type { AuthSession, ManagedAuthProvider } from "./contracts";
import { createManagedAuthProvider } from "./provider";

const MAX_BEARER_TOKEN_LENGTH = 8_192;

export interface SessionDependencies {
  authProvider?: ManagedAuthProvider | null;
}

export function bearerTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token || token.length > MAX_BEARER_TOKEN_LENGTH || /\s/.test(token)) return null;
  return token;
}

export async function optionalSession(
  request: Request,
  dependencies: SessionDependencies = {},
): Promise<AuthSession | null> {
  const token = bearerTokenFromRequest(request);
  if (!token) return null;
  const provider = dependencies.authProvider === undefined
    ? createManagedAuthProvider()
    : dependencies.authProvider;
  if (!provider) {
    throw new PublicApiError(503, "AUTH_NOT_CONFIGURED", "Authentication is not configured for workspace mode.");
  }
  const identity = await provider.verifyAccessToken(token);
  return identity ? { identity } : null;
}

export async function requireSession(
  request: Request,
  dependencies: SessionDependencies = {},
): Promise<AuthSession> {
  const session = await optionalSession(request, dependencies);
  if (!session) {
    throw new PublicApiError(401, "AUTH_REQUIRED", "Authentication is required for this workspace action.");
  }
  return session;
}
