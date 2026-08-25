import { describe, expect, it } from "vitest";
import {
  buildDeterministicFallbackExplanation,
  executiveExplanationSchema,
} from "./explanation";

describe("executive explanation schema", () => {
  it("accepts concise qualitative structured prose", () => {
    const parsed = executiveExplanationSchema.safeParse({
      headline: "Pipeline requires attention",
      executiveSummary: "The deterministic result supports focused commercial review.",
      observations: ["The structured metrics remain authoritative."],
      risks: [],
      attentionItems: ["Review the priority records."],
      followUpQuestions: ["Would you like a sector view?"],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects numeric prose so the model cannot become a metric source", () => {
    const parsed = executiveExplanationSchema.safeParse({
      headline: "Pipeline requires attention",
      executiveSummary: "The pipeline is worth 688152293.17.",
      observations: [],
      risks: [],
      attentionItems: [],
      followUpQuestions: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("produces a deterministic fallback without numeric claims", () => {
    const fallback = buildDeterministicFallbackExplanation(
      { intent: "pipeline_overview", confidence: 1 },
      { data: { metric: 123 }, caveats: ["A caveat exists."] },
    );
    expect(executiveExplanationSchema.safeParse(fallback).success).toBe(true);
    expect(JSON.stringify(fallback)).not.toMatch(/[0-9]/);
  });
});
