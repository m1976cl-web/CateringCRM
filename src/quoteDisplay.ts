import {
  aggregateClientMoney,
  quoteBalance,
  quoteMargin,
} from "../shared/quoteLifecycle";
import { isInLocalWeek } from "../shared/eventSeries";
import type { EventStatus, QuoteStatus } from "../shared/types";
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

export function collectionsThisWeek<
  T extends { id: number; eventDate: string; status: EventStatus },
>(
  events: T[],
  quotes: Array<{
    eventId: number;
    status: QuoteStatus;
    total: number;
    depositAmount?: number | null;
  }>,
  now: Date = new Date(),
) {
  const items = events
    .filter((ev) => ev.status !== "cancelado" && isInLocalWeek(ev.eventDate, now))
    .map((ev) => {
      const money = clientMoneyFromQuotes(
        quotes.filter((q) => q.eventId === ev.id),
      );
      return { event: ev, ...money };
    })
    .filter((row) => row.balance > 0)
    .sort((a, b) => a.event.eventDate.localeCompare(b.event.eventDate));
  const total = items.reduce((sum, row) => sum + row.balance, 0);
  return { total, items };
}
