import 'server-only';
import type { MondayItem } from './types';

const endpoint = 'https://api.monday.com/v2';
type ColumnValue = { text: string | null; column?: { title?: string | null } | null };
type RawItem = { id: string; name: string; column_values: ColumnValue[] };

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: env('MONDAY_API_TOKEN'), 'Content-Type': 'application/json', 'API-Version': process.env.MONDAY_API_VERSION || '2026-04' },
      body: JSON.stringify({ query, variables }), cache: 'no-store', signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Monday API returned ${response.status}`);
    const body = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (body.errors?.length) throw new Error(`Monday API: ${body.errors[0].message}`);
    if (!body.data) throw new Error('Monday API returned no data');
    return body.data;
  } finally { clearTimeout(timer); }
}

function mapItem(item: RawItem): MondayItem {
  const fields: Record<string, string> = {};
  for (const value of item.column_values || []) {
    const title = value.column?.title;
    if (title) fields[title] = value.text ?? '';
  }
  return { id: item.id, name: item.name, fields };
}

export async function fetchBoardItems(boardId: string): Promise<MondayItem[]> {
  const first = await graphql<{ boards: Array<{ items_page: { cursor: string | null; items: RawItem[] } }> }>(
    `query ($ids: [ID!]!) { boards(ids: $ids) { items_page(limit: 500) { cursor items { id name column_values { text column { title } } } } } }`, { ids: [boardId] });
  const page = first.boards[0]?.items_page;
  if (!page) throw new Error(`Monday board ${boardId} was not accessible`);
  const items = [...page.items]; let cursor = page.cursor;
  while (cursor) {
    const next = await graphql<{ next_items_page: { cursor: string | null; items: RawItem[] } }>(
      `query ($cursor: String!) { next_items_page(limit: 500, cursor: $cursor) { cursor items { id name column_values { text column { title } } } } }`, { cursor });
    items.push(...next.next_items_page.items); cursor = next.next_items_page.cursor;
  }
  return items.map(mapItem);
}

export async function fetchBusinessData() {
  const [deals, workOrders] = await Promise.all([
    fetchBoardItems(env('MONDAY_DEALS_BOARD_ID')),
    fetchBoardItems(env('MONDAY_WORK_ORDERS_BOARD_ID')),
  ]);
  return { deals, workOrders };
}
