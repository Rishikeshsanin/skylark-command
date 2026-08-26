import "server-only";

import { PublicApiError } from "@/lib/server/errors";
import type {
  AuthSession,
  ManagedAuthProvider,
  WorkspaceMember,
  WorkspacePermission,
  WorkspaceRole,
  WorkspaceStore,
} from "./contracts";
import { hasMinimumWorkspaceRole, hasWorkspacePermission } from "./rbac";
import { requireSession } from "./session";
import { createPostgresWorkspaceStore } from "./workspace-store";

export const PUBLIC_DEMO_WORKSPACE_KEY = "skylark-command";
export const WORKSPACE_HEADER = "x-skylark-workspace-id";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AnalyticsAccess =
  | { mode: "public_demo"; workspaceKey: typeof PUBLIC_DEMO_WORKSPACE_KEY }
  | {
      mode: "workspace";
      workspaceId: string;
      workspaceKey: string;
      session: AuthSession;
      membership: WorkspaceMember;
    };

export interface AuthorizationDependencies {
  authProvider?: ManagedAuthProvider | null;
  workspaceStore?: WorkspaceStore;
}

function storeFor(dependencies: AuthorizationDependencies): WorkspaceStore {
  return dependencies.workspaceStore ?? createPostgresWorkspaceStore();
}

export function validateWorkspaceId(value: string): string {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new PublicApiError(400, "INVALID_WORKSPACE", "Workspace identifier is invalid.");
  }
  return normalized;
}

export async function requireWorkspaceMember(
  request: Request,
  workspaceId: string,
  dependencies: AuthorizationDependencies = {},
): Promise<{ session: AuthSession; membership: WorkspaceMember }> {
  const id = validateWorkspaceId(workspaceId);
  const session = await requireSession(request, { authProvider: dependencies.authProvider });
  const membership = await storeFor(dependencies).getMembership(id, session.identity.userId);
  if (!membership || membership.status !== "ACTIVE") {
    throw new PublicApiError(403, "WORKSPACE_FORBIDDEN", "You do not have access to this workspace.");
  }
  return { session, membership };
}

export async function requireWorkspaceRole(
  request: Request,
  workspaceId: string,
  minimumRole: WorkspaceRole,
  dependencies: AuthorizationDependencies = {},
): Promise<{ session: AuthSession; membership: WorkspaceMember }> {
  const authorized = await requireWorkspaceMember(request, workspaceId, dependencies);
  if (!hasMinimumWorkspaceRole(authorized.membership.role, minimumRole)) {
    throw new PublicApiError(403, "WORKSPACE_ROLE_REQUIRED", "Your workspace role does not permit this action.");
  }
  return authorized;
}

export async function requireWorkspacePermission(
  request: Request,
  workspaceId: string,
  permission: WorkspacePermission,
  dependencies: AuthorizationDependencies = {},
): Promise<{ session: AuthSession; membership: WorkspaceMember }> {
  const authorized = await requireWorkspaceMember(request, workspaceId, dependencies);
  if (!hasWorkspacePermission(authorized.membership.role, permission)) {
    throw new PublicApiError(403, "WORKSPACE_PERMISSION_REQUIRED", "Your workspace role does not permit this action.");
  }
  return authorized;
}

export async function resolveAnalyticsAccess(
  request: Request,
  dependencies: AuthorizationDependencies = {},
): Promise<AnalyticsAccess> {
  const requested = request.headers.get(WORKSPACE_HEADER)?.trim();
  if (!requested) {
    return { mode: "public_demo", workspaceKey: PUBLIC_DEMO_WORKSPACE_KEY };
  }
  const workspaceId = validateWorkspaceId(requested);
  const authorized = await requireWorkspacePermission(
    request,
    workspaceId,
    "ANALYTICS_READ",
    dependencies,
  );
  return {
    mode: "workspace",
    workspaceId,
    workspaceKey: workspaceId,
    session: authorized.session,
    membership: authorized.membership,
  };
}

export function assertAnalyticalToolsAuthorized(
  access: AnalyticsAccess,
  toolsUsed: readonly string[],
): void {
  if (access.mode === "public_demo") return;
  if (toolsUsed.includes("runScenario") && !hasWorkspacePermission(access.membership.role, "SCENARIO_RUN")) {
    throw new PublicApiError(403, "SCENARIO_PERMISSION_REQUIRED", "Analytical scenarios require the ANALYST role or higher.");
  }
}
