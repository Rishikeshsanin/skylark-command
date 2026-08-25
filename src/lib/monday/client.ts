import "server-only";

import { MondayApiError } from "./errors";
import type {
  MondayBoardItemsPage,
  MondayClientOptions,
  MondayGraphQLResponse,
  MondayItem,
} from "./types";

const MONDAY_API_URL = "https://api.monday.com/v2";
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

const BOARD_ITEMS_QUERY = `
  query BoardItems($boardIds: [ID!], $limit: Int!, $cursor: String) {
    boards(ids: $boardIds) {
      id
      name
      items_page(limit: $limit, cursor: $cursor) {
        cursor
        items {
          id
          name
          column_values {
            id
            type
            text
            value
          }
        }
      }
    }
  }
`;

interface BoardItemsQueryData {
  boards: Array<{
    id: string;
    name: string;
    items_page: {
      cursor: string | null;
      items: MondayItem[];
    };
  }>;
}

export interface MondayEnvironment {
  token: string;
  dealsBoardId: string;
  workOrdersBoardId: string;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new MondayApiError(
      "CONFIGURATION_ERROR",
      `Missing required server environment variable: ${name}`,
    );
  }
  return value;
}

function validateBoardId(value: string, name: string): string {
  if (!/^\d+$/.test(value)) {
    throw new MondayApiError(
      "CONFIGURATION_ERROR",
      `${name} must contain a numeric monday.com board ID.`,
    );
  }
  return value;
}

export function getMondayEnvironment(): MondayEnvironment {
  return {
    token: getRequiredEnv("MONDAY_API_TOKEN"),
    dealsBoardId: validateBoardId(
      getRequiredEnv("MONDAY_DEALS_BOARD_ID"),
      "MONDAY_DEALS_BOARD_ID",
    ),
    workOrdersBoardId: validateBoardId(
      getRequiredEnv("MONDAY_WORK_ORDERS_BOARD_ID"),
      "MONDAY_WORK_ORDERS_BOARD_ID",
    ),
  };
}

function assertReadOnlyQuery(query: string): void {
  if (/\bmutation\b/i.test(query)) {
    throw new MondayApiError(
      "READ_ONLY_VIOLATION",
      "Skylark Command's monday.com client only permits GraphQL queries.",
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGraphQLError(errors: Array<{ message?: string; extensions?: Record<string, unknown> }>): boolean {
  return errors.some((error) => {
    const message = error.message?.toLowerCase() ?? "";
    const statusCode = error.extensions?.status_code;
    return (
      message.includes("rate limit") ||
      message.includes("temporar") ||
      statusCode === 429 ||
      (typeof statusCode === "number" && statusCode >= 500)
    );
  });
}

function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds * 1000, 5_000);
  }
  return Math.min(250 * 2 ** attempt, 2_000);
}

export async function mondayQuery<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: Pick<MondayClientOptions, "timeoutMs" | "maxRetries"> = {},
): Promise<T> {
  assertReadOnlyQuery(query);

  const { token } = getMondayEnvironment();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(MONDAY_API_URL, {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
        cache: "no-store",
      });

      let payload: MondayGraphQLResponse<T>;
      try {
        payload = (await response.json()) as MondayGraphQLResponse<T>;
      } catch (error) {
        throw new MondayApiError(
          "INVALID_RESPONSE",
          "monday.com returned a non-JSON response.",
          { status: response.status, retryable: response.status >= 500, cause: error },
        );
      }

      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          await sleep(retryDelayMs(attempt, response.headers.get("retry-after")));
          continue;
        }
        throw new MondayApiError(
          response.status === 429 ? "RATE_LIMITED" : "UPSTREAM_ERROR",
          response.status === 429
            ? "monday.com rate limit was reached."
            : "monday.com is temporarily unavailable.",
          { status: response.status, retryable: true },
        );
      }

      if (!response.ok) {
        throw new MondayApiError(
          "UPSTREAM_ERROR",
          "monday.com request failed.",
          { status: response.status, retryable: false },
        );
      }

      if (payload.errors?.length) {
        const retryable = isRetryableGraphQLError(payload.errors);
        if (retryable && attempt < maxRetries) {
          await sleep(retryDelayMs(attempt, null));
          continue;
        }
        throw new MondayApiError(
          retryable ? "UPSTREAM_ERROR" : "INVALID_RESPONSE",
          "monday.com returned a GraphQL error.",
          { status: response.status, retryable },
        );
      }

      if (payload.data === undefined || payload.data === null) {
        throw new MondayApiError(
          "INVALID_RESPONSE",
          "monday.com response did not contain data.",
          { status: response.status },
        );
      }

      return payload.data;
    } catch (error) {
      if (error instanceof MondayApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        if (attempt < maxRetries) {
          await sleep(retryDelayMs(attempt, null));
          continue;
        }
        throw new MondayApiError(
          "TIMEOUT",
          "monday.com request timed out.",
          { retryable: true, cause: error },
        );
      }

      if (attempt < maxRetries) {
        await sleep(retryDelayMs(attempt, null));
        continue;
      }

      throw new MondayApiError(
        "UPSTREAM_ERROR",
        "Unable to reach monday.com.",
        { retryable: true, cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new MondayApiError("UPSTREAM_ERROR", "monday.com request failed.");
}

export async function fetchBoardItems(
  boardId: string,
  options: MondayClientOptions = {},
): Promise<MondayBoardItemsPage> {
  validateBoardId(boardId, "boardId");
  const limit = Math.min(Math.max(options.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const items: MondayItem[] = [];
  let cursor: string | null = null;
  let boardName = "";

  do {
    const data = await mondayQuery<BoardItemsQueryData>(
      BOARD_ITEMS_QUERY,
      { boardIds: [boardId], limit, cursor },
      options,
    );

    const board = data.boards?.[0];
    if (!board || !board.items_page || !Array.isArray(board.items_page.items)) {
      throw new MondayApiError(
        "INVALID_RESPONSE",
        "monday.com board response was missing expected item data.",
      );
    }

    boardName = board.name;
    items.push(...board.items_page.items);
    cursor = board.items_page.cursor;
  } while (cursor);

  return { boardId, boardName, items };
}

export async function fetchDealsBoardItems(
  options?: MondayClientOptions,
): Promise<MondayBoardItemsPage> {
  const { dealsBoardId } = getMondayEnvironment();
  return fetchBoardItems(dealsBoardId, options);
}

export async function fetchWorkOrdersBoardItems(
  options?: MondayClientOptions,
): Promise<MondayBoardItemsPage> {
  const { workOrdersBoardId } = getMondayEnvironment();
  return fetchBoardItems(workOrdersBoardId, options);
}

export async function fetchSkylarkSourceBoards(options?: MondayClientOptions): Promise<{
  deals: MondayBoardItemsPage;
  workOrders: MondayBoardItemsPage;
}> {
  const [deals, workOrders] = await Promise.all([
    fetchDealsBoardItems(options),
    fetchWorkOrdersBoardItems(options),
  ]);
  return { deals, workOrders };
}
