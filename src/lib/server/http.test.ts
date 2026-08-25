import { describe, expect, it } from "vitest";
import {
  chatRequestSchema,
  MAX_REQUEST_BYTES,
} from "@/lib/agent/schemas";
import { parseJsonRequest } from "./http";

function request(body: unknown, contentType = "application/json") {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("parseJsonRequest", () => {
  it("accepts a valid strict chat payload", async () => {
    await expect(
      parseJsonRequest(
        request({ message: "How is the pipeline?" }),
        chatRequestSchema,
        MAX_REQUEST_BYTES,
      ),
    ).resolves.toEqual({ message: "How is the pipeline?" });
  });

  it("rejects non-JSON content types", async () => {
    await expect(
      parseJsonRequest(
        request({ message: "hello" }, "text/plain"),
        chatRequestSchema,
        MAX_REQUEST_BYTES,
      ),
    ).rejects.toMatchObject({
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
  });

  it("rejects malformed JSON", async () => {
    await expect(
      parseJsonRequest(
        request("{not json"),
        chatRequestSchema,
        MAX_REQUEST_BYTES,
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: "INVALID_JSON",
    });
  });

  it("rejects oversized messages", async () => {
    await expect(
      parseJsonRequest(
        request({ message: "x".repeat(2_001) }),
        chatRequestSchema,
        MAX_REQUEST_BYTES,
      ),
    ).rejects.toMatchObject({
      status: 413,
      code: "MESSAGE_TOO_LONG",
    });
  });

  it("rejects unexpected request keys", async () => {
    await expect(
      parseJsonRequest(
        request({ message: "hello", arbitraryGraphql: "mutation {}" }),
        chatRequestSchema,
        MAX_REQUEST_BYTES,
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: "INVALID_REQUEST",
    });
  });
});
