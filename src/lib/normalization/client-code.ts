import { normalizeText } from "./parsers";

/**
 * Maps Work Order customer codes onto the Deals client namespace.
 * Examples: WOCOMPANY_002 -> COMPANY002, COMPANY_002 -> COMPANY002.
 * Unknown formats are preserved (upper-cased/trimmed) instead of guessed.
 */
export function normalizeClientCode(value: string | null | undefined): string | null {
  const text = normalizeText(value);
  if (!text) return null;

  const upper = text.toUpperCase().replace(/\s+/g, "");
  const known = /^(?:WO)?COMPANY[_-]?(\d+)$/.exec(upper);
  if (known) {
    return `COMPANY${known[1].padStart(3, "0")}`;
  }

  return upper;
}
