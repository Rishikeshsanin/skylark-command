import type { BusinessDataSnapshot } from "@/lib/business-data";
import type { CopilotFollowUp } from "./conversation-routing";

export type GroundedEntityKind = "sector" | "stage" | "client";

export interface EntityResolution {
  kind: GroundedEntityKind;
  requested: string;
  canonical?: string;
  source: "exact" | "alias" | "no_match";
  candidates: string[];
}

const ENTITY_ALIASES: Record<GroundedEntityKind, Readonly<Record<string, string>>> = {
  sector: {},
  stage: {},
  client: {},
};

const GENERIC_ENTITY_WORDS = new Set([
  "a",
  "an",
  "the",
  "our",
  "this",
  "that",
  "which",
  "what",
  "largest",
  "biggest",
  "available",
  "current",
  "all",
  "show",
  "me",
  "is",
  "are",
  "how",
  "performance",
]);

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))]
    .sort((a, b) => a.localeCompare(b));
}

export function canonicalEntityValues(
  snapshot: BusinessDataSnapshot,
  kind: GroundedEntityKind,
): string[] {
  if (kind === "sector") {
    return uniqueSorted([
      ...snapshot.deals.map((deal) => deal.sector),
      ...snapshot.workOrders.map((workOrder) => workOrder.sector),
    ]);
  }
  if (kind === "stage") {
    return uniqueSorted(snapshot.deals.map((deal) => deal.stage));
  }
  return uniqueSorted([
    ...snapshot.deals.map((deal) => deal.normalizedClientKey),
    ...snapshot.workOrders.map((workOrder) => workOrder.normalizedClientKey),
  ]);
}

