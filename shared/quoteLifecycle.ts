import {
  isPaymentMethod,
  type EventStatus,
  type QuotePaymentInput,
  type QuoteStatus,
} from "./types";

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

export function sumPayments(payments: Array<{ amount: number }>): number {
  return payments.reduce((sum, p) => sum + normalizeDeposit(p.amount), 0);
}

export function quoteBalance(grandTotal: number, deposit: number): {
  deposit: number;
  balance: number;
} {
  const total = Math.max(0, Math.round(grandTotal));
  const paid = Math.min(Math.max(0, Math.round(deposit)), total);
  return { deposit: paid, balance: total - paid };
}

export function quoteMargin(grandTotal: number, foodCost: number): {
  foodCost: number;
  sale: number;
  margin: number;
  marginPct: number | null;
} {
  const sale = Math.max(0, Math.round(grandTotal));
  const cost = Math.max(0, Math.round(foodCost));
  const margin = sale - cost;
  const marginPct = sale > 0 ? Math.round((margin / sale) * 1000) / 10 : null;
  return { foodCost: cost, sale, margin, marginPct };
}

export function aggregateClientMoney(
  rows: Array<{ status: QuoteStatus; grandTotal: number; paid: number }>,
): { billed: number; paid: number; balance: number } {
  const accepted = rows.filter((q) => q.status === "aceptada");
  const billed = accepted.reduce((sum, q) => sum + Math.max(0, Math.round(q.grandTotal)), 0);
  const paid = accepted.reduce((sum, q) => {
    const total = Math.max(0, Math.round(q.grandTotal));
    return sum + Math.min(Math.max(0, Math.round(q.paid)), total);
  }, 0);
  return { billed, paid, balance: Math.max(0, billed - paid) };
}

export function parseQuotePayments(raw: unknown): QuotePaymentInput[] {
  if (!Array.isArray(raw)) return [];
  const out: QuotePaymentInput[] = [];
  for (const item of raw) {
    const row = item as Record<string, unknown>;
    const amount = normalizeDeposit(row.amount);
    if (amount <= 0) continue;
    const paidAtRaw = row.paidAt ?? row.paid_at;
    const paidAtDate = paidAtRaw ? new Date(String(paidAtRaw)) : new Date();
    const paidAt = Number.isNaN(paidAtDate.getTime()) ? new Date().toISOString() : paidAtDate.toISOString();
    const method = isPaymentMethod(row.method) ? row.method : "transferencia";
    const notesRaw = row.notes;
    const notes =
      notesRaw === undefined || notesRaw === null || notesRaw === "" ? null : String(notesRaw);
    const id = Number(row.id);
    out.push({
      ...(Number.isInteger(id) && id > 0 ? { id } : {}),
      amount,
      paidAt,
      method,
      notes,
    });
  }
  return out;
}

/** Si viene la lista de abonos, úsala; si no, el anticipo único se convierte en un pago. */
export function paymentsFromQuoteInput(body: {
  payments?: unknown;
  depositAmount?: unknown;
}): QuotePaymentInput[] {
  if (Array.isArray(body.payments)) return parseQuotePayments(body.payments);
  const amount = normalizeDeposit(body.depositAmount);
  if (amount <= 0) return [];
  return [
    {
      amount,
      paidAt: new Date().toISOString(),
      method: "transferencia",
      notes: "Anticipo",
    },
  ];
}
