import { describe, expect, it, vi } from "vitest";
import {
  chatRequestSchema,
  MAX_REQUEST_BYTES,
} from "@/lib/agent/schemas";
import { mondayQuery } from "@/lib/monday/client";
import { parseJsonRequest } from "./http";

function request(body: string, headers: Record<string, string>) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers,
    body,
  });
}

describe("release security regressions", () => {
  it("accepts application/json with a charset parameter", async () => {
    const parsed = await parseJsonRequest(
      request(JSON.stringify({ message: "How is our pipeline?" }), {
        "content-type": "application/json; charset=utf-8",
      }),
      chatRequestSchema,
      MAX_REQUEST_BYTES,
    );

    expect(parsed).toEqual({ message: "How is our pipeline?" });
  });

  it("rejects a streamed/raw body over the byte limit even when Content-Length is misleading", async () => {
    const oversized = " ".repeat(MAX_REQUEST_BYTES + 1);

    await expect(
      parseJsonRequest(
        request(oversized, {
          "content-type": "application/json",
          "content-length": "1",
        }),
        chatRequestSchema,
        MAX_REQUEST_BYTES,
      ),
    ).rejects.toMatchObject({
      status: 413,
      code: "REQUEST_TOO_LARGE",
    });
  });

  it("blocks monday GraphQL mutations before any network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      mondayQuery("mutation { change_column_value(board_id: 1, item_id: 2) { id } }")
    ).rejects.toMatchObject({ code: "READ_ONLY_VIOLATION" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
