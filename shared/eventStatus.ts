import { EVENT_STATUS_LABELS, type EventStatus } from "./types";

export function statusLabel(status: EventStatus): string {
  return EVENT_STATUS_LABELS[status];
}

export function statusTone(status: EventStatus): "neutral" | "info" | "good" | "warn" | "danger" {
  switch (status) {
    case "borrador":
      return "neutral";
    case "cotizado":
      return "info";
    case "confirmado":
      return "good";
    case "realizado":
      return "neutral";
    case "cancelado":
      return "danger";
    default:
      return "neutral";
  }
}
