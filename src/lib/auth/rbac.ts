import type { WorkspacePermission, WorkspaceRole } from "./contracts";

export const ROLE_PERMISSIONS: Readonly<Record<WorkspaceRole, readonly WorkspacePermission[]>> = {
  VIEWER: ["ANALYTICS_READ"],
  ANALYST: ["ANALYTICS_READ", "SCENARIO_RUN"],
  ADMIN: ["ANALYTICS_READ", "SCENARIO_RUN", "WORKSPACE_SETTINGS_WRITE", "CONNECTOR_CONFIGURE"],
  OWNER: [
    "ANALYTICS_READ",
    "SCENARIO_RUN",
    "WORKSPACE_SETTINGS_WRITE",
    "CONNECTOR_CONFIGURE",
    "MEMBERSHIP_MANAGE",
    "OWNERSHIP_TRANSFER",
  ],
};

const ROLE_RANK: Readonly<Record<WorkspaceRole, number>> = {
  VIEWER: 0,
  ANALYST: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function hasWorkspacePermission(role: WorkspaceRole, permission: WorkspacePermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasMinimumWorkspaceRole(role: WorkspaceRole, minimumRole: WorkspaceRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimumRole];
}
