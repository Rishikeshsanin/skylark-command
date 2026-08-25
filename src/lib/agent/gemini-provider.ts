import "server-only";

import { z } from "zod";
import { ExternalTimeoutError } from "@/lib/server/errors";
import { withTimeout } from "@/lib/server/timeout";
import { MAX_MODEL_OUTPUT_CHARS } from "./schemas";
import {
  executiveExplanationJsonSchema,
  executiveExplanationSchema,
  type ExecutiveExplanationInput,
  type ExecutiveExplanationProvider,
} from "./explanation";
import {
  buildExplanationPrompt,
  EXECUTIVE_EXPLANATION_SYSTEM_PROMPT,
} from "./untrusted-data";

export const GEMINI_EXECUTIVE_MODEL = "gemini-2.5-flash-lite";
const GEMINI_TIMEOUT_MS = 6_500;
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EXECUTIVE_MODEL}:generateContent`;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type ExecutiveProviderErrorCode =
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "AI_UPSTREAM_ERROR"
  | "AI_REQUEST_REJECTED"
  | "AI_INVALID_RESPONSE";

export class ExecutiveProviderError extends Error {
  readonly code: ExecutiveProviderErrorCode;

  constructor(code: ExecutiveProviderErrorCode) {
    super("The executive explanation provider could not produce a safe explanation.");
    this.name = "ExecutiveProviderError";
    this.code = code;
  }
}

const geminiResponseSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            content: z
              .object({
                parts: z
                  .array(z.object({ text: z.string() }).passthrough())
                  .min(1),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

export function resolveGeminiApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const preferred = env.GEMINI_API_KEY?.trim();
  if (preferred) return preferred;
  const compatible = env.AI_API_KEY?.trim();
  return compatible || null;
}

export function providerErrorCode(error: unknown): ExecutiveProviderErrorCode {
  return error instanceof ExecutiveProviderError
    ? error.code
    : "AI_UPSTREAM_ERROR";
}

interface GeminiProviderOptions {
  apiKey?: string | null;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export function createGeminiExplanationProvider(
  options: GeminiProviderOptions = {},
): ExecutiveExplanationProvider | null {
  const apiKey = options.apiKey ?? resolveGeminiApiKey();
  if (!apiKey) return null;

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? GEMINI_TIMEOUT_MS;

  return {
    name: "gemini",
    model: GEMINI_EXECUTIVE_MODEL,
    async explain(input: ExecutiveExplanationInput) {
      let response: Response;
      try {
        response = await withTimeout(
          (signal) =>
            fetchImpl(GEMINI_ENDPOINT, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-goog-api-key": apiKey,
              },
              signal,
              body: JSON.stringify({
                system_instruction: {
                  parts: [{ text: EXECUTIVE_EXPLANATION_SYSTEM_PROMPT }],
                },
                contents: [
                  {
                    role: "user",
                    parts: [{ text: buildExplanationPrompt(input) }],
                  },
                ],
                generationConfig: {
                  temperature: 0.2,
                  maxOutputTokens: 700,
                  responseMimeType: "application/json",
                  responseSchema: executiveExplanationJsonSchema,
                },
              }),
            }),
          timeoutMs,
          "Gemini",
        );
      } catch (error) {
        if (error instanceof ExternalTimeoutError) {
          throw new ExecutiveProviderError("AI_TIMEOUT");
        }
        throw new ExecutiveProviderError("AI_UPSTREAM_ERROR");
      }

      if (response.status === 429) {
        throw new ExecutiveProviderError("AI_RATE_LIMITED");
      }
      if (response.status >= 500) {
        throw new ExecutiveProviderError("AI_UPSTREAM_ERROR");
      }
      if (!response.ok) {
        throw new ExecutiveProviderError("AI_REQUEST_REJECTED");
      }

      let responseJson: unknown;
      try {
        responseJson = await response.json();
      } catch {
        throw new ExecutiveProviderError("AI_INVALID_RESPONSE");
      }

      const parsedResponse = geminiResponseSchema.safeParse(responseJson);
      if (!parsedResponse.success) {
        throw new ExecutiveProviderError("AI_INVALID_RESPONSE");
      }

      const raw = parsedResponse.data.candidates[0].content.parts
        .map((part) => part.text)
        .join("")
        .trim();
      if (!raw || raw.length > MAX_MODEL_OUTPUT_CHARS) {
        throw new ExecutiveProviderError("AI_INVALID_RESPONSE");
      }

      let parsedExplanation: unknown;
      try {
        parsedExplanation = JSON.parse(raw);
      } catch {
        throw new ExecutiveProviderError("AI_INVALID_RESPONSE");
      }

      const validated = executiveExplanationSchema.safeParse(parsedExplanation);
      if (!validated.success) {
        throw new ExecutiveProviderError("AI_INVALID_RESPONSE");
      }

      return validated.data;
    },
  };
}
