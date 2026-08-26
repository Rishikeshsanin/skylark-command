import { afterEach, describe, expect, it, vi } from "vitest";
import { observeExplanationProvider, observePlanningProvider } from "./observed-providers";

afterEach(() => vi.restoreAllMocks());

describe("observed providers", () => {
  it("records planning provider fallback without logging the prompt", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const provider = observePlanningProvider({
      name: "gemini",
      model: "test-model",
      async propose() { throw new Error("provider unavailable"); },
    });
    await expect(provider!.propose({ message: "sensitive founder prompt" })).rejects.toThrow();
    const output = String(warn.mock.calls[0]?.[0]);
    expect(output).toContain("provider_fallback");
    expect(output).toContain("AI_PROVIDER");
    expect(output).not.toContain("sensitive founder prompt");
  });

  it("records unknown provider tool names as hallucination rejection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const provider = observePlanningProvider({
      name: "gemini",
      model: "test-model",
      async propose() { return { kind: "tool_call", call: { tool: "deleteEverything", args: {} } }; },
    });
    await provider!.propose({ message: "pipeline" });
    expect(String(warn.mock.calls[0]?.[0])).toContain("copilot.tool_hallucination_rejected");
  });

  it("records explanation provider fallback without input payloads", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const provider = observeExplanationProvider({
      name: "gemini",
      model: "test-model",
      async explain() { throw new Error("gemini timeout"); },
    });
    await expect(provider!.explain({} as never)).rejects.toThrow();
    expect(String(warn.mock.calls[0]?.[0])).toContain("provider_fallback");
  });
});
