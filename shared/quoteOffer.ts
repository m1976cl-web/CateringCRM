export const OFFER_TIME_ZONE = "America/Santiago";
export const DEFAULT_QUOTE_VALIDITY_DAYS = 15;

export function calendarDay(value: string | Date, timeZone = OFFER_TIME_ZONE): string {
  if (typeof value === "string" && value.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addCalendarDays(from: string | Date, days: number): string {
  const day = calendarDay(from);
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year || 1970, (month || 1) - 1, date || 1));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function validUntilTimestamp(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`);
}

export function resolveValidUntil(
  input: unknown,
  quoteDate: Date,
  days = DEFAULT_QUOTE_VALIDITY_DAYS,
): Date {
  if (typeof input === "string" && input.trim()) {
    const day = input.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return validUntilTimestamp(day);
  }
  return validUntilTimestamp(addCalendarDays(quoteDate, days));
}

export function isQuoteOfferOpen(
  validUntil: string | Date | null | undefined,
  now = new Date(),
): boolean {
  if (!validUntil) return true;
  const until = calendarDay(validUntil);
  if (!until) return true;
  return until >= calendarDay(now);
}
