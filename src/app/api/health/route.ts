import { NextResponse } from "next/server";
import { getHealthSnapshot } from "@/lib/server/health";
import { apiResponseHeaders } from "@/lib/server/http";
import { createRequestId } from "@/lib/server/request-id";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = createRequestId();
  const snapshot = getHealthSnapshot(requestId);

  return NextResponse.json(snapshot, {
    status: 200,
    headers: apiResponseHeaders(requestId),
  });
}
