import {
  aggregateClientMoney,
  quoteBalance,
  quoteMargin,
} from "../shared/quoteLifecycle";
import type { QuoteStatus } from "../shared/types";
import { quoteTaxBreakdown, type CompanySettings } from "./settings";

export function quoteMoney(
  q: { total: number; depositAmount?: number | null; foodCost?: number | null },
  settings?: CompanySettings,
) {
  const tax = quoteTaxBreakdown(q.total, settings);
  const bal = quoteBalance(tax.total, q.depositAmount ?? 0);
  const margin = quoteMargin(tax.total, q.foodCost ?? 0);
  return { ...tax, ...bal, ...margin };
}

export function clientMoneyFromQuotes(
  quotes: Array<{
    status: QuoteStatus;
    total: number;
    depositAmount?: number | null;
  }>,
  settings?: CompanySettings,
) {
  return aggregateClientMoney(
    quotes.map((q) => {
      const money = quoteMoney(q, settings);
      return { status: q.status, grandTotal: money.total, paid: money.deposit };
    }),
  );
}
