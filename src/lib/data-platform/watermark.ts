import { createHash } from "node:crypto";
import type { BusinessDataSnapshot } from "@/lib/business-data";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function calculateSourceWatermark(snapshot: BusinessDataSnapshot): string {
  const payload = {
    deals: [...snapshot.deals].sort((a, b) => a.mondayItemId.localeCompare(b.mondayItemId)),
    workOrders: [...snapshot.workOrders].sort((a, b) => a.mondayItemId.localeCompare(b.mondayItemId)),
    normalizationIssues: [...snapshot.normalizationIssues].sort((a, b) =>
      [a.entityType, a.entityId ?? "", a.field ?? "", a.code, a.message].join("|")
        .localeCompare([b.entityType, b.entityId ?? "", b.field ?? "", b.code, b.message].join("|")),
    ),
  };
  const serialized = JSON.stringify(canonicalize(payload));
  return `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
}
