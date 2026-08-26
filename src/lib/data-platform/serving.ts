import "server-only";

import { loadLiveBusinessData, type BusinessDataSnapshot } from "@/lib/business-data";
import type { DataServingMode, TemporalSnapshotStore } from "./contracts";
import { createPostgresTemporalSnapshotStore } from "./postgres";
import { loadBusinessDataFromTemporalStore } from "./serving-core";

const DEFAULT_WORKSPACE_KEY = "skylark-command";
const DEFAULT_STALE_AFTER_MINUTES = 60;

interface ServingOptions {
  mode?: DataServingMode;
  store?: TemporalSnapshotStore;
  liveLoader?: () => Promise<BusinessDataSnapshot>;
  workspaceKey?: string;
  now?: Date;
  staleAfterMs?: number;
}

export function resolveDataServingMode(value = process.env.SKYLARK_DATA_MODE): DataServingMode {
  if (value === "temporal_preferred" || value === "temporal_only") return value;
  return "live";
}

function staleAfterMsFromEnvironment(): number {
  const configured = Number(process.env.SKYLARK_STALE_AFTER_MINUTES);
  const minutes = Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_STALE_AFTER_MINUTES;
  return minutes * 60 * 1000;
}

export function loadBusinessDataForAnalytics(options: ServingOptions = {}): Promise<BusinessDataSnapshot> {
  const mode = options.mode ?? resolveDataServingMode();
  const liveLoader = options.liveLoader ?? (() => loadLiveBusinessData());

  if (mode === "live") return liveLoader();

  return loadBusinessDataFromTemporalStore({
    mode,
    store: options.store ?? createPostgresTemporalSnapshotStore(),
    liveLoader,
    workspaceKey: options.workspaceKey ?? process.env.SKYLARK_WORKSPACE_KEY?.trim() ?? DEFAULT_WORKSPACE_KEY,
    now: options.now ?? new Date(),
    staleAfterMs: options.staleAfterMs ?? staleAfterMsFromEnvironment(),
  });
}
