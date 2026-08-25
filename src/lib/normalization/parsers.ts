import type { MondayItem } from "../monday/types";

export interface ParsedValue<T> {
  value: T | null;
  invalid: boolean;
  raw: string | null;
}

export function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || /^(null|undefined|nan|n\/a)$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function parseNullableNumber(value: string | null | undefined): ParsedValue<number> {
  const text = normalizeText(value);
  if (text === null) {
    return { value: null, invalid: false, raw: null };
  }

  const normalized = text.replace(/,/g, "").replace(/^[₹$]\s*/, "").trim();
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) {
    return { value: null, invalid: true, raw: text };
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return { value: null, invalid: true, raw: text };
  }
  return { value: parsed, invalid: false, raw: text };
}

export function parseIsoDate(value: string | null | undefined): ParsedValue<string> {
  const text = normalizeText(value);
  if (text === null) {
    return { value: null, invalid: false, raw: null };
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    return { value: null, invalid: true, raw: text };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return valid
    ? { value: text, invalid: false, raw: text }
    : { value: null, invalid: true, raw: text };
}

export function columnText(item: MondayItem, columnId: string): string | null {
  return normalizeText(item.column_values.find((column) => column.id === columnId)?.text);
}

export function splitQualityFlags(value: string | null | undefined): string[] {
  const text = normalizeText(value);
  if (!text) return [];
  return [...new Set(text.split(/[|;\n]+/).map((part) => part.trim()).filter(Boolean))];
}

export function isHeaderLikeName(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return [
    "name",
    "deal name",
    "client name",
    "customer name",
    "work order",
    "work order name",
    "serial",
    "serial number",
  ].includes(normalized);
}
