import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspacePermission, validateWorkspaceId } from "@/lib/auth/authorization";
import {
  assertConnectorConfigContainsNoSecrets,
  validateCredentialReference,
} from "@/lib/auth/connector-config";
import { createPostgresWorkspaceStore } from "@/lib/auth/workspace-store";
import { PublicApiError, toSafePublicError } from "@/lib/server/errors";
import { apiResponseHeaders, parseJsonRequest } from "@/lib/server/http";
import { logEvent } from "@/lib/server/logger";
import { createRequestId } from "@/lib/server/request-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;
const boardIdSchema = z.string().trim().min(1).max(32).regex(/^\d+$/);
const mondayConfigSchema = z.object({
  dealsBoardId: boardIdSchema.optional(),
  workOrdersBoardId: boardIdSchema.optional(),
}).strict();
const connectorSchema = z.object({
  credentialRef: z.string().trim().min(5).max(255),
  externalAccountRef: z.string().trim().min(1).max(255).nullable().optional(),
  config: mondayConfigSchema.default({}),
}).strict();

type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const requestId = createRequestId();
  try {
    const { workspaceId: rawWorkspaceId } = await context.params;
    const workspaceId = validateWorkspaceId(rawWorkspaceId);
    const store = createPostgresWorkspaceStore();
    const authorized = await requireWorkspacePermission(
      request,
      workspaceId,
      "CONNECTOR_CONFIGURE",
      { workspaceStore: store },
    );
    const body = await parseJsonRequest(request, connectorSchema, MAX_BODY_BYTES);
    let credentialRef: string;
    try {
      credentialRef = validateCredentialReference(body.credentialRef);
      assertConnectorConfigContainsNoSecrets(body.config);
    } catch {
      throw new PublicApiError(
        400,
        "UNSAFE_CONNECTOR_CONFIG",
        "Connector configuration must contain only non-secret settings and an opaque credential reference.",
      );
    }

    const connector = await store.configureMondayConnector({
      workspaceId,
      actorUserId: authorized.session.identity.userId,
      credentialRef,
      externalAccountRef: body.externalAccountRef,
      config: body.config,
      requestId,
    });
    logEvent("info", "workspace.connector_changed", {
      requestId,
      workspaceId,
      actorUserId: authorized.session.identity.userId,
      provider: "monday.com",
    });

    return NextResponse.json({
      ok: true,
      connector: {
        id: connector.id,
        workspaceId: connector.workspaceId,
        provider: connector.provider,
        externalAccountRef: connector.externalAccountRef,
        config: connector.config,
        status: connector.status,
        updatedAt: connector.updatedAt,
      },
    }, {
      status: 200,
      headers: apiResponseHeaders(requestId),
    });
  } catch (error) {
    const safe = toSafePublicError(error);
    return NextResponse.json({ ok: false, errorCode: safe.code, message: safe.message }, {
      status: safe.status,
      headers: apiResponseHeaders(requestId),
    });
  }
}
