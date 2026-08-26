import { AsyncLocalStorage } from "node:async_hooks";

export interface TelemetryContext {
  requestId?: string;
  route?: string;
  workspaceKey?: string;
  syncId?: string;
}

const storage = new AsyncLocalStorage<TelemetryContext>();

export function runWithTelemetryContext<T>(context: TelemetryContext, fn: () => T): T {
  const parent = storage.getStore() ?? {};
  return storage.run({ ...parent, ...context }, fn);
}

export function getTelemetryContext(): TelemetryContext {
  return storage.getStore() ?? {};
}
