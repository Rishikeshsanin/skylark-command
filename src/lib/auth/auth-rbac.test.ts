import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PublicApiError } from "@/lib/server/errors";
import {
  assertAnalyticalToolsAuthorized,
  PUBLIC_DEMO_WORKSPACE_KEY,
  requireWorkspacePermission,
  resolveAnalyticsAccess,
  WORKSPACE_HEADER,
} from "./authorization";
import {
  assertConnectorConfigContainsNoSecrets,
  validateCredentialReference,
} from "./connector-config";
import type {
  AuthIdentity,
  ManagedAuthProvider,
  WorkspaceMember,
  WorkspaceStore,
} from "./contracts";
import { matchesBearerSecret } from "./internal-auth";
import { ROLE_PERMISSIONS, hasWorkspacePermission } from "./rbac";
import { SupabaseAuthProvider } from "./provider";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_B = "22222222-2222-4222-8222-222222222222";

function membership(workspaceId: string, role: WorkspaceMember["role"], status: WorkspaceMember["status"] = "ACTIVE"): WorkspaceMember {
  return {
    workspaceId,
    userId: USER_ID,
    role,
    status,
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
  };
}

class FakeWorkspaceStore implements WorkspaceStore {
  constructor(private readonly memberships: WorkspaceMember[]) {}
  async getMembership(workspaceId: string, userId: string) {
    return this.memberships.find((item) => item.workspaceId === workspaceId && item.userId === userId) ?? null;
  }
  async createWorkspace(): Promise<never> { throw new Error("not used"); }
  async changeMembership(): Promise<never> { throw new Error("not used"); }
  async configureMondayConnector(): Promise<never> { throw new Error("not used"); }
  async appendAuditEvent(): Promise<void> { throw new Error("not used"); }
}

const identity: AuthIdentity = { userId: USER_ID, email: "analyst@example.com", provider: "supabase" };
const validAuthProvider: ManagedAuthProvider = {
  async verifyAccessToken(token) {
    return token === "valid-token" ? identity : null;
  },
};

function workspaceRequest(workspaceId: string, extraHeaders: Record<string, string> = {}) {
  return new Request("https://skylark.example/api/chat", {
    method: "POST",
    headers: {
      authorization: "Bearer valid-token",
      [WORKSPACE_HEADER]: workspaceId,
      ...extraHeaders,
    },
  });
}

async function expectPublicApiError(promise: Promise<unknown>, code: string, status: number) {
  try {
    await promise;
    throw new Error("Expected PublicApiError");
  } catch (error) {
    expect(error).toBeInstanceOf(PublicApiError);
    expect((error as PublicApiError).code).toBe(code);
    expect((error as PublicApiError).status).toBe(status);
  }
}

describe("public demo and authenticated workspace boundary", () => {
  it("allows unauthenticated public demo analytics with no workspace selector", async () => {
    const request = new Request("https://skylark.example/api/chat", { method: "POST" });
    const access = await resolveAnalyticsAccess(request, {
      authProvider: null,
      workspaceStore: new FakeWorkspaceStore([]),
    });
    expect(access).toEqual({ mode: "public_demo", workspaceKey: PUBLIC_DEMO_WORKSPACE_KEY });
  });

  it("requires authentication when a workspace is explicitly requested", async () => {
    const request = new Request("https://skylark.example/api/chat", {
      method: "POST",
      headers: { [WORKSPACE_HEADER]: WORKSPACE_A },
    });
    await expectPublicApiError(
      resolveAnalyticsAccess(request, {
        authProvider: validAuthProvider,
        workspaceStore: new FakeWorkspaceStore([membership(WORKSPACE_A, "VIEWER")]),
      }),
      "AUTH_REQUIRED",
      401,
    );
  });

  it("allows an active viewer to read analytics", async () => {
    const access = await resolveAnalyticsAccess(workspaceRequest(WORKSPACE_A), {
      authProvider: validAuthProvider,
      workspaceStore: new FakeWorkspaceStore([membership(WORKSPACE_A, "VIEWER")]),
    });
    expect(access.mode).toBe("workspace");
    if (access.mode === "workspace") expect(access.membership.role).toBe("VIEWER");
  });

  it("rejects suspended memberships", async () => {
    await expectPublicApiError(
      resolveAnalyticsAccess(workspaceRequest(WORKSPACE_A), {
        authProvider: validAuthProvider,
        workspaceStore: new FakeWorkspaceStore([membership(WORKSPACE_A, "ADMIN", "SUSPENDED")]),
      }),
      "WORKSPACE_FORBIDDEN",
      403,
    );
  });

  it("prevents cross-workspace access with an exact membership lookup", async () => {
    await expectPublicApiError(
      resolveAnalyticsAccess(workspaceRequest(WORKSPACE_B), {
        authProvider: validAuthProvider,
        workspaceStore: new FakeWorkspaceStore([membership(WORKSPACE_A, "OWNER")]),
      }),
      "WORKSPACE_FORBIDDEN",
      403,
    );
  });

  it("ignores forged client role claims and authorizes from persisted membership", async () => {
    const request = workspaceRequest(WORKSPACE_A, { "x-skylark-role": "OWNER" });
    await expectPublicApiError(
      requireWorkspacePermission(request, WORKSPACE_A, "MEMBERSHIP_MANAGE", {
        authProvider: validAuthProvider,
        workspaceStore: new FakeWorkspaceStore([membership(WORKSPACE_A, "VIEWER")]),
      }),
      "WORKSPACE_PERMISSION_REQUIRED",
      403,
    );
  });
});

