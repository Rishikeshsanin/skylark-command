import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

const workspaceDataScope = new AsyncLocalStorage<string>();

export function currentWorkspaceDataScope(): string | undefined {
  return workspaceDataScope.getStore();
}

export function withWorkspaceDataScope<T>(
  workspaceKey: string | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  return workspaceKey ? workspaceDataScope.run(workspaceKey, operation) : operation();
}
