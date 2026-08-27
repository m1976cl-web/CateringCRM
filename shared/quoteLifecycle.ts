import type { EventStatus, QuoteStatus } from "./types";

/** Avanza el evento según la cotización, sin tocar realizados ni cancelados. */
export function eventStatusAfterQuote(
  current: EventStatus,
  quoteStatus: QuoteStatus,
): EventStatus {
  if (current === "realizado" || current === "cancelado") return current;
  if (quoteStatus === "aceptada") return "confirmado";
  if (quoteStatus === "enviada" && (current === "borrador" || current === "cotizado")) {
    return "cotizado";
  }
  return current;
}

export function normalizeDeposit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

export function quoteBalance(grandTotal: number, deposit: number): {
  deposit: number;
  balance: number;
} {
  const total = Math.max(0, Math.round(grandTotal));
  const paid = Math.min(Math.max(0, Math.round(deposit)), total);
  return { deposit: paid, balance: total - paid };
}
