import type { BusinessDataSnapshot } from "@/lib/business-data";
import { observeOperation } from "@/lib/server/telemetry";
import {
  plannerProposalSchema,
  type AnalysisFilter,
  type BaseToolCall,
  type ConversationContext,
  type PlannerProposal,
  type ToolCall,
} from "./contracts";

export interface AnalyticalPlanningProvider {
  name: string;
  model: string;
  propose(input: { message: string; context?: ConversationContext }): Promise<unknown>;
}

export interface PlannedAnalysis {
  proposal: PlannerProposal;
  planner: "gemini" | "deterministic_fallback";
  caveats: string[];
}

function clarification(question: string, reason: string, options?: string[]): PlannerProposal {
  return { kind: "clarification", question, reason, options };
}

function lower(value: string): string {
  return value.trim().toLowerCase();
}

function filterValue(context: ConversationContext | undefined, field: AnalysisFilter["field"]): unknown {
  return context?.filters.find((filter) => filter.field === field)?.value;
}

function previousBaseCall(context?: ConversationContext): BaseToolCall | null {
  const call = context?.previousResult?.toolCall;
  if (!call) return null;
  return call.tool === "runScenario" ? call.args.analysis : call;
}

export function parseMoneyMention(message: string): number | null {
  const normalized = message.replace(/,/g, " ");
  const patterns: Array<[RegExp, number]> = [
    [/(?:₹|inr\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:crore|crores|cr)\b/i, 10_000_000],
    [/(?:₹|inr\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:lakh|lakhs|lac|lacs)\b/i, 100_000],
    [/(?:₹|inr\s*)?([0-9]+(?:\.[0-9]+)?)\s*m\b/i, 1_000_000],
    [/(?:₹|inr\s*)?([0-9]+(?:\.[0-9]+)?)\s*k\b/i, 1_000],
    [/₹\s*([0-9]+(?:\.[0-9]+)?)/i, 1],
    [/\binr\s*([0-9]+(?:\.[0-9]+)?)/i, 1],
  ];
  for (const [pattern, multiplier] of patterns) {
    const match = pattern.exec(normalized);
    if (match) return Math.round(Number(match[1]) * multiplier * 100) / 100;
  }
  return null;
}

function withMinDealValue(call: BaseToolCall, value: number): BaseToolCall | null {
  if (call.tool === "getPipelineSummary") return { ...call, args: { ...call.args, minDealValue: value } };
  if (call.tool === "getPipelineBySector") return { ...call, args: { ...call.args, minDealValue: value } };
  if (call.tool === "getPipelineByStage") return { ...call, args: { ...call.args, minDealValue: value } };
  return null;
}

