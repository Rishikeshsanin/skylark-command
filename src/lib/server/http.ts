import type { ZodType } from "zod";
import { PublicApiError } from "./errors";

async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new PublicApiError(
      413,
      "REQUEST_TOO_LARGE",
      "The request body is too large.",
    );
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new PublicApiError(
        413,
        "REQUEST_TOO_LARGE",
        "The request body is too large.",
      );
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(combined);
}

export async function parseJsonRequest<T>(
  request: Request,
  schema: ZodType<T>,
  maxBytes: number,
): Promise<T> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new PublicApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be application/json.",
    );
  }

  const raw = await readBodyWithLimit(request, maxBytes);
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new PublicApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const messageTooLong = parsed.error.issues.some(
      (issue) => issue.path[0] === "message" && issue.code === "too_big",
    );
    if (messageTooLong) {
      throw new PublicApiError(
        413,
        "MESSAGE_TOO_LONG",
        "The message exceeds the allowed length.",
      );
    }

    throw new PublicApiError(
      400,
      "INVALID_REQUEST",
      "The request body does not match the expected chat schema.",
    );
  }

  return parsed.data;
}

export function apiResponseHeaders(
  requestId: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    "x-request-id": requestId,
    "cache-control": "no-store, max-age=0",
    ...extra,
  };
}
