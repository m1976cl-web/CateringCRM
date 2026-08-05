import { EVENT_STATUS_LABELS, QUOTE_STATUS_LABELS, type EventStatus, type QuoteStatus } from "../../shared/types";
import { statusTone } from "../../shared/eventStatus";

export function StatusBadge({ status }: { status: EventStatus }) {
  return <span className={`badge tone-${statusTone(status)}`}>{EVENT_STATUS_LABELS[status]}</span>;
}

export function QuoteBadge({ status }: { status: QuoteStatus }) {
  const tone =
    status === "aceptada"
      ? "good"
      : status === "rechazada"
        ? "danger"
        : status === "enviada"
          ? "info"
          : "neutral";
  return <span className={`badge tone-${tone}`}>{QUOTE_STATUS_LABELS[status]}</span>;
}
