import { NextResponse } from "next/server";
import { z } from "zod";
import { WORKSPACE_MEMBER_STATUSES, WORKSPACE_ROLES } from "@/lib/auth/contracts";
import { requireWorkspacePermission, validateWorkspaceId } from "@/lib/auth/authorization";
import { createPostgresWorkspaceStore } from "@/lib/auth/workspace-store";
import { toSafePublicError } from "@/lib/server/errors";
import { apiResponseHeaders, parseJsonRequest } from "@/lib/server/http";
import { logEvent } from "@/lib/server/logger";
import { createRequestId } from "@/lib/server/request-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8_192;
const membershipSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(WORKSPACE_ROLES),
  status: z.enum(WORKSPACE_MEMBER_STATUSES),
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
      "MEMBERSHIP_MANAGE",
      { workspaceStore: store },
    );
    const body = await parseJsonRequest(request, membershipSchema, MAX_BODY_BYTES);
    const membership = await store.changeMembership({
      workspaceId,
      actorUserId: authorized.session.identity.userId,
      targetUserId: body.userId,
      role: body.role,
      status: body.status,
      requestId,
    });
    logEvent("info", "workspace.membership_changed", {
      requestId,
      workspaceId,
      actorUserId: authorized.session.identity.userId,
      targetUserId: body.userId,
      role: body.role,
      status: body.status,
    });
    return NextResponse.json({ ok: true, membership }, {
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
