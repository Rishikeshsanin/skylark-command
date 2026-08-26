import { NextResponse } from "next/server";
import { getHealthSnapshot } from "@/lib/server/health";
import { apiResponseHeaders } from "@/lib/server/http";
import { resolveRequestId } from "@/lib/server/request-id";
import { runWithTelemetryContext } from "@/lib/server/telemetry-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = resolveRequestId(request.headers);
  return runWithTelemetryContext({ requestId, route: "/api/health" }, () => {
    const snapshot = getHealthSnapshot(requestId);
    return NextResponse.json(snapshot, {
      status: 200,
      headers: apiResponseHeaders(requestId),
    });
  });
}
