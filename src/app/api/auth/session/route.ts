import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { toSafePublicError } from "@/lib/server/errors";
import { apiResponseHeaders } from "@/lib/server/http";
import { createRequestId } from "@/lib/server/request-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = createRequestId();
  try {
    const session = await requireSession(request);
    return NextResponse.json({
      ok: true,
      identity: {
        userId: session.identity.userId,
        email: session.identity.email ?? null,
        provider: session.identity.provider,
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
