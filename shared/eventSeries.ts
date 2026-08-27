export const REPEAT_INTERVALS = ["weekly", "biweekly", "monthly"] as const;
export type RepeatInterval = (typeof REPEAT_INTERVALS)[number];

export const REPEAT_INTERVAL_LABELS: Record<RepeatInterval, string> = {
  weekly: "Cada semana",
  biweekly: "Cada 2 semanas",
  monthly: "Cada mes",
};

export function isRepeatInterval(value: string): value is RepeatInterval {
  return (REPEAT_INTERVALS as readonly string[]).includes(value);
}

/** Desplaza una fecha de evento (ISO) N intervalos, conservando la hora. */
export function shiftEventDate(iso: string, interval: RepeatInterval, steps: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || steps === 0) return iso;
  if (interval === "weekly") d.setDate(d.getDate() + 7 * steps);
  else if (interval === "biweekly") d.setDate(d.getDate() + 14 * steps);
  else d.setMonth(d.getMonth() + steps);
  return d.toISOString();
}

export function startOfLocalWeek(now: Date = new Date()): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);
  return start;
}

export function isInLocalWeek(value: string | Date, now: Date = new Date()): boolean {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return false;
  const start = startOfLocalWeek(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return d >= start && d < end;
}
