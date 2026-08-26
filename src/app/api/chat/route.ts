import { NextResponse } from "next/server";
import { createGeminiExplanationProvider } from "@/lib/agent/gemini-provider";
import { createGeminiAnalyticalPlanningProvider } from "@/lib/agent/v2/planning-provider";
import { observeExplanationProvider, observePlanningProvider } from "@/lib/agent/v2/observed-providers";
import { orchestrateFounderQuestionV2, type CopilotResponseState } from "@/lib/agent/v2/orchestrator";
import { chatRequestSchema, MAX_REQUEST_BYTES } from "@/lib/agent/schemas";
import { buildErrorAgentResponse } from "@/lib/agent/response";
import {
  assertAnalyticalToolsAuthorized,
  resolveAnalyticsAccess,
} from "@/lib/auth/authorization";
import { hasWorkspacePermission } from "@/lib/auth/rbac";
import { withWorkspaceDataScope } from "@/lib/data-platform/workspace-scope";
import { classifyError } from "@/lib/server/error-taxonomy";
import { toSafePublicError } from "@/lib/server/errors";
import { apiResponseHeaders, parseJsonRequest } from "@/lib/server/http";
import { logEvent } from "@/lib/server/logger";
import {
  chatRateLimiter,
  getClientIdentifier,
  rateLimitHeaders,
  type RateLimitResult,
} from "@/lib/server/rate-limit";
import { resolveRequestId } from "@/lib/server/request-id";
import { runWithTelemetryContext } from "@/lib/server/telemetry-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function withNoExecutionTrace(response: ReturnType<typeof buildErrorAgentResponse>, requestId: string) {
  return {
    ...response,
    requestId,
    analysis: {
      planner: "deterministic_fallback" as const,
      toolsUsed: [],
      semanticMetricIds: [],
      filters: [],
      sourceSnapshot: null,
      evidence: { dealItemIds: [], workOrderItemIds: [], dealCount: 0, workOrderCount: 0 },
      context: { version: 1 as const, filters: [] },
      caveats: ["The request ended before any deterministic analytical tool executed."],
    },
  };
}

function telemetryStatus(state: CopilotResponseState) {
  if (state === "NEEDS_CLARIFICATION") return "clarification";
  if (state === "NO_MATCH") return "no_match";
  if (state === "OUT_OF_SCOPE") return "out_of_scope";
  if (state === "ERROR") return "error";
  return "success";
}

function looksLikeSecurityRejection(message: string): boolean {
  return /\b(?:ignore\s+(?:all\s+)?(?:prior|previous|your)\s+(?:rules|instructions)|graphql\s+mutation|monday\s+mutation|drop\s+table|delete\s+the\s+old\s+deals?)\b/i.test(message);
}

export async function POST(request: Request) {
  const requestId = resolveRequestId(request.headers);
  const startedAt = performance.now();

  return runWithTelemetryContext({ requestId, route: "/api/chat" }, async () => {
    let rateLimit: RateLimitResult | undefined;
    try {
      const clientId = getClientIdentifier(request.headers);
      rateLimit = chatRateLimiter.check(`${clientId}:chat`);

      if (!rateLimit.allowed) {
        const retryAfterSeconds = Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1_000));
        const response = withNoExecutionTrace(buildErrorAgentResponse(
          "RATE_LIMITED",
          "Too many chat requests. Please retry shortly.",
        ), requestId);
        logEvent("warn", "chat.rate_limited", {
          operation: "chat_request",
          status: 429,
          resultStatus: "rejected",
          errorCategory: "VALIDATION",
          durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        });
        return NextResponse.json(response, {
          status: 429,
          headers: apiResponseHeaders(requestId, {
            ...rateLimitHeaders(rateLimit),
            "retry-after": String(retryAfterSeconds),
          }),
        });
      }

      const access = await resolveAnalyticsAccess(request);
      const body = await parseJsonRequest(request, chatRequestSchema, MAX_REQUEST_BYTES);
      const scenarioAllowed = access.mode === "public_demo" ||
        hasWorkspacePermission(access.membership.role, "SCENARIO_RUN");
      const planningProvider = observePlanningProvider(createGeminiAnalyticalPlanningProvider());
      const explanationProvider = observeExplanationProvider(createGeminiExplanationProvider());
      const response = await withWorkspaceDataScope(
        access.mode === "workspace" ? access.workspaceKey : undefined,
        scenarioAllowed,
        () => orchestrateFounderQuestionV2(
          body.message,
          body.context,
          planningProvider,
          explanationProvider,
          requestId,
        ),
      );
      assertAnalyticalToolsAuthorized(access, response.analysis.toolsUsed);

      const providerFallback = response.analysis.caveats.some((caveat) =>
        /(?:provider|planner|explanation).*(?:fallback|unavailable|invalid|failed)/i.test(caveat),
      );
      if (providerFallback) {
        logEvent("warn", "copilot.provider_fallback", {
          operation: "copilot",
          provider: "gemini",
          resultStatus: "provider_fallback",
          toolsUsed: response.analysis.toolsUsed,
        });
      }
      if (response.responseState === "OUT_OF_SCOPE" && looksLikeSecurityRejection(body.message)) {
        logEvent("warn", "copilot.prompt_injection_rejected", {
          operation: "copilot_security",
          resultStatus: "rejected",
          errorCategory: "AUTHORIZATION",
        });
      }

      logEvent("info", "chat.completed", {
        operation: "chat_request",
        status: 200,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        resultStatus: telemetryStatus(response.responseState),
        accessMode: access.mode,
        workspaceId: access.mode === "workspace" ? access.workspaceId : null,
        clarificationRequired: Boolean(response.clarification),
        planner: response.analysis.planner,
        toolsUsed: response.analysis.toolsUsed,
        selectedTool: response.analysis.toolsUsed[0] ?? null,
      });

      return NextResponse.json(response, {
        status: 200,
        headers: apiResponseHeaders(requestId, rateLimitHeaders(rateLimit)),
      });
    } catch (error) {
      const safe = toSafePublicError(error);
      const response = withNoExecutionTrace(buildErrorAgentResponse(safe.code, safe.message), requestId);
      const rejected = safe.status < 500;
      if (["INVALID_REQUEST", "INVALID_JSON", "MESSAGE_TOO_LONG", "REQUEST_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE"].includes(safe.code)) {
        logEvent("warn", "copilot.schema_rejected", {
          operation: "chat_schema_validation",
          resultStatus: "rejected",
          errorCode: safe.code,
          errorCategory: "VALIDATION",
        });
      }
      logEvent(rejected ? "warn" : "error", rejected ? "chat.request_rejected" : "chat.failed", {
        operation: "chat_request",
        status: safe.status,
        errorCode: safe.code,
        errorCategory: classifyError(error),
        resultStatus: rejected ? "rejected" : "error",
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      });

      return NextResponse.json(response, {
        status: safe.status,
        headers: apiResponseHeaders(requestId, rateLimit ? rateLimitHeaders(rateLimit) : {}),
      });
    }
  });
}