function fallbackScenario(message: string, context?: ConversationContext): PlannerProposal | null {
  const base = previousBaseCall(context) ?? { tool: "getPipelineSummary", args: {} } as const;
  const dealMatch = /\bdeal\s+([a-z0-9_-]+)\b/i.exec(message);
  const workOrderMatch = /\b(?:work\s*order|wo)\s+([a-z0-9_-]+)\b/i.exec(message);
  const quarterMatch = /\bq([1-4])\s*(20\d{2})\b/i.exec(message);
  const dateMatch = /\b(20\d{2}-(?:0[1-9]|1[0-2])-(?:[0-2]\d|3[01]))\b/.exec(message);

  if (dealMatch && /\b(won|win)\b/i.test(message)) {
    return { kind: "tool_call", confidence: 0.98, call: { tool: "runScenario", args: { analysis: base, overrides: [{ type: "set_deal_outcome", dealId: dealMatch[1], outcome: "won" }] } } };
  }
  if (dealMatch && /\b(lost|lose|dead)\b/i.test(message)) {
    return { kind: "tool_call", confidence: 0.98, call: { tool: "runScenario", args: { analysis: base, overrides: [{ type: "set_deal_outcome", dealId: dealMatch[1], outcome: "lost" }] } } };
  }
  if (dealMatch && /\bopen\b/i.test(message)) {
    return { kind: "tool_call", confidence: 0.96, call: { tool: "runScenario", args: { analysis: base, overrides: [{ type: "set_deal_outcome", dealId: dealMatch[1], outcome: "open" }] } } };
  }
  if (dealMatch && /\bexclude|remove\b/i.test(message)) {
    return { kind: "tool_call", confidence: 0.98, call: { tool: "runScenario", args: { analysis: base, overrides: [{ type: "set_deal_included", dealId: dealMatch[1], included: false }] } } };
  }
  if (dealMatch && /\binclude|restore\b/i.test(message)) {
    return { kind: "tool_call", confidence: 0.98, call: { tool: "runScenario", args: { analysis: base, overrides: [{ type: "set_deal_included", dealId: dealMatch[1], included: true }] } } };
  }
  if (dealMatch && quarterMatch && /\b(move|shift|close)\b/i.test(message)) {
    return { kind: "tool_call", confidence: 0.98, call: { tool: "runScenario", args: { analysis: base, overrides: [{ type: "move_deal_close_period", dealId: dealMatch[1], quarter: `Q${quarterMatch[1]} ${quarterMatch[2]}` }] } } };
  }
  if (dealMatch && dateMatch && /\b(move|shift|close)\b/i.test(message)) {
    return { kind: "tool_call", confidence: 0.98, call: { tool: "runScenario", args: { analysis: base, overrides: [{ type: "move_deal_close_date", dealId: dealMatch[1], date: dateMatch[1] }] } } };
  }
  if (workOrderMatch && /\b(resolve|resolved|complete|completed)\b/i.test(message)) {
    return { kind: "tool_call", confidence: 0.98, call: { tool: "runScenario", args: { analysis: base, overrides: [{ type: "resolve_work_order", workOrderId: workOrderMatch[1] }] } } };
  }
  if (workOrderMatch && dateMatch && /\b(delay|delayed|push)\b/i.test(message)) {
    return { kind: "tool_call", confidence: 0.98, call: { tool: "runScenario", args: { analysis: base, overrides: [{ type: "delay_work_order", workOrderId: workOrderMatch[1], newProbableEndDate: dateMatch[1] }] } } };
  }
  const amount = parseMoneyMention(message);
  if (workOrderMatch && amount !== null && /\b(pay|payment|collect|collection)\b/i.test(message)) {
    return { kind: "tool_call", confidence: 0.96, call: { tool: "runScenario", args: { analysis: { tool: "getReceivables", args: {} }, overrides: [{ type: "apply_receivable_payment", workOrderId: workOrderMatch[1], amount }] } } };
  }
  return null;
}

