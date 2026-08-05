import { asNumber } from "./http";
import type { QuoteItem } from "../../../shared/types";

export function parseItems(raw: unknown): QuoteItem[] | null {
  if (!Array.isArray(raw)) return null;
  const items: QuoteItem[] = [];
  for (const item of raw) {
    const description = String(item.description ?? "").trim();
    const quantity = asNumber(item.quantity, 0);
    const unitPrice = asNumber(item.unitPrice, 0);
    if (!description || quantity <= 0) continue;
    items.push({ description, quantity, unitPrice });
  }
  return items;
}
