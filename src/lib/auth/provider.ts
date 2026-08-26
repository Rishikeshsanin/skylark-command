import "server-only";

import { PublicApiError } from "@/lib/server/errors";
import type { AuthIdentity, ManagedAuthProvider } from "./contracts";

const AUTH_TIMEOUT_MS = 5_000;

type FetchLike = typeof fetch;

export interface SupabaseAuthProviderOptions {
  url: string;
  publishableKey: string;
  fetchImpl?: FetchLike;
}

export class SupabaseAuthProvider implements ManagedAuthProvider {
  private readonly authUserUrl: string;
  private readonly publishableKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: SupabaseAuthProviderOptions) {
    const base = options.url.trim();
    const key = options.publishableKey.trim();
    if (!base || !key) throw new Error("Supabase Auth configuration is incomplete.");
    this.authUserUrl = new URL("/auth/v1/user", base).toString();
    this.publishableKey = key;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async verifyAccessToken(accessToken: string): Promise<AuthIdentity | null> {
    try {
      const response = await this.fetchImpl(this.authUserUrl, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
        headers: {
          accept: "application/json",
          apikey: this.publishableKey,
          authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) {
        throw new PublicApiError(503, "AUTH_PROVIDER_UNAVAILABLE", "Authentication is temporarily unavailable.");
      }

      const body = await response.json() as { id?: unknown; email?: unknown };
      if (typeof body.id !== "string" || !body.id.trim()) return null;
      return {
        userId: body.id,
        ...(typeof body.email === "string" && body.email.trim() ? { email: body.email } : {}),
        provider: "supabase",
      };
    } catch (error) {
      if (error instanceof PublicApiError) throw error;
      throw new PublicApiError(503, "AUTH_PROVIDER_UNAVAILABLE", "Authentication is temporarily unavailable.");
    }
  }
}

export function createManagedAuthProvider(
  environment: NodeJS.ProcessEnv = process.env,
): ManagedAuthProvider | null {
  const url = environment.SUPABASE_URL?.trim();
  const publishableKey = environment.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url && !publishableKey) return null;
  if (!url || !publishableKey) {
    throw new PublicApiError(503, "AUTH_NOT_CONFIGURED", "Authentication configuration is incomplete.");
  }
  return new SupabaseAuthProvider({ url, publishableKey });
}
