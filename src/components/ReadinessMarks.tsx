import type { EventSummary, QuoteSummary } from "../api";
import { readinessChips } from "../../shared/eventReadiness";
import { clientMoneyFromQuotes } from "../quoteDisplay";

export function ReadinessMarks({
  event,
  quotes,
}: {
  event: EventSummary;
  quotes: QuoteSummary[];
}) {
  const money = clientMoneyFromQuotes(quotes.filter((quote) => quote.eventId === event.id));
  const chips = readinessChips({
    status: event.status,
    recipeCount: event.readiness.recipeCount,
    shopping: event.readiness.shopping,
    packingDone: event.readiness.packingDone,
    packingTotal: event.readiness.packingTotal,
    balance: money.billed > 0 ? money.balance : null,
  });
  if (event.status === "cancelado") return null;
  if (chips.length === 0) return <span className="badge tone-good">Listo</span>;
  return (
    <span className="chip-row" style={{ marginTop: 6 }}>
      {chips.map((chip) => (
        <span key={chip.key} className="badge tone-warn">
          {chip.label}
        </span>
      ))}
    </span>
  );
}
