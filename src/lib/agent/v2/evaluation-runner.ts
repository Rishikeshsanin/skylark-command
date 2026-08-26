import type { BusinessDataSnapshot } from "@/lib/business-data";
import { routeConversation } from "./conversation-routing";
import { COPILOT_QUALITY_EVAL } from "./copilot-quality-eval";
import { COPILOT_V2_EVAL_DATASET } from "./eval-dataset";
import { planWithGuardrails, type AnalyticalPlanningProvider } from "./planner";
import type { ConversationContext, ToolCall } from "./contracts";

export interface EvaluationFailure {
  id: string;
  metric: "routing" | "tool_selection" | "security_rejection" | "fallback";
  expected: string;
  actual: string;
}

export interface CopilotEvaluationReport {
  totalCases: number;
  passCount: number;
  failures: EvaluationFailure[];
  routing: { measured: number; passed: number; accuracy: number | null };
  toolSelection: { measured: number; passed: number; accuracy: number | null };
  securityRejection: { measured: number; passed: number; accuracy: number | null };
  fallbackCorrectness: { measured: number; passed: number; accuracy: number | null };
}

const snapshot: BusinessDataSnapshot = {
  deals: [],
  workOrders: [],
  normalizationIssues: [],
  source: {
    provider: "monday.com",
    dealsBoardId: "eval-deals",
    workOrdersBoardId: "eval-work-orders",
    dealsBoardName: "Evaluation Deals",
    workOrdersBoardName: "Evaluation Work Orders",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    dataMode: "live",
  },
};

function contextFixture(): ConversationContext {
  const toolCall: ToolCall = { tool: "getPipelineBySector", args: { sector: "Mining" } };
  return {
    version: 1,
    dimension: "sector",
    entity: { type: "sector", id: "Mining", label: "Mining" },
    filters: [{ field: "sector", operator: "eq", value: "Mining" }],
    previousResult: {
      toolCall,
      snapshotId: "eval-snapshot",
      semanticMetricIds: ["open_pipeline_value"],
      resultRef: "eval",
    },
  };
}

const outageProvider: AnalyticalPlanningProvider = {
  name: "eval-outage",
  model: "none",
  async propose() {
    throw new Error("simulated provider outage");
  },
};

const hallucinatingProvider: AnalyticalPlanningProvider = {
  name: "eval-hallucination",
  model: "none",
  async propose() {
    return { kind: "tool_call", call: { tool: "deleteEverything", args: {} }, confidence: 1 };
  },
};

function ratio(passed: number, measured: number): number | null {
  return measured === 0 ? null : Math.round((passed / measured) * 10_000) / 10_000;
}

export async function runCopilotEvaluation(): Promise<CopilotEvaluationReport> {
  const failures: EvaluationFailure[] = [];
  let routingMeasured = 0;
  let routingPassed = 0;
  for (const testCase of COPILOT_QUALITY_EVAL) {
    const actual = routeConversation(testCase.message).state;
    routingMeasured += 1;
    if (actual === testCase.expectedRoute) routingPassed += 1;
    else failures.push({ id: testCase.id, metric: "routing", expected: testCase.expectedRoute, actual });
  }

  let toolMeasured = 0;
  let toolPassed = 0;
  let securityMeasured = 0;
  let securityPassed = 0;
  let fallbackMeasured = 0;
  let fallbackPassed = 0;

  for (const testCase of COPILOT_V2_EVAL_DATASET) {
    const context = testCase.requiresContext ? contextFixture() : undefined;
    const provider = testCase.category === "fallback_behavior"
      ? outageProvider
      : testCase.category === "tool_hallucination"
        ? hallucinatingProvider
        : null;
    const planned = await planWithGuardrails(testCase.message, snapshot, context, provider);

    if (testCase.expectedTool) {
      toolMeasured += 1;
      const actual = planned.proposal.kind === "tool_call" ? planned.proposal.call.tool : planned.proposal.kind;
      if (actual === testCase.expectedTool) toolPassed += 1;
      else failures.push({ id: testCase.id, metric: "tool_selection", expected: testCase.expectedTool, actual });
    }

    if (testCase.category === "unsupported_request" || testCase.category === "injection_resistance") {
      securityMeasured += 1;
      const rejected = planned.proposal.kind !== "tool_call";
      if (rejected) securityPassed += 1;
      else failures.push({ id: testCase.id, metric: "security_rejection", expected: "rejected", actual: planned.proposal.call.tool });
    }

    if (testCase.category === "fallback_behavior" || testCase.category === "tool_hallucination") {
      fallbackMeasured += 1;
      const actualTool = planned.proposal.kind === "tool_call" ? planned.proposal.call.tool : planned.proposal.kind;
      const correct = planned.planner === "deterministic_fallback" && (!testCase.expectedTool || actualTool === testCase.expectedTool);
      if (correct) fallbackPassed += 1;
      else failures.push({ id: testCase.id, metric: "fallback", expected: testCase.expectedTool ?? "deterministic_fallback", actual: `${planned.planner}:${actualTool}` });
    }
  }

  const totalCases = routingMeasured + COPILOT_V2_EVAL_DATASET.length;
  const distinctFailedIds = new Set(failures.map((failure) => failure.id));
  return {
    totalCases,
    passCount: totalCases - distinctFailedIds.size,
    failures,
    routing: { measured: routingMeasured, passed: routingPassed, accuracy: ratio(routingPassed, routingMeasured) },
    toolSelection: { measured: toolMeasured, passed: toolPassed, accuracy: ratio(toolPassed, toolMeasured) },
    securityRejection: { measured: securityMeasured, passed: securityPassed, accuracy: ratio(securityPassed, securityMeasured) },
    fallbackCorrectness: { measured: fallbackMeasured, passed: fallbackPassed, accuracy: ratio(fallbackPassed, fallbackMeasured) },
  };
}
