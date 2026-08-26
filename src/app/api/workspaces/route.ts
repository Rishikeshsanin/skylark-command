import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { createPostgresWorkspaceStore } from "@/lib/auth/workspace-store";
import { toSafePublicError } from "@/lib/server/errors";
import { apiResponseHeaders, parseJsonRequest } from "@/lib/server/http";
import { logEvent } from "@/lib/server/logger";
import { createRequestId } from "@/lib/server/request-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8_192;
const workspaceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(3).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
}).strict();

export async function POST(request: Request) {
  const requestId = createRequestId();
  try {
    const session = await requireSession(request);
    const body = await parseJsonRequest(request, workspaceSchema, MAX_BODY_BYTES);
    const store = createPostgresWorkspaceStore();
    const workspace = await store.createWorkspace({
      workspace: { id: randomUUID(), name: body.name, slug: body.slug },
      ownerUserId: session.identity.userId,
      requestId,
    });
    logEvent("info", "workspace.created", {
      requestId,
      workspaceId: workspace.id,
      actorUserId: session.identity.userId,
    });
    return NextResponse.json({ ok: true, workspace }, {
      status: 201,
      headers: apiResponseHeaders(requestId),
    });
  } catch (error) {
    const safe = toSafePublicError(error);
    logEvent(safe.status >= 500 ? "error" : "warn", "workspace.create_failed", {
      requestId,
      status: safe.status,
      errorCode: safe.code,
    });
    return NextResponse.json({ ok: false, errorCode: safe.code, message: safe.message }, {
      status: safe.status,
      headers: apiResponseHeaders(requestId),
    });
  }
}
