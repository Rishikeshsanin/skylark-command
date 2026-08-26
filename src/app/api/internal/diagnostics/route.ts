import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getInternalDiagnostics } from "@/lib/server/diagnostics";
import { apiResponseHeaders } from "@/lib/server/http";
import { logEvent } from "@/lib/server/logger";
import { resolveRequestId } from "@/lib/server/request-id";
import { runWithTelemetryContext } from "@/lib/server/telemetry-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function matchesBearerToken(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = header.slice("Bearer ".length);
  const left = Buffer.from(supplied);
  const right = Buffer.from(secret);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  const requestId = resolveRequestId(request.headers);
  return runWithTelemetryContext({ requestId, route: "/api/internal/diagnostics" }, async () => {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret || !matchesBearerToken(request.headers.get("authorization"), secret)) {
      logEvent("warn", "diagnostics.rejected", {
        operation: "internal_diagnostics",
        resultStatus: "rejected",
        errorCategory: "AUTHORIZATION",
      });
      return NextResponse.json(
        { ok: false, errorCode: secret ? "UNAUTHORIZED" : "DIAGNOSTICS_NOT_CONFIGURED", requestId },
        { status: secret ? 401 : 503, headers: apiResponseHeaders(requestId) },
      );
    }

    const diagnostics = await getInternalDiagnostics();
    return NextResponse.json(
      { ok: true, requestId, ...diagnostics },
      { status: diagnostics.database === "error" ? 503 : 200, headers: apiResponseHeaders(requestId) },
    );
  });
}
