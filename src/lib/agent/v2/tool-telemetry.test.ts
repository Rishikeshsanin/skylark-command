import { afterEach, describe, expect, it, vi } from "vitest";
import type { BusinessDataSnapshot } from "@/lib/business-data";
import { executeRegisteredTool } from "./tool-registry";

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

afterEach(() => vi.restoreAllMocks());

describe("tool execution telemetry", () => {
  it("emits selected tool, duration and success without source record payloads", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await executeRegisteredTool({ tool: "getPipelineSummary", args: {} }, snapshot);
    const output = info.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("copilot.tool.execute");
    expect(output).toContain('"toolName":"getPipelineSummary"');
    expect(output).toContain('"resultStatus":"success"');
    expect(output).toContain('"durationMs"');
    expect(output).not.toContain("normalizationIssues");
  });
});