export function deterministicFallbackProposal(message: string, context?: ConversationContext): PlannerProposal {
  const normalized = message.trim();
  const normalizedLower = lower(normalized);
  const previous = previousBaseCall(context);

  if (/^(why|why\?|explain|explain that|why is that)\??$/i.test(normalized) && previous) {
    return { kind: "tool_call", call: previous, confidence: 1 };
  }

  const amount = parseMoneyMention(normalized);
  if (amount !== null && /\b(above|over|greater than|at least|>=)\b/i.test(normalized) && previous) {
    const filtered = withMinDealValue(previous, amount);
    if (filtered) return { kind: "tool_call", call: filtered, confidence: 1 };
  }

  if (/\b(compare|versus|vs\.?|difference)\b/i.test(normalized) && /\b(last|previous)\s+quarter\b/i.test(normalized)) {
    const allowedMetrics = new Set(["open_pipeline_value", "known_won_value", "open_deal_count"] as const);
    const metricId = context?.metricId ?? "open_pipeline_value";
    if (!allowedMetrics.has(metricId as "open_pipeline_value" | "known_won_value" | "open_deal_count")) {
      return clarification(
        "Which pipeline metric should I compare by quarter?",
        "This V2 period-comparison tool currently supports open pipeline value, known won value, and open deal count; it will not silently substitute another metric.",
        ["Open pipeline value", "Known won value", "Open deal count"],
      );
    }
    const dimension = context?.dimension === "sector" || context?.dimension === "stage" ? context.dimension : undefined;
    const entity = dimension && context?.entity?.type === dimension ? context.entity.id : undefined;
    return {
      kind: "tool_call",
      confidence: 0.98,
      call: {
        tool: "getPeriodComparison",
        args: {
          metricId: metricId as "open_pipeline_value" | "known_won_value" | "open_deal_count",
          dimension,
          entity,
          filters: context?.filters ?? [],
          from: { kind: "previous_quarter" },
          to: { kind: "current_quarter" },
        },
      },
    };
  }

  if (/\b(what if|assume|hypothetical|scenario)\b/i.test(normalized)) {
    return fallbackScenario(normalized, context) ?? clarification(
      "Which source record and explicit hypothetical change should I apply?",
      "Scenarios require grounded Deal/Work Order identifiers and explicit values or periods; the system will not invent scenario inputs.",
    );
  }

  const customerMatch = /\b(company\d+|customer[_-]?[a-z0-9]+|client[_-]?[a-z0-9]+)\b/i.exec(normalized);
  if (customerMatch && /\b(customer|client|company|360|overview|exposure)\b/i.test(normalized)) {
    return { kind: "tool_call", confidence: 0.9, call: { tool: "getCustomer360", args: { customerKey: customerMatch[1].toUpperCase() } } };
  }

  if (/\b(receivable|receivables|amount due|collections?)\b/i.test(normalized)) {
    const contextCustomer = context?.entity?.type === "client" ? context.entity.id : filterValue(context, "client");
    return { kind: "tool_call", confidence: 0.95, call: { tool: "getReceivables", args: typeof contextCustomer === "string" ? { customerKey: contextCustomer } : {} } };
  }

  if (/\b(work orders?|execution|delivery|operations?|projects? at risk)\b/i.test(normalized)) {
    const contextCustomer = context?.entity?.type === "client" ? context.entity.id : filterValue(context, "client");
    return { kind: "tool_call", confidence: 0.94, call: { tool: "getWorkOrderHealth", args: typeof contextCustomer === "string" ? { customerKey: contextCustomer } : {} } };
  }

  const prefixedSectorMatch = /\b(?:the|our|in|for)\s+([a-z][a-z0-9&/-]*(?:\s+[a-z0-9&/-]+){0,2})\s+sector\b/i.exec(normalized);
  const singleSectorMatch = /\b([a-z][a-z0-9&/-]*)\s+sector\b/i.exec(normalized);
  if (/\bsectors?\b/i.test(normalized)) {
    const generic = new Set(["which", "what", "largest", "biggest", "our", "the"]);
    const candidate = prefixedSectorMatch?.[1] ?? singleSectorMatch?.[1];
    const sector = candidate && !generic.has(lower(candidate)) ? candidate : undefined;
    return { kind: "tool_call", confidence: 0.94, call: { tool: "getPipelineBySector", args: sector ? { sector } : {} } };
  }

  if (/\b(stage|stages|stage breakdown)\b/i.test(normalized)) {
    return { kind: "tool_call", confidence: 0.94, call: { tool: "getPipelineByStage", args: {} } };
  }

  if (/\b(pipeline|open opportunit(?:y|ies)|won value|revenue)\b/i.test(normalizedLower)) {
    return { kind: "tool_call", confidence: 0.92, call: { tool: "getPipelineSummary", args: {} } };
  }

  return clarification(
    "Which approved business analysis should I run?",
    "The request did not map safely to an allowlisted analytical tool.",
    ["Pipeline summary", "Pipeline by sector", "Receivables", "Work-order health", "Customer 360"],
  );
}

