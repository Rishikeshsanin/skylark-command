import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsDispatcher } from "./analytics-adapter";
import type { ExecutiveExplanationProvider } from "./explanation";
import { orchestrateFounderQuestion } from "./orchestrator";

const source = {
  provider: "monday.com" as const,
  boardIds: ["deals", "work-orders"],
  fetchedAt: "2026-08-25T00:00:00.000Z",
};

const generatedExplanation = {
  headline: "Pipeline needs executive review",
  executiveSummary:
    "The deterministic pipeline result indicates meaningful commercial exposure and should be reviewed with the supplied caveats.",
  observations: ["The structured analytics remain authoritative."],
  risks: [],
  attentionItems: ["Review the deterministic priority records."],
  followUpQuestions: ["Would you like a stage-level view?"],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("orchestrateFounderQuestion", () => {
  it("returns clarification without invoking analytics or the LLM", async () => {
    const dispatcher: AnalyticsDispatcher = vi.fn(async () => ({
      result: { data: {}, caveats: [] },
      source,
    }));
    const provider: ExecutiveExplanationProvider = {
      name: "gemini",
      model: "test-model",
      explain: vi.fn(async () => generatedExplanation),
    };

    const response = await orchestrateFounderQuestion(
      "Who are our best customers?",
      dispatcher,
      provider,
    );

    expect(response.ok).toBe(true);
    expect(response.clarification?.required).toBe(true);
    expect(dispatcher).not.toHaveBeenCalled();
    expect(provider.explain).not.toHaveBeenCalled();
  });

  it("adds model prose without changing deterministic metrics", async () => {
    const deterministicData = {
      sentinelMetric: 688152293.17,
      nested: { value: 987 },
    };
    const dispatcher: AnalyticsDispatcher = vi.fn(async () => ({
      result: {
        data: deterministicData,
        caveats: ["Source contains missing values."],
      },
      source,
    }));
    const provider: ExecutiveExplanationProvider = {
      name: "gemini",
      model: "test-model",
      explain: vi.fn(async () => generatedExplanation),
    };

    const response = await orchestrateFounderQuestion(
      "How is our pipeline looking?",
      dispatcher,
      provider,
    );

    expect(response.ok).toBe(true);
    expect(response.data).toBe(deterministicData);
    expect(response.data).toEqual({
      sentinelMetric: 688152293.17,
      nested: { value: 987 },
    });
    expect(response.explanation).toEqual(generatedExplanation);
    expect(response.answer).toBe(generatedExplanation.executiveSummary);
    expect(response.caveats).toEqual(["Source contains missing values."]);
    expect(response.source).toEqual(source);
  });

  it("falls back deterministically when no provider is configured", async () => {
    const deterministicData = { sentinelMetric: 42 };
    const dispatcher: AnalyticsDispatcher = vi.fn(async () => ({
      result: { data: deterministicData, caveats: [] },
      source,
    }));

    const response = await orchestrateFounderQuestion(
      "How is our pipeline looking?",
      dispatcher,
      null,
    );

    expect(response.data).toBe(deterministicData);
    expect(response.explanation?.executiveSummary).toContain(
      "deterministic analytics",
    );
    expect(JSON.stringify(response.explanation)).not.toMatch(/[0-9]/);
  });

  it("falls back safely and never logs provider secrets", async () => {
    const dispatcher: AnalyticsDispatcher = vi.fn(async () => ({
      result: { data: { sentinelMetric: 42 }, caveats: [] },
      source,
    }));
    const providerSecretName = ["GEMINI", "API", "KEY"].join("_");
    const placeholderSecret = "placeholder-secret-key";
    const provider: ExecutiveExplanationProvider = {
      name: "gemini",
      model: "test-model",
      explain: vi.fn(async () => {
        throw new Error(`provider failed with ${providerSecretName}=${placeholderSecret}`);
      }),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await orchestrateFounderQuestion(
      "How is our pipeline looking?",
      dispatcher,
      provider,
      "request-safe",
    );

    expect(response.ok).toBe(true);
    expect(response.explanation?.executiveSummary).toContain(
      "external explanation layer was unavailable",
    );
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = warn.mock.calls.map((call) => call.join(" ")).join(" ");
    expect(logged).toContain("AI_UPSTREAM_ERROR");
    expect(logged).toContain("request-safe");
    expect(logged).not.toContain(placeholderSecret);
    expect(logged).not.toContain(`${providerSecretName}=`);
  });
});
