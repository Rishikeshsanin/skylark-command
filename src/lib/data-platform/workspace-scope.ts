import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { PublicApiError } from "@/lib/server/errors";

type WorkspaceRequestScope = {
  workspaceKey: string;
  scenarioAllowed: boolean;
};

const workspaceDataScope = new AsyncLocalStorage<WorkspaceRequestScope>();

export function currentWorkspaceDataScope(): string | undefined {
  return workspaceDataScope.getStore()?.workspaceKey;
}

export function assertCurrentScenarioWorkflowAuthorized(): void {
  const scope = workspaceDataScope.getStore();
  if (scope && !scope.scenarioAllowed) {
    throw new PublicApiError(
      403,
      "SCENARIO_PERMISSION_REQUIRED",
      "Analytical scenarios require the ANALYST role or higher.",
    );
  }
}

export function withWorkspaceDataScope<T>(
  workspaceKey: string | undefined,
  scenarioAllowed: boolean,
  operation: () => Promise<T>,
): Promise<T> {
  return workspaceKey
    ? workspaceDataScope.run({ workspaceKey, scenarioAllowed }, operation)
    : operation();
}