function knownValues(snapshot: BusinessDataSnapshot) {
  return {
    sectors: new Set([
      ...snapshot.deals.map((deal) => deal.sector).filter((value): value is string => Boolean(value)),
      ...snapshot.workOrders.map((workOrder) => workOrder.sector).filter((value): value is string => Boolean(value)),
    ].map(lower)),
    stages: new Set(snapshot.deals.map((deal) => deal.stage).filter((value): value is string => Boolean(value)).map(lower)),
    customers: new Set([
      ...snapshot.deals.map((deal) => deal.normalizedClientKey),
      ...snapshot.workOrders.map((workOrder) => workOrder.normalizedClientKey),
    ].filter((value): value is string => Boolean(value)).map(lower)),
    dealIds: new Set(snapshot.deals.map((deal) => lower(deal.mondayItemId))),
    workOrderIds: new Set(snapshot.workOrders.map((workOrder) => lower(workOrder.mondayItemId))),
  };
}

function groundedByContext(value: string, context?: ConversationContext): boolean {
  const normalized = lower(value);
  if (context?.entity && (lower(context.entity.id) === normalized || lower(context.entity.label ?? "") === normalized)) return true;
  return context?.filters.some((filter) => typeof filter.value === "string" && lower(filter.value) === normalized) ?? false;
}

function textGrounded(value: string, message: string, context?: ConversationContext): boolean {
  return lower(message).includes(lower(value)) || groundedByContext(value, context);
}

function validateBaseCall(message: string, context: ConversationContext | undefined, call: BaseToolCall, snapshot: BusinessDataSnapshot): string | null {
  const known = knownValues(snapshot);
  const checkSector = (sector?: string) => sector && (!known.sectors.has(lower(sector)) || !textGrounded(sector, message, context))
    ? `Sector “${sector}” is not both grounded and present in the source snapshot.` : null;
  const checkStage = (stage?: string) => stage && (!known.stages.has(lower(stage)) || !textGrounded(stage, message, context))
    ? `Stage “${stage}” is not both grounded and present in the source snapshot.` : null;
  const checkCustomer = (customer?: string) => customer && (!known.customers.has(lower(customer)) || !textGrounded(customer, message, context))
    ? `Customer “${customer}” is not both grounded and present in the source snapshot.` : null;

  if (call.tool === "getPipelineSummary" || call.tool === "getPipelineBySector" || call.tool === "getPipelineByStage") {
    const issue = checkSector("sector" in call.args ? call.args.sector : undefined) ?? checkStage("stage" in call.args ? call.args.stage : undefined);
    if (issue) return issue;
    if (call.args.minDealValue !== undefined) {
      const mentioned = parseMoneyMention(message);
      const inherited = filterValue(context, "deal_value");
      if (mentioned !== call.args.minDealValue && inherited !== call.args.minDealValue) {
        return "The minimum Deal value was not grounded in the user message or structured context.";
      }
    }
    if (call.args.period?.kind === "quarter" && !lower(message).includes(lower(call.args.period.value)) && context?.period?.kind !== "quarter") {
      return `Quarter “${call.args.period.value}” was not grounded in the request.`;
    }
  }

  if (call.tool === "getCustomer360") return checkCustomer(call.args.customerKey);
  if (call.tool === "getReceivables" || call.tool === "getWorkOrderHealth") return checkCustomer(call.args.customerKey);
  if (call.tool === "getPeriodComparison") {
    if (call.args.dimension === "sector") {
      const issue = checkSector(call.args.entity);
      if (issue) return issue;
    }
    if (call.args.dimension === "stage") {
      const issue = checkStage(call.args.entity);
      if (issue) return issue;
    }
    for (const filter of call.args.filters) {
      if (filter.field === "sector") { const issue = checkSector(filter.value); if (issue) return issue; }
      if (filter.field === "stage") { const issue = checkStage(filter.value); if (issue) return issue; }
      if (filter.field === "client") { const issue = checkCustomer(filter.value); if (issue) return issue; }
    }
  }
  return null;
}