describe("canonical RBAC matrix", () => {
  it("keeps VIEWER read-only", () => {
    expect(ROLE_PERMISSIONS.VIEWER).toEqual(["ANALYTICS_READ"]);
  });

  it("allows ANALYST scenarios but not workspace administration", () => {
    expect(hasWorkspacePermission("ANALYST", "SCENARIO_RUN")).toBe(true);
    expect(hasWorkspacePermission("ANALYST", "CONNECTOR_CONFIGURE")).toBe(false);
  });

  it("allows ADMIN connector/settings administration but not membership management", () => {
    expect(hasWorkspacePermission("ADMIN", "CONNECTOR_CONFIGURE")).toBe(true);
    expect(hasWorkspacePermission("ADMIN", "WORKSPACE_SETTINGS_WRITE")).toBe(true);
    expect(hasWorkspacePermission("ADMIN", "MEMBERSHIP_MANAGE")).toBe(false);
  });

  it("reserves membership and ownership administration for OWNER", () => {
    expect(hasWorkspacePermission("OWNER", "MEMBERSHIP_MANAGE")).toBe(true);
    expect(hasWorkspacePermission("OWNER", "OWNERSHIP_TRANSFER")).toBe(true);
  });

  it("blocks viewer scenario execution in authenticated workspace mode", () => {
    const access = {
      mode: "workspace" as const,
      workspaceId: WORKSPACE_A,
      workspaceKey: WORKSPACE_A,
      session: { identity },
      membership: membership(WORKSPACE_A, "VIEWER"),
    };
    expect(() => assertAnalyticalToolsAuthorized(access, ["runScenario"])).toThrow(PublicApiError);
    expect(() => assertAnalyticalToolsAuthorized({ ...access, membership: membership(WORKSPACE_A, "ANALYST") }, ["runScenario"])).not.toThrow();
  });
});

describe("managed auth provider boundary", () => {
  it("uses a publishable key plus caller bearer token and trusts only returned identity", async () => {
    let observedApiKey: string | null = null;
    let observedAuthorization: string | null = null;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      observedApiKey = headers.get("apikey");
      observedAuthorization = headers.get("authorization");
      return new Response(JSON.stringify({
        id: USER_ID,
        email: "owner@example.com",
        app_metadata: { role: "OWNER" },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const provider = new SupabaseAuthProvider({
      url: "https://project.supabase.co",
      publishableKey: "sb_publishable_example",
      fetchImpl,
    });
    const verified = await provider.verifyAccessToken("user-access-token");
    expect(observedApiKey).toBe("sb_publishable_example");
    expect(observedAuthorization).toBe("Bearer user-access-token");
    expect(verified).toEqual({ userId: USER_ID, email: "owner@example.com", provider: "supabase" });
    expect(verified).not.toHaveProperty("role");
  });

  it("treats provider 401 as an invalid session", async () => {
    const provider = new SupabaseAuthProvider({
      url: "https://project.supabase.co",
      publishableKey: "sb_publishable_example",
      fetchImpl: (async () => new Response("{}", { status: 401 })) as typeof fetch,
    });
    await expect(provider.verifyAccessToken("bad-token")).resolves.toBeNull();
  });
});

describe("connector and infrastructure secret boundaries", () => {
  it("requires opaque credential references rather than raw connector secrets", () => {
    expect(validateCredentialReference("vercel:MONDAY_TOKEN_WORKSPACE_1")).toBe("vercel:MONDAY_TOKEN_WORKSPACE_1");
    expect(() => validateCredentialReference("actual-token-value")).toThrow();
  });

  it("rejects nested secret-like connector fields", () => {
    expect(() => assertConnectorConfigContainsNoSecrets({ boardIds: ["1", "2"], nested: { apiToken: "secret" } })).toThrow();
    expect(() => assertConnectorConfigContainsNoSecrets({ boardIds: ["1", "2"], region: "in" })).not.toThrow();
  });

  it("protects internal sync with exact timing-safe bearer secret comparison", () => {
    expect(matchesBearerSecret("Bearer expected-secret", "expected-secret")).toBe(true);
    expect(matchesBearerSecret("Bearer forged-secret", "expected-secret")).toBe(false);
    expect(matchesBearerSecret(null, "expected-secret")).toBe(false);
  });
});

describe("server-only and workspace persistence boundaries", () => {
  it("keeps auth provider, session, authorization, and workspace store server-only", () => {
    for (const relative of ["provider.ts", "session.ts", "authorization.ts", "workspace-store.ts", "internal-auth.ts"]) {
      const source = readFileSync(join(process.cwd(), "src", "lib", "auth", relative), "utf8");
      expect(source).toContain('import "server-only"');
      expect(source).not.toContain('"use client"');
    }
  });

  it("keeps persisted tenant resources workspace-scoped and connector tokens out of the response", () => {
    const migration = readFileSync(
      join(process.cwd(), "src", "lib", "data-platform", "migrations", "002_identity_workspace_rbac.sql"),
      "utf8",
    );
    expect(migration).toContain("workspace_id UUID NOT NULL REFERENCES workspaces(id)");
    expect(migration).toContain("PRIMARY KEY (workspace_id, user_id)");
    expect(migration).toContain("UNIQUE (workspace_id, provider)");

    const connectorRoute = readFileSync(
      join(process.cwd(), "src", "app", "api", "workspaces", "[workspaceId]", "connectors", "monday", "route.ts"),
      "utf8",
    );
    expect(connectorRoute).not.toContain("credentialRef: connector.credentialRef");
    expect(connectorRoute).not.toContain("MONDAY_API_TOKEN");
  });
});