function cleanCandidate(value: string): string | null {
  const words = value
    .replace(/^["']|["']$/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  while (words.length && GENERIC_ENTITY_WORDS.has(normalize(words[0]))) words.shift();
  while (words.length && GENERIC_ENTITY_WORDS.has(normalize(words.at(-1) ?? ""))) words.pop();

  const candidate = words.join(" ").trim();
  return candidate ? candidate : null;
}

function extractExplicitMention(
  message: string,
): { kind: GroundedEntityKind; value: string } | null {
  const idLikeCustomer = /\b(?:company|customer|client)[_-]?\d+\b/i.exec(message)?.[0];
  if (idLikeCustomer) return { kind: "client", value: idLikeCustomer };

  const quotedCustomer = /\b(?:customer|client)\s+["']([^"']{1,80})["']/i.exec(message)?.[1];
  if (quotedCustomer) return { kind: "client", value: quotedCustomer };

  const customerBefore = /\b([a-z0-9][a-z0-9_-]{2,40})\s+(?:customer|client)\b/i.exec(message)?.[1];
  if (customerBefore && !GENERIC_ENTITY_WORDS.has(normalize(customerBefore))) {
    return { kind: "client", value: customerBefore };
  }

  const customerAfter = /\b(?:customer|client)\s+([a-z0-9][a-z0-9_-]{2,40})\b/i.exec(message)?.[1];
  if (
    customerAfter &&
    !GENERIC_ENTITY_WORDS.has(normalize(customerAfter)) &&
    !/^(?:analysis|overview|performance|health|data)$/i.test(customerAfter)
  ) {
    return { kind: "client", value: customerAfter };
  }

  const sectorRaw = /\b([a-z][a-z0-9&/-]*(?:\s+[a-z0-9&/-]+){0,3})\s+sector\b/i.exec(message)?.[1];
  if (sectorRaw) {
    const sector = cleanCandidate(sectorRaw);
    if (sector && !GENERIC_ENTITY_WORDS.has(normalize(sector))) {
      return { kind: "sector", value: sector };
    }
  }

  const stageAfter = /\bstage\s+["']?([a-z][a-z0-9&/-]*(?:\s+[a-z0-9&/-]+){0,2})["']?/i.exec(message)?.[1];
  if (stageAfter) {
    const stage = cleanCandidate(stageAfter);
    if (stage && !GENERIC_ENTITY_WORDS.has(normalize(stage))) return { kind: "stage", value: stage };
  }

  const stageBefore = /\b([a-z][a-z0-9&/-]*(?:\s+[a-z0-9&/-]+){0,2})\s+stage\b/i.exec(message)?.[1];
  if (stageBefore) {
    const stage = cleanCandidate(stageBefore);
    if (stage && !GENERIC_ENTITY_WORDS.has(normalize(stage))) return { kind: "stage", value: stage };
  }

  return null;
}

function editDistance(a: string, b: string): number {
  const left = normalize(a);
  const right = normalize(b);
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j < current.length; j += 1) previous[j] = current[j];
  }
  return previous[right.length];
}

function candidateSuggestions(requested: string, values: string[]): string[] {
  const requestedNormalized = normalize(requested);
  return values
    .map((value) => {
      const normalized = normalize(value);
      const distance = editDistance(requestedNormalized, normalized);
      const similarity = 1 - distance / Math.max(requestedNormalized.length, normalized.length, 1);
      const prefix = requestedNormalized.length >= 3 && normalized.startsWith(requestedNormalized.slice(0, 3));
      return { value, similarity, prefix };
    })
    .filter(({ similarity, prefix }) => similarity >= 0.58 || prefix)
    .sort((a, b) => b.similarity - a.similarity || a.value.localeCompare(b.value))
    .slice(0, 3)
    .map(({ value }) => value);
}

export function resolveExplicitEntity(
  message: string,
  snapshot: BusinessDataSnapshot,
): EntityResolution | null {
  const mention = extractExplicitMention(message);
  if (!mention) return null;

  const values = canonicalEntityValues(snapshot, mention.kind);
  const requested = mention.value.trim();
  const exact = values.find((value) => normalize(value) === normalize(requested));
  if (exact) {
    return {
      kind: mention.kind,
      requested,
      canonical: exact,
      source: "exact",
      candidates: [],
    };
  }

  const aliasTarget = ENTITY_ALIASES[mention.kind][normalize(requested)];
  if (aliasTarget) {
    const canonical = values.find((value) => normalize(value) === normalize(aliasTarget));
    if (canonical) {
      return {
        kind: mention.kind,
        requested,
        canonical,
        source: "alias",
        candidates: [],
      };
    }
  }

  return {
    kind: mention.kind,
    requested,
    source: "no_match",
    candidates: candidateSuggestions(requested, values),
  };
}

function entityLabel(kind: GroundedEntityKind): string {
  return kind === "client" ? "customer" : kind;
}

export function noMatchFollowUps(resolution: EntityResolution): CopilotFollowUp[] {
  const suggested = resolution.candidates.map((candidate) => {
    if (resolution.kind === "sector") {
      return {
        label: `Use ${candidate}`,
        query: `How is the ${candidate} sector performing?`,
      };
    }
    if (resolution.kind === "stage") {
      return {
        label: `Use ${candidate}`,
        query: `Show pipeline for the ${candidate} stage.`,
      };
    }
    return {
      label: `Open ${candidate}`,
      query: `Show customer ${candidate}.`,
    };
  });

  if (resolution.kind === "sector") {
    suggested.push({ label: "Show available sectors", query: "Show available sectors." });
  } else if (resolution.kind === "stage") {
    suggested.push({ label: "Show pipeline by stage", query: "Show pipeline by stage." });
  } else {
    suggested.push({ label: "Review pipeline", query: "How is our pipeline looking?" });
  }
  return suggested.slice(0, 4);
}

export function noMatchAnswer(resolution: EntityResolution): string {
  const label = entityLabel(resolution.kind);
  const base = `No exact ${label} named "${resolution.requested}" exists in the current canonical data.`;
  if (!resolution.candidates.length) return base;
  return `${base} I found ${resolution.candidates.length === 1 ? "this grounded candidate" : "these grounded candidates"}: ${resolution.candidates.join(", ")}.`;
}
