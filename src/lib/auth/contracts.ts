export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "ANALYST", "VIEWER"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WORKSPACE_MEMBER_STATUSES = ["ACTIVE", "INVITED", "SUSPENDED"] as const;
export type WorkspaceMemberStatus = (typeof WORKSPACE_MEMBER_STATUSES)[number];

export const WORKSPACE_PERMISSIONS = [
  "ANALYTICS_READ",
  "SCENARIO_RUN",
  "WORKSPACE_SETTINGS_WRITE",
  "CONNECTOR_CONFIGURE",
  "MEMBERSHIP_MANAGE",
  "OWNERSHIP_TRANSFER",
] as const;
export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceConnector {
  id: string;
  workspaceId: string;
  provider: "monday.com";
  credentialRef: string;
  externalAccountRef: string | null;
  config: Record<string, unknown>;
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
  updatedAt: string;
}

export interface AuthIdentity {
  userId: string;
  email?: string;
  provider: "supabase";
}

export interface AuthSession {
  identity: AuthIdentity;
}

export interface ManagedAuthProvider {
  verifyAccessToken(accessToken: string): Promise<AuthIdentity | null>;
}

export type AuditEventType =
  | "auth.session.verified"
  | "workspace.created"
  | "workspace.membership.changed"
  | "workspace.connector.changed"
  | "scenario.action.approved";

export interface AuditEventInput {
  workspaceId: string | null;
  actorUserId: string | null;
  eventType: AuditEventType;
  targetType?: string;
  targetId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateWorkspaceInput {
  workspace: Pick<Workspace, "id" | "slug" | "name">;
  ownerUserId: string;
  requestId?: string;
}

export interface ChangeMembershipInput {
  workspaceId: string;
  actorUserId: string;
  targetUserId: string;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  requestId?: string;
}

export interface ConfigureMondayConnectorInput {
  workspaceId: string;
  actorUserId: string;
  credentialRef: string;
  externalAccountRef?: string | null;
  config?: Record<string, unknown>;
  requestId?: string;
}

export interface WorkspaceStore {
  getMembership(workspaceId: string, userId: string): Promise<WorkspaceMember | null>;
  createWorkspace(input: CreateWorkspaceInput): Promise<Workspace>;
  changeMembership(input: ChangeMembershipInput): Promise<WorkspaceMember>;
  configureMondayConnector(input: ConfigureMondayConnectorInput): Promise<WorkspaceConnector>;
  appendAuditEvent(input: AuditEventInput): Promise<void>;
}
