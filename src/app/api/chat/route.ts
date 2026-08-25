import { NextResponse } from "next/server";
import { orchestrateFounderQuestion } from "@/lib/agent/orchestrator";
import {
  chatRequestSchema,
  MAX_REQUEST_BYTES,
} from "@/lib/agent/schemas";
import { buildErrorAgentResponse } from "@/lib/agent/response";
import { toSafePublicError } from "@/lib/server/errors";
import { apiResponseHeaders, parseJsonRequest } from "@/lib/server/http";
import { logEvent } from "@/lib/server/logger";
import {
  chatRateLimiter,
  getClientIdentifier,
  rateLimitHeaders,
  type RateLimitResult,
} from "@/lib/server/rate-limit";
import { createRequestId } from "@/lib/server/request-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = createRequestId();
  const startedAt = Date.now();
  let rateLimit: RateLimitResult | undefined;

  try {
    const clientId = getClientIdentifier(request.headers);
    rateLimit = chatRateLimiter.check(`${clientId}:chat`);

    if (!rateLimit.allowed) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((rateLimit.resetAt - Date.now()) / 1_000),
      );
      const response = buildErrorAgentResponse(
        "RATE_LIMITED",
        "Too many chat requests. Please retry shortly.",
      );

      logEvent("warn", "chat.rate_limited", {
        requestId,
        route: "/api/chat",
        status: 429,
      });

      return NextResponse.json(response, {
        status: 429,
        headers: apiResponseHeaders(requestId, {
          ...rateLimitHeaders(rateLimit),
          "retry-after": String(retryAfterSeconds),
        }),
      });
    }

    const body = await parseJsonRequest(
      request,
      chatRequestSchema,
      MAX_REQUEST_BYTES,
    );

    const response = await orchestrateFounderQuestion(
      body.message,
      undefined,
      undefined,
      requestId,
    );

    logEvent("info", "chat.completed", {
      requestId,
      route: "/api/chat",
      status: 200,
      latencyMs: Date.now() - startedAt,
      clarificationRequired: Boolean(response.clarification),
    });

    return NextResponse.json(response, {
      status: 200,
      headers: apiResponseHeaders(
        requestId,
        rateLimitHeaders(rateLimit),
      ),
    });
  } catch (error) {
    const safe = toSafePublicError(error);
    const response = buildErrorAgentResponse(safe.code, safe.message);

    logEvent(safe.status >= 500 ? "error" : "warn", "chat.failed", {
      requestId,
      route: "/api/chat",
      status: safe.status,
      errorCode: safe.code,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(response, {
      status: safe.status,
      headers: apiResponseHeaders(
        requestId,
        rateLimit ? rateLimitHeaders(rateLimit) : {},
      ),
    });
  }
}
