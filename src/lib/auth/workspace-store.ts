import "server-only";

import { randomUUID } from "node:crypto";
import { PublicApiError } from "@/lib/server/errors";
import { getTemporalSql } from "@/lib/data-platform/postgres";
import type {
  AuditEventInput,
  ChangeMembershipInput,
  ConfigureMondayConnectorInput,
  CreateWorkspaceInput,
  Workspace,
  WorkspaceConnector,
  WorkspaceMember,
  WorkspaceMemberStatus,
  WorkspaceRole,
  WorkspaceStore,
} from "./contracts";

type TimestampValue = string | Date;

type WorkspaceRow = {
  id: string;
  slug: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  created_at: TimestampValue;
  updated_at: TimestampValue;
};

type MembershipRow = {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  created_at: TimestampValue;
  updated_at: TimestampValue;
};

type ConnectorRow = {
  id: string;
  workspace_id: string;
  provider: "monday.com";
  credential_ref: string;
  external_account_ref: string | null;
  config: Record<string, unknown>;
  status: "ACTIVE" | "DISABLED";
  created_at: TimestampValue;
  updated_at: TimestampValue;
};

function iso(value: TimestampValue): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toMembership(row: MembershipRow): WorkspaceMember {
  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toConnector(row: ConnectorRow): WorkspaceConnector {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    provider: row.provider,
    credentialRef: row.credential_ref,
    externalAccountRef: row.external_account_ref,
    config: row.config,
    status: row.status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export class PostgresWorkspaceStore implements WorkspaceStore {
  constructor(private readonly sql = getTemporalSql()) {}

  async getMembership(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    const rows = await this.sql<MembershipRow[]>`
      SELECT workspace_id, user_id, role, status, created_at, updated_at
      FROM workspace_members
      WHERE workspace_id = ${workspaceId}
        AND user_id = ${userId}
      LIMIT 1
    `;
    return rows[0] ? toMembership(rows[0]) : null;
  }

  async createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<WorkspaceRow[]>`
        INSERT INTO workspaces (id, slug, name, status)
        VALUES (${input.workspace.id}, ${input.workspace.slug}, ${input.workspace.name}, 'ACTIVE')
        RETURNING id, slug, name, status, created_at, updated_at
      `;
      const workspace = rows[0];
      if (!workspace) throw new PublicApiError(500, "WORKSPACE_CREATE_FAILED", "Workspace creation failed.");

      await tx`
        INSERT INTO workspace_members (workspace_id, user_id, role, status)
        VALUES (${input.workspace.id}, ${input.ownerUserId}, 'OWNER', 'ACTIVE')
      `;
      await tx`
        INSERT INTO audit_events (
          id, workspace_id, actor_user_id, event_type, target_type, target_id, request_id, metadata
        ) VALUES (
          ${randomUUID()}, ${input.workspace.id}, ${input.ownerUserId}, 'workspace.created',
          'workspace', ${input.workspace.id}, ${input.requestId ?? null},
          ${JSON.stringify({ slug: input.workspace.slug })}::jsonb
        )
      `;
      return toWorkspace(workspace);
    });
  }

  async changeMembership(input: ChangeMembershipInput): Promise<WorkspaceMember> {
    return this.sql.begin(async (tx) => {
      const workspaceRows = await tx<{ id: string }[]>`
        SELECT id FROM workspaces WHERE id = ${input.workspaceId} FOR UPDATE
      `;
      if (!workspaceRows[0]) {
        throw new PublicApiError(404, "WORKSPACE_NOT_FOUND", "Workspace not found.");
      }

      const currentRows = await tx<MembershipRow[]>`
        SELECT workspace_id, user_id, role, status, created_at, updated_at
        FROM workspace_members
        WHERE workspace_id = ${input.workspaceId}
          AND user_id = ${input.targetUserId}
        LIMIT 1
      `;
      const current = currentRows[0];
      const removesActiveOwner = current?.role === "OWNER" && current.status === "ACTIVE" &&
        (input.role !== "OWNER" || input.status !== "ACTIVE");
      if (removesActiveOwner) {
        const ownerRows = await tx<{ count: string }[]>`
          SELECT COUNT(*)::text AS count
          FROM workspace_members
          WHERE workspace_id = ${input.workspaceId}
            AND role = 'OWNER'
            AND status = 'ACTIVE'
        `;
        if (Number(ownerRows[0]?.count ?? 0) <= 1) {
          throw new PublicApiError(409, "WORKSPACE_OWNER_REQUIRED", "A workspace must retain at least one active owner.");
        }
      }

      const rows = await tx<MembershipRow[]>`
        INSERT INTO workspace_members (workspace_id, user_id, role, status)
        VALUES (${input.workspaceId}, ${input.targetUserId}, ${input.role}, ${input.status})
        ON CONFLICT (workspace_id, user_id) DO UPDATE
          SET role = EXCLUDED.role,
              status = EXCLUDED.status,
              updated_at = NOW()
        RETURNING workspace_id, user_id, role, status, created_at, updated_at
      `;
      const membership = rows[0];
      if (!membership) throw new PublicApiError(500, "MEMBERSHIP_UPDATE_FAILED", "Membership update failed.");

      await tx`
        INSERT INTO audit_events (
          id, workspace_id, actor_user_id, event_type, target_type, target_id, request_id, metadata
        ) VALUES (
          ${randomUUID()}, ${input.workspaceId}, ${input.actorUserId}, 'workspace.membership.changed',
          'workspace_member', ${input.targetUserId}, ${input.requestId ?? null},
          ${JSON.stringify({
            previousRole: current?.role ?? null,
            previousStatus: current?.status ?? null,
            role: input.role,
            status: input.status,
          })}::jsonb
        )
      `;
      return toMembership(membership);
    });
  }

  async configureMondayConnector(input: ConfigureMondayConnectorInput): Promise<WorkspaceConnector> {
    return this.sql.begin(async (tx) => {
      const workspaceRows = await tx<{ id: string }[]>`
        SELECT id FROM workspaces WHERE id = ${input.workspaceId} FOR UPDATE
      `;
      if (!workspaceRows[0]) {
        throw new PublicApiError(404, "WORKSPACE_NOT_FOUND", "Workspace not found.");
      }

      const rows = await tx<ConnectorRow[]>`
        INSERT INTO workspace_connectors (
          id, workspace_id, provider, credential_ref, external_account_ref, config, status
        ) VALUES (
          ${randomUUID()}, ${input.workspaceId}, 'monday.com', ${input.credentialRef},
          ${input.externalAccountRef ?? null}, ${JSON.stringify(input.config ?? {})}::jsonb, 'ACTIVE'
        )
        ON CONFLICT (workspace_id, provider) DO UPDATE
          SET credential_ref = EXCLUDED.credential_ref,
              external_account_ref = EXCLUDED.external_account_ref,
              config = EXCLUDED.config,
              status = 'ACTIVE',
              updated_at = NOW()
        RETURNING id, workspace_id, provider, credential_ref, external_account_ref,
                  config, status, created_at, updated_at
      `;
      const connector = rows[0];
      if (!connector) throw new PublicApiError(500, "CONNECTOR_UPDATE_FAILED", "Connector configuration failed.");

      await tx`
        INSERT INTO audit_events (
          id, workspace_id, actor_user_id, event_type, target_type, target_id, request_id, metadata
        ) VALUES (
          ${randomUUID()}, ${input.workspaceId}, ${input.actorUserId}, 'workspace.connector.changed',
          'connector', 'monday.com', ${input.requestId ?? null},
          ${JSON.stringify({ provider: "monday.com", externalAccountRef: input.externalAccountRef ?? null })}::jsonb
        )
      `;
      return toConnector(connector);
    });
  }

  async appendAuditEvent(input: AuditEventInput): Promise<void> {
    await this.sql`
      INSERT INTO audit_events (
        id, workspace_id, actor_user_id, event_type, target_type, target_id, request_id, metadata
      ) VALUES (
        ${randomUUID()}, ${input.workspaceId}, ${input.actorUserId}, ${input.eventType},
        ${input.targetType ?? null}, ${input.targetId ?? null}, ${input.requestId ?? null},
        ${JSON.stringify(input.metadata ?? {})}::jsonb
      )
    `;
  }
}

export function createPostgresWorkspaceStore(): PostgresWorkspaceStore {
  return new PostgresWorkspaceStore();
}
