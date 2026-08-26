import { describe, expect, it } from "vitest";
import { runCopilotEvaluation } from "./evaluation-runner";

describe("runCopilotEvaluation", () => {
  it("reports only measured routing, tool, security and fallback results", async () => {
    const report = await runCopilotEvaluation();
    expect(report.totalCases).toBeGreaterThan(0);
    expect(report.routing.measured).toBeGreaterThan(0);
    expect(report.toolSelection.measured).toBeGreaterThan(0);
    expect(report.securityRejection.measured).toBeGreaterThan(0);
    expect(report.fallbackCorrectness.measured).toBe(2);
    expect(report.routing.accuracy).not.toBeNull();
    expect(report.toolSelection.accuracy).not.toBeNull();
    expect(report.securityRejection.accuracy).not.toBeNull();
    expect(report.fallbackCorrectness.accuracy).not.toBeNull();
    expect(report.passCount).toBeLessThanOrEqual(report.totalCases);
  });
});
