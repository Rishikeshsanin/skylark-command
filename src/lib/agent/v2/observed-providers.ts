import type { ExecutiveExplanationProvider } from "@/lib/agent/explanation";
import { classifyError } from "@/lib/server/error-taxonomy";
import { logEvent } from "@/lib/server/logger";
import { APPROVED_TOOL_IDS } from "./tool-registry";
import type { AnalyticalPlanningProvider } from "./planner";

const approvedTools = new Set<string>(APPROVED_TOOL_IDS);

function proposedTool(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const proposal = raw as Record<string, unknown>;
  const call = proposal.call;
  if (!call || typeof call !== "object" || Array.isArray(call)) return null;
  const tool = (call as Record<string, unknown>).tool;
  return typeof tool === "string" ? tool : null;
}

export function observePlanningProvider(provider: AnalyticalPlanningProvider | null): AnalyticalPlanningProvider | null {
  if (!provider) return null;
  return {
    ...provider,
    async propose(input) {
      const started = performance.now();
      try {
        const raw = await provider.propose(input);
        const tool = proposedTool(raw);
        if (tool && !approvedTools.has(tool)) {
          logEvent("warn", "copilot.tool_hallucination_rejected", {
            operation: "copilot_planning",
            provider: provider.name,
            model: provider.model,
            toolName: tool,
            resultStatus: "rejected",
            errorCategory: "VALIDATION",
            durationMs: Math.round((performance.now() - started) * 100) / 100,
          });
        } else {
          logEvent("info", "copilot.provider.planning", {
            operation: "copilot_planning",
            provider: provider.name,
            model: provider.model,
            resultStatus: "success",
            durationMs: Math.round((performance.now() - started) * 100) / 100,
          });
        }
        return raw;
      } catch (error) {
        logEvent("warn", "copilot.provider.planning", {
          operation: "copilot_planning",
          provider: provider.name,
          model: provider.model,
          resultStatus: "provider_fallback",
          errorCategory: classifyError(error),
          durationMs: Math.round((performance.now() - started) * 100) / 100,
        });
        throw error;
      }
    },
  };
}

export function observeExplanationProvider(provider: ExecutiveExplanationProvider | null): ExecutiveExplanationProvider | null {
  if (!provider) return null;
  return {
    ...provider,
    async explain(input) {
      const started = performance.now();
      try {
        const result = await provider.explain(input);
        logEvent("info", "copilot.provider.explanation", {
          operation: "copilot_explanation",
          provider: provider.name,
          model: provider.model,
          resultStatus: "success",
          durationMs: Math.round((performance.now() - started) * 100) / 100,
        });
        return result;
      } catch (error) {
        logEvent("warn", "copilot.provider.explanation", {
          operation: "copilot_explanation",
          provider: provider.name,
          model: provider.model,
          resultStatus: "provider_fallback",
          errorCategory: classifyError(error),
          durationMs: Math.round((performance.now() - started) * 100) / 100,
        });
        throw error;
      }
    },
  };
}
