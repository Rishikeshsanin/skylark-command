import { NextResponse } from "next/server";
import { matchesBearerSecret } from "@/lib/auth/internal-auth";
import { runBusinessDataSync } from "@/lib/data-platform/sync";
import { classifyError } from "@/lib/server/error-taxonomy";
import { apiResponseHeaders } from "@/lib/server/http";
import { logEvent } from "@/lib/server/logger";
import { resolveRequestId } from "@/lib/server/request-id";
import { runWithTelemetryContext } from "@/lib/server/telemetry-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = resolveRequestId(request.headers);
  const startedAt = performance.now();
  return runWithTelemetryContext({ requestId, route: "/api/internal/sync/monday" }, async () => {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) {
      return NextResponse.json(
        { ok: false, errorCode: "SYNC_NOT_CONFIGURED", requestId },
        { status: 503, headers: apiResponseHeaders(requestId) },
      );
    }
    if (!matchesBearerSecret(request.headers.get("authorization"), secret)) {
      logEvent("warn", "data.sync.rejected", {
        operation: "temporal_sync",
        resultStatus: "rejected",
        errorCategory: "AUTHORIZATION",
      });
      return NextResponse.json(
        { ok: false, errorCode: "UNAUTHORIZED", requestId },
        { status: 401, headers: apiResponseHeaders(requestId) },
      );
    }

    try {
      const result = await runBusinessDataSync();
      logEvent("info", "data.sync.request_completed", {
        operation: "temporal_sync_request",
        syncId: result.syncId,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        resultStatus: "success",
        recordsFetched: result.recordsFetched,
        recordsNormalized: result.recordsNormalized,
        recordsPersisted: result.recordsPersisted,
        sourceWatermark: result.sourceWatermark,
        freshnessState: result.freshness.state,
      });
      return NextResponse.json(
        { ok: true, requestId, ...result },
        { headers: apiResponseHeaders(requestId) },
      );
    } catch (error) {
      logEvent("error", "data.sync.request_failed", {
        operation: "temporal_sync_request",
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        resultStatus: "error",
        errorCategory: classifyError(error),
      });
      return NextResponse.json(
        { ok: false, errorCode: "SYNC_FAILED", requestId },
        { status: 503, headers: apiResponseHeaders(requestId) },
      );
    }
  });
}
