import { describe, expect, it } from "vitest";
import { parsePlannerModelOutput } from "./provider-output";

describe("parsePlannerModelOutput", () => {
  it("accepts only the bounded query-plan schema", () => {
    expect(
      parsePlannerModelOutput(
        JSON.stringify({
          intent: "pipeline_overview",
          period: "current_quarter",
          confidence: 0.92,
        }),
      ),
    ).toEqual({
      intent: "pipeline_overview",
      period: "current_quarter",
      confidence: 0.92,
    });
  });

  it("rejects model output that tries to provide business arithmetic", () => {
    expect(
      parsePlannerModelOutput(
        JSON.stringify({
          intent: "pipeline_overview",
          confidence: 0.9,
          openPipelineValue: 999999999,
        }),
      ),
    ).toBeNull();
  });

  it("rejects malformed or prose-wrapped model output", () => {
    expect(parsePlannerModelOutput("Here is the answer: {}")) .toBeNull();
  });
});
