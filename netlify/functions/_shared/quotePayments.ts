import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { quotePayments, quotes } from "../../../db/schema";
import {
  paymentsFromQuoteInput,
  sumPayments,
} from "../../../shared/quoteLifecycle";
import type { QuotePaymentInput } from "../../../shared/types";
import { now } from "./http";

export function mapPayment(row: {
  id: number;
  amount: number;
  paidAt: Date;
  method: QuotePaymentInput["method"];
  notes: string | null;
}): QuotePaymentInput & { id: number } {
  return {
    id: row.id,
    amount: row.amount,
    paidAt: row.paidAt.toISOString(),
    method: row.method,
    notes: row.notes,
  };
}

export async function paymentsForQuote(quoteId: number): Promise<Array<QuotePaymentInput & { id: number }>> {
  const rows = await db
    .select()
    .from(quotePayments)
    .where(eq(quotePayments.quoteId, quoteId));
  return rows
    .slice()
    .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime())
    .map(mapPayment);
}

export async function paymentsByQuoteIds(
  quoteIds: number[],
): Promise<Map<number, Array<QuotePaymentInput & { id: number }>>> {
  const map = new Map<number, Array<QuotePaymentInput & { id: number }>>();
  for (const id of quoteIds) map.set(id, []);
  if (quoteIds.length === 0) return map;
  const rows = await db.select().from(quotePayments);
  for (const row of rows) {
    const list = map.get(row.quoteId);
    if (!list) continue;
    list.push(mapPayment(row));
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  }
  return map;
}

export async function replaceQuotePayments(
  quoteId: number,
  body: { payments?: unknown; depositAmount?: unknown },
): Promise<number> {
  const parsed = paymentsFromQuoteInput(body);
  await db.delete(quotePayments).where(eq(quotePayments.quoteId, quoteId));
  for (const pay of parsed) {
    await db.insert(quotePayments).values({
      quoteId,
      amount: pay.amount,
      paidAt: new Date(pay.paidAt),
      method: pay.method,
      notes: pay.notes ?? null,
      createdAt: now(),
    });
  }
  const depositAmount = sumPayments(parsed);
  await db
    .update(quotes)
    .set({ depositAmount, updatedAt: now() })
    .where(eq(quotes.id, quoteId));
  return depositAmount;
}