function validateScenarioGrounding(message: string, call: Extract<ToolCall, { tool: "runScenario" }>, snapshot: BusinessDataSnapshot): string | null {
  const known = knownValues(snapshot);
  const money = parseMoneyMention(message);
  const normalizedMessage = lower(message);
  for (const override of call.args.overrides) {
    if ("dealId" in override) {
      if (!known.dealIds.has(lower(override.dealId)) || !normalizedMessage.includes(lower(override.dealId))) return `Scenario Deal ${override.dealId} is not grounded in the request and source snapshot.`;
    }
    if ("workOrderId" in override) {
      if (!known.workOrderIds.has(lower(override.workOrderId)) || !normalizedMessage.includes(lower(override.workOrderId))) return `Scenario Work Order ${override.workOrderId} is not grounded in the request and source snapshot.`;
    }
    if (override.type === "move_deal_close_period" && !normalizedMessage.includes(lower(override.quarter))) return `Scenario quarter ${override.quarter} is not grounded in the request.`;
    if (override.type === "move_deal_close_date" && !normalizedMessage.includes(override.date)) return `Scenario date ${override.date} is not grounded in the request.`;
    if (override.type === "delay_work_order" && !normalizedMessage.includes(override.newProbableEndDate)) return `Scenario date ${override.newProbableEndDate} is not grounded in the request.`;
    if ((override.type === "set_collection_amount" || override.type === "apply_receivable_payment") && money !== override.amount) return "Scenario amount is not grounded in the user-supplied monetary value.";
  }
  return null;
}

export function validateGroundedProposal(message: string, context: ConversationContext | undefined, proposal: PlannerProposal, snapshot: BusinessDataSnapshot): PlannerProposal {
  if (proposal.kind !== "tool_call") return proposal;
  const call = proposal.call;
  const base = call.tool === "runScenario" ? call.args.analysis : call;
  const issue = validateBaseCall(message, context, base, snapshot)
    ?? (call.tool === "runScenario" ? validateScenarioGrounding(message, call, snapshot) : null);
  return issue ? clarification(
    "Could you clarify the exact source entity, period, or value you want to use?",
    `The proposed analysis was rejected by grounding validation. ${issue}`,
  ) : proposal;
}

async function planWithGuardrailsInternal(
  message: string,
  snapshot: BusinessDataSnapshot,
  context?: ConversationContext,
  provider?: AnalyticalPlanningProvider | null,
): Promise<PlannedAnalysis> {
  if (provider) {
    try {
      const raw = await provider.propose({ message, context });
      const parsed = plannerProposalSchema.safeParse(raw);
      if (parsed.success) {
        const grounded = validateGroundedProposal(message, context, parsed.data, snapshot);
        if (grounded.kind === "tool_call") {
          return { proposal: grounded, planner: "gemini", caveats: [] };
        }
      }
    } catch {
      // The deterministic fallback is the safety path; provider failures never block authoritative analytics.
    }
  }

  const fallback = deterministicFallbackProposal(message, context);
  return {
    proposal: validateGroundedProposal(message, context, fallback, snapshot),
    planner: "deterministic_fallback",
    caveats: provider ? ["The optional LLM planner was unavailable, invalid, or failed grounding checks; deterministic planning fallback was used."] : ["No LLM planner was configured; deterministic planning fallback was used."],
  };
}

export function planWithGuardrails(
  message: string,
  snapshot: BusinessDataSnapshot,
  context?: ConversationContext,
  provider?: AnalyticalPlanningProvider | null,
): Promise<PlannedAnalysis> {
  return observeOperation(
    "copilot.planning",
    { operation: "copilot_planning", provider: provider?.name },
    () => planWithGuardrailsInternal(message, snapshot, context, provider),
  );
}
