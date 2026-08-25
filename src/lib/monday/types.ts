export interface MondayColumnValue {
  id: string;
  type: string;
  text: string;
  value: string | null;
}

export interface MondayItem {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
}

export interface MondayBoardItemsPage {
  boardId: string;
  boardName: string;
  items: MondayItem[];
}

export interface MondayGraphQLErrorShape {
  message?: string;
  extensions?: Record<string, unknown>;
}

export interface MondayGraphQLResponse<T> {
  data?: T;
  errors?: MondayGraphQLErrorShape[];
}

export interface MondayClientOptions {
  timeoutMs?: number;
  maxRetries?: number;
  pageSize?: number;
}
