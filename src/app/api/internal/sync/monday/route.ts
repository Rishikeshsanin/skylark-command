import { NextResponse } from "next/server";
import { matchesBearerSecret } from "@/lib/auth/internal-auth";
import { runBusinessDataSync } from "@/lib/data-platform/sync";
import { logEvent } from "@/lib/server/logger";
import { createRequestId } from "@/lib/server/request-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    return NextResponse.json(
      { ok: false, errorCode: "SYNC_NOT_CONFIGURED", requestId },
      { status: 503 },
    );
  }

  if (!matchesBearerSecret(request.headers.get("authorization"), secret)) {
    return NextResponse.json(
      { ok: false, errorCode: "UNAUTHORIZED", requestId },
      { status: 401 },
    );
  }

  try {
    const result = await runBusinessDataSync();
    logEvent("info", "data.sync.completed", {
      requestId,
      syncId: result.syncId,
      recordsFetched: result.recordsFetched,
      recordsPersisted: result.recordsPersisted,
      reusedExistingSnapshot: result.reusedExistingSnapshot,
    });
    return NextResponse.json({ ok: true, requestId, ...result });
  } catch {
    logEvent("error", "data.sync.failed", {
      requestId,
      route: "/api/internal/sync/monday",
    });
    return NextResponse.json(
      { ok: false, errorCode: "SYNC_FAILED", requestId },
      { status: 503 },
    );
  }
}
